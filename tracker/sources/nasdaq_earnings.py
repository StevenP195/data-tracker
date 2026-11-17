"""Nasdaq earnings calendar for the week of the run (Monday to Friday; a weekend
run looks at the coming week). One request per weekday; the raw file holds the
five responses keyed by date, in Nasdaq's own JSON structure.
Kept: Nasdaq returns every company reporting that week (300-500 rows); the raw
file keeps only the rows the tracker uses: the EARNINGS_TOP_N largest by market
cap across the week, plus any other tracked symbol (watchlist, TXSE, indexes)
that reports that week. Everything else in each response is kept unchanged."""

import copy
import datetime as dt
import json

from .. import config
from ..http import get
from . import num

NAME = "nasdaq_earnings"
FORMAT = "json"
URL = "https://api.nasdaq.com/api/calendar/earnings?date={}"
TIME = {"time-pre-market": "before open", "time-after-hours": "after close"}


def week_dates(date: str):
    d = dt.date.fromisoformat(date)
    monday = d - dt.timedelta(days=d.weekday()) if d.weekday() < 5 else d + dt.timedelta(days=7 - d.weekday())
    return [(monday + dt.timedelta(days=i)).isoformat() for i in range(5)]


def fetch(ctx):
    days, errors = {}, []
    for d in week_dates(ctx["date"]):
        try:
            days[d] = json.loads(get(URL.format(d)))
        except Exception as e:  # one bad day still keeps the others
            errors.append(f"{d}: {e}")
    if not days:
        raise RuntimeError("; ".join(errors) or "no days returned")
    doc = trim({"week": week_dates(ctx["date"]), "days": days})
    return json.dumps(doc, separators=(",", ":"), sort_keys=True).encode()


def trim(doc, n=None, tracked=None):
    """Keep only the rows the tracker uses (see the module docstring)."""
    n = config.EARNINGS_TOP_N if n is None else n
    tracked = set(tracked if tracked is not None else
                  [*config.INDEXES, *config.WATCHLIST, *config.TXSE_FALLBACK, *config.HOUSTON_OF])
    keep = set(top(parse(json.dumps(doc).encode()), n)) | tracked
    out = copy.deepcopy(doc)
    for resp in out["days"].values():
        data = (resp or {}).get("data") or {}
        if data.get("rows"):
            data["rows"] = [r for r in data["rows"] if r.get("symbol") in keep]
    return out


def parse(raw):
    """{symbol: {...}} for every company reporting that week."""
    doc = json.loads(raw)
    out = {}
    for d in sorted(doc["days"]):
        for r in ((doc["days"][d] or {}).get("data") or {}).get("rows") or []:
            cap = num(r.get("marketCap"))
            out[r["symbol"]] = {
                "symbol": r["symbol"], "name": r.get("name", ""),
                "earnings_date": d, "earnings_time": TIME.get(r.get("time"), ""),
                "market_cap_b": round(cap / 1e9, 2) if cap else None,
                "cal_eps_forecast": num(r.get("epsForecast")),
            }
    return out


def top(parsed, n):
    """The n largest reporters by market cap (ties by symbol)."""
    ranked = sorted((r for r in parsed.values() if r["market_cap_b"]),
                    key=lambda r: (-r["market_cap_b"], r["symbol"]))
    return [r["symbol"] for r in ranked[:n]]


def count(raw):
    return len(parse(raw))
