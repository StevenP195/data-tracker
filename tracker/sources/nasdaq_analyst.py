"""Nasdaq analyst data for every tracked common stock: consensus price target and
buy/hold/sell counts, next-quarter EPS forecast with estimate revisions over the
last 4 weeks, and the latest earnings surprise. Three requests per symbol; the
raw file holds every response unchanged, keyed by symbol and endpoint.
Kept: the consensus overview, the next quarter's forecast row and the latest
surprise row (the historical series in the responses are not used).
Nasdaq has no analyst data for TXSE-primary listings (e.g. CFR since Nov 12, 2026)."""

import json
from concurrent.futures import ThreadPoolExecutor

from ..http import get
from . import num

NAME = "nasdaq_analyst"
FORMAT = "json"
ENDPOINTS = {
    "targetprice": "https://api.nasdaq.com/api/analyst/{}/targetprice",
    "earnings_forecast": "https://api.nasdaq.com/api/analyst/{}/earnings-forecast",
    "earnings_surprise": "https://api.nasdaq.com/api/company/{}/earnings-surprise",
}


def fetch_symbol(sym):
    out = {}
    for key, url in ENDPOINTS.items():
        try:
            out[key] = json.loads(get(url.format(sym)))
        except Exception as e:
            out[key] = {"error": str(e)[:200]}
    return sym, out


def fetch(ctx):
    with ThreadPoolExecutor(4) as ex:
        got = dict(ex.map(fetch_symbol, ctx["symbols"]))
    raw = json.dumps({"symbols": got}, separators=(",", ":"), sort_keys=True).encode()
    if ctx["symbols"] and not parse(raw):
        raise RuntimeError("no symbol returned analyst data")
    return raw


def _data(resp):
    return (resp or {}).get("data") or {}


def parse_one(resp):
    row = {}
    c = _data(resp.get("targetprice")).get("consensusOverview") or {}
    if c.get("priceTarget"):
        row.update(target_price=num(c["priceTarget"]), analysts_buy=num(c.get("buy")),
                   analysts_hold=num(c.get("hold")), analysts_sell=num(c.get("sell")))
    q = ((_data(resp.get("earnings_forecast")).get("quarterlyForecast") or {}).get("rows") or [])
    if q:
        row.update(eps_qtr=q[0].get("fiscalEnd", ""), eps_forecast=num(q[0].get("consensusEPSForecast")),
                   eps_revisions_up=num(q[0].get("up")), eps_revisions_down=num(q[0].get("down")))
    s = ((_data(resp.get("earnings_surprise")).get("earningsSurpriseTable") or {}).get("rows") or [])
    if s:
        row["last_surprise_pct"] = num(s[0].get("percentageSurprise"))
    return row


def parse(raw):
    """{symbol: {...}} for every symbol with any analyst data."""
    out = {}
    for sym, resp in json.loads(raw)["symbols"].items():
        row = parse_one(resp)
        if row:
            out[sym] = row
    return out


def count(raw):
    return len(parse(raw))
