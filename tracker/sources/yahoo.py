"""Yahoo Finance chart API: latest price, daily change, volume and 52-week range
for every tracked symbol (indexes, TXSE listings, watchlist, earnings names).
One request per symbol; the raw file holds every response unchanged, keyed by
symbol. Kept: the last 5 trading days per symbol (the smallest range)."""

import datetime as dt
import json
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from ..http import get

NAME = "yahoo_chart"
FORMAT = "json"
URL = "https://query1.finance.yahoo.com/v8/finance/chart/{}?range=5d&interval=1d"


def exchange(full_name: str, instrument: str):
    n = (full_name or "").lower()
    if instrument == "INDEX":
        return "Index"
    if n.startswith("txse"):
        return "TXSE"
    if n.startswith("nasdaq"):
        return "Nasdaq"
    if n.startswith("nyse"):
        return "NYSE"
    return full_name or ""


def fetch_symbol(sym):
    try:
        return sym, json.loads(get(URL.format(urllib.parse.quote(sym))))
    except Exception as e:
        return sym, {"error": str(e)[:200]}


def fetch(ctx):
    with ThreadPoolExecutor(6) as ex:
        got = dict(ex.map(fetch_symbol, ctx["symbols"]))
    raw = json.dumps({"symbols": got}, separators=(",", ":"), sort_keys=True).encode()
    if not parse(raw):
        raise RuntimeError("no symbol returned a price")
    return raw


def parse_one(resp):
    result = ((resp.get("chart") or {}).get("result") or [None])[0]
    if not result:
        return None
    m = result["meta"]
    closes = [c for c in ((result.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
              if c is not None]
    close = m.get("regularMarketPrice") or (closes[-1] if closes else None)
    if close is None:
        return None
    prev = closes[-2] if len(closes) >= 2 else m.get("chartPreviousClose")
    t = m.get("regularMarketTime")
    price_date = (dt.datetime.fromtimestamp(t + (m.get("gmtoffset") or 0), dt.timezone.utc).date().isoformat()
                  if t else "")
    hi = m.get("fiftyTwoWeekHigh")
    return {
        "item": m.get("longName") or m.get("shortName") or m.get("symbol"),
        "exchange": exchange(m.get("fullExchangeName"), m.get("instrumentType")),
        "instrument": m.get("instrumentType", ""),
        "price_date": price_date,
        "close": round(close, 4),
        "change_pct": round((close / prev - 1) * 100, 4) if prev else None,
        "volume": m.get("regularMarketVolume"),
        "high_52w": hi,
        "low_52w": m.get("fiftyTwoWeekLow"),
        "pct_off_high": round((close / hi - 1) * 100, 4) if hi else None,
    }


def parse(raw):
    """{symbol: {...}} for every symbol that returned a price."""
    out = {}
    for sym, resp in json.loads(raw)["symbols"].items():
        row = parse_one(resp) if "error" not in resp else None
        if row:
            out[sym] = row
    return out


def count(raw):
    return len(parse(raw))
