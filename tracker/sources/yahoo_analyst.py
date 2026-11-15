"""Yahoo Finance analyst data for TXSE-listed common stocks (Nasdaq's analyst
API has no records for TXSE-primary listings such as CFR). Consensus price
target, buy/hold/sell counts, the current quarter's EPS estimate with revisions
over the last 30 days, the latest earnings surprise, and the next earnings date.

Yahoo needs a session cookie and a "crumb" token for this endpoint; both are
public and need no login. One request per symbol; the raw file holds every
response unchanged, keyed by symbol."""

import datetime as dt
import gzip
import http.cookiejar
import json
import urllib.error
import urllib.request

from ..http import UA

NAME = "yahoo_analyst"
FORMAT = "json"
MODULES = "financialData,recommendationTrend,earningsTrend,earningsHistory,calendarEvents"
URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=" + MODULES + "&crumb={}"


def _opener():
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", UA), ("Accept", "*/*")]
    try:
        op.open("https://fc.yahoo.com/", timeout=20).read()
    except urllib.error.HTTPError:
        pass  # a 404 still sets the session cookie
    crumb = op.open("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=20).read().decode().strip()
    if not crumb or "<" in crumb or len(crumb) > 40:
        raise RuntimeError("could not get a Yahoo crumb")
    return op, crumb


def fetch(ctx):
    symbols = ctx["symbols"]
    if not symbols:
        raise RuntimeError("no TXSE common stocks to look up")
    op, crumb = _opener()
    got = {}
    for sym in symbols:
        try:
            with op.open(URL.format(sym, crumb), timeout=30) as r:
                body = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                got[sym] = json.loads(body)
        except Exception as e:
            got[sym] = {"error": str(e)[:200]}
    raw = json.dumps({"symbols": got}, separators=(",", ":"), sort_keys=True).encode()
    if not parse(raw):
        raise RuntimeError("no symbol returned analyst data")
    return raw


def _raw(d, k):
    v = (d or {}).get(k)
    return v.get("raw") if isinstance(v, dict) else v


def parse_one(resp):
    result = ((resp.get("quoteSummary") or {}).get("result") or [None])[0]
    if not result:
        return {}
    row = {}
    fd = result.get("financialData") or {}
    if _raw(fd, "targetMeanPrice"):
        row["target_price"] = round(float(_raw(fd, "targetMeanPrice")), 4)
    trend = ((result.get("recommendationTrend") or {}).get("trend") or [])
    now = next((t for t in trend if t.get("period") == "0m"), None)
    if now:
        row.update(analysts_buy=float((now.get("strongBuy") or 0) + (now.get("buy") or 0)),
                   analysts_hold=float(now.get("hold") or 0),
                   analysts_sell=float((now.get("sell") or 0) + (now.get("strongSell") or 0)))
    q = next((t for t in (result.get("earningsTrend") or {}).get("trend") or [] if t.get("period") == "0q"), None)
    if q:
        end = q.get("endDate") or ""
        row["eps_qtr"] = dt.date.fromisoformat(end).strftime("%b %Y") if end else ""
        row["eps_forecast"] = _raw(q.get("earningsEstimate"), "avg")
        rev = q.get("epsRevisions") or {}
        row["eps_revisions_up"] = _raw(rev, "upLast30days")
        row["eps_revisions_down"] = _raw(rev, "downLast30days")
    hist = (result.get("earningsHistory") or {}).get("history") or []
    hist = [h for h in hist if _raw(h, "surprisePercent") is not None]
    if hist:
        latest = max(hist, key=lambda h: _raw(h, "quarter") or 0)
        row["last_surprise_pct"] = round(_raw(latest, "surprisePercent") * 100, 4)
    dates = ((result.get("calendarEvents") or {}).get("earnings") or {}).get("earningsDate") or []
    if dates and isinstance(dates[0], dict) and dates[0].get("raw"):
        row["next_earnings"] = dt.datetime.fromtimestamp(dates[0]["raw"], dt.timezone.utc).date().isoformat()
    return {k: v for k, v in row.items() if v not in (None, "")}


def parse(raw):
    """{symbol: {...}} for every symbol with any analyst data."""
    out = {}
    for sym, resp in json.loads(raw)["symbols"].items():
        row = parse_one(resp) if "error" not in resp else {}
        if row:
            out[sym] = row
    return out


def count(raw):
    return len(parse(raw))
