"""TXSE short interest report (published twice a month): the latest CSV file.
The newest file's address is looked up in the same public TXSE content API.
Kept: the whole file (one row per TXSE security)."""

import csv
import io
import json
import urllib.parse

from ..http import get
from . import num
from .txse import SANITY

NAME = "txse_short_interest"
FORMAT = "csv"
LATEST = SANITY + urllib.parse.quote(
    '*[_type=="shortInterestReport" && defined(fileUrl)]|order(settlementDate desc)[0]{fileUrl,settlementDate}')


def fetch(ctx):
    meta = json.loads(get(LATEST))["result"]
    if not meta or not meta.get("fileUrl"):
        raise RuntimeError("no short interest report listed")
    raw = get(meta["fileUrl"], accept="text/csv, */*")
    if not parse(raw):
        raise RuntimeError("short interest file has no rows")
    return raw


def parse(raw):
    """{symbol: {...}} keyed by the report's symbol code."""
    out = {}
    for r in csv.reader(io.StringIO(raw.decode("utf-8-sig"))):
        if len(r) < 13 or not r[0].strip().isdigit():
            continue  # header or blank line
        out[r[1].strip()] = {
            "settlement_date": f"{r[0][:4]}-{r[0][4:6]}-{r[0][6:8]}",
            "short_interest": num(r[5]),
            "short_prev": num(r[6]),
            "days_to_cover": num(r[9]),
            "short_change_pct": num(r[11]),
        }
    return out


def count(raw):
    return len(parse(raw))
