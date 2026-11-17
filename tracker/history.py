"""Build data/history.csv from the raw files alone.

Day by day, the raw files of that day are converted into one row per item with
the common columns (config.HISTORY_COLUMNS). A day with no raw file for a source
has no rows from that source. Rows are sorted by date, then item_id. Running the
build again gives the same file, and a change to a rule applies to every day.

Which source a row comes from (the `source` column):
  * txse         the item is a TXSE listing: its close is TXSE's official close.
                 Volume, daily change and 52-week range are added from Yahoo
                 when Yahoo has the symbol that day.
  * yahoo_chart  every other item (indexes, watchlist, earnings names).
Analyst, earnings and short interest columns are joined in from their sources
by symbol; a value a source does not report that day is left empty. Analyst
columns come from Nasdaq first, then Yahoo (which covers TXSE listings).
"""

import csv
import gzip
from pathlib import Path

from . import config
from .sources import BY_NAME, nasdaq_earnings

PRICE_FIELDS = ["exchange", "price_date", "close", "change_pct", "volume", "high_52w", "low_52w",
                "pct_off_high"]


def raw_days(raw_dir: Path):
    """{date: {source_name: path}} for every raw file, dates sorted."""
    days = {}
    if not raw_dir.exists():
        return days
    for day in sorted(p for p in raw_dir.iterdir() if p.is_dir()):
        files = {f.name.split(".")[0]: f for f in sorted(day.glob("*.gz"))}
        if files:
            days[day.name] = files
    return days


def read_raw(path: Path) -> bytes:
    with gzip.open(path, "rb") as f:
        return f.read()


def signals(r):
    """The four flags (config.SIGNALS) an item carries on a day."""
    out = []
    if r.get("earnings_date"):
        out.append("Earnings this week")
    up = r.get("upside_pct")
    buy, hold, sell = (r.get(k) or 0 for k in ("analysts_buy", "analysts_hold", "analysts_sell"))
    total = buy + hold + sell
    if up is not None and up >= config.RISE_MIN_UPSIDE and total and buy >= total / 2:
        out.append("Expected to rise")
    short_jump = (r.get("short_change_pct") or 0) >= config.SHORT_JUMP_PCT
    if (up is not None and up <= config.FALL_MAX_UPSIDE) or (total and sell > buy) or short_jump:
        out.append("Expected to fall")
    if (r.get("eps_revisions_down") or 0) > (r.get("eps_revisions_up") or 0):
        out.append("Below expectations")
    return out


def day_rows(date: str, raw_files: dict):
    """raw_files: {source_name: bytes} for one day -> list of row dicts."""
    P = {name: BY_NAME[name].parse(raw) for name, raw in raw_files.items() if name in BY_NAME}
    tx = P.get("txse_listings")
    short = P.get("txse_short_interest") or {}
    earn = P.get("nasdaq_earnings") or {}
    yh = P.get("yahoo_chart") or {}
    an = P.get("nasdaq_analyst") or {}
    ya = P.get("yahoo_analyst") or {}
    top = set(nasdaq_earnings.top(earn, config.EARNINGS_TOP_N))
    week = set(nasdaq_earnings.week_dates(date))

    rows = {}
    for sym, q in yh.items():
        rows[sym] = {"item_id": sym, "item": config.INDEXES.get(sym) or q["item"], "source": "yahoo_chart",
                     "_common": q["instrument"] == "EQUITY" and "-" not in sym,
                     **{k: q[k] for k in PRICE_FIELDS}}
    if tx:
        for iid, l in tx["items"].items():
            r = rows.get(iid) or {"item_id": iid}
            r.update(item=config.INDEXES.get(iid) or l["item"], source="txse", exchange="TXSE",
                     price_date=tx["as_of"], close=l["close"],
                     _common=l["security_type"] == "common_stock")
            if r["close"] is not None and r.get("high_52w"):
                r["pct_off_high"] = round((r["close"] / r["high_52w"] - 1) * 100, 4)
            rows[iid] = r

    for iid, r in rows.items():
        if iid in config.INDEXES:
            r["group"] = "Index"
        elif r.get("exchange") == "TXSE":
            r["group"] = "TXSE"
        elif iid in config.WATCHLIST:
            r["group"] = "Watchlist"
        elif iid in top:
            r["group"] = "Earnings this week"
        else:
            r["group"] = "Watchlist"
        e = earn.get(iid)
        if e:
            r.update(earnings_date=e["earnings_date"], earnings_time=e["earnings_time"],
                     market_cap_b=e["market_cap_b"])
        r.update(an.get(iid, {}))
        y = ya.get(iid, {})
        for k, v in y.items():  # Yahoo fills what Nasdaq does not report
            if k != "next_earnings" and r.get(k) is None:
                r[k] = v
        if not r.get("earnings_date") and y.get("next_earnings") in week:
            r["earnings_date"] = y["next_earnings"]
        if r.get("target_price") and r.get("close"):
            r["upside_pct"] = round((r["target_price"] / r["close"] - 1) * 100, 4)
        if r.get("exchange") == "TXSE" and r.pop("_common", False) and iid in short:
            s = short[iid]
            r.update(short_interest=s["short_interest"], short_change_pct=s["short_change_pct"],
                     days_to_cover=s["days_to_cover"])
        r.pop("_common", None)
        r["houston"] = config.HOUSTON_OF.get(iid, "")
        r["signals"] = "; ".join(signals(r))
        r["date"] = date
    return [rows[k] for k in sorted(rows)]


def build(raw_dir: Path = None):
    out = []
    for date, files in raw_days(raw_dir or config.RAW).items():
        out += day_rows(date, {name: read_raw(p) for name, p in files.items()})
    return sorted(out, key=lambda r: (r["date"], r["item_id"]))


def fmt(v):
    if v is None:
        return ""
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        s = format(round(v, 4), "f").rstrip("0").rstrip(".")
        return "0" if s == "-0" else s
    return str(v)


def write_csv(rows, path: Path = None):
    path = path or config.HISTORY
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=config.HISTORY_COLUMNS, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: fmt(r.get(k)) for k in config.HISTORY_COLUMNS})


def read_csv(path: Path = None):
    path = path or config.HISTORY
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))
