"""TXSE official listings feed: every security listed on the Texas Stock Exchange
with its official closing price. Served by the public content API behind txse.com.
Kept: the whole feed (it is small: about 25 listings)."""

import json
import urllib.parse

from ..http import get

NAME = "txse_listings"
FORMAT = "json"
SANITY = "https://mne48td4.apicdn.sanity.io/v2023-05-03/data/query/production?query="
URL = SANITY + urllib.parse.quote('*[_type=="allListingsFeed"][0]')

TYPE_LABEL = {"preferred_stock": "preferred", "trust_preferred": "trust preferred"}


def item_id(listing):
    """TXSE 'CFR' + suffix 'PRB' -> 'CFR-PB' (the Yahoo-style symbol, so an item
    keeps the same id whichever source reports it)."""
    sym, suffix = listing["symbol"], listing.get("suffix") or ""
    if suffix.startswith("PR"):
        return f"{sym}-P{suffix[2:]}"
    return f"{sym}-{suffix}" if suffix else sym


def fetch(ctx):
    raw = get(URL)
    if not parse(raw)["items"]:
        raise RuntimeError("TXSE feed returned no listings")
    return raw


def parse(raw):
    doc = json.loads(raw)["result"] or {}
    items = {}
    for l in doc.get("listings", []):
        iid = item_id(l)
        name = l.get("securityName") or l.get("issuer") or iid
        if l.get("securityType") in TYPE_LABEL:
            name = f"{name} ({TYPE_LABEL[l['securityType']]})"
        items[iid] = {
            "item_id": iid, "item": name, "symbol": l["symbol"],
            "close": l.get("closingPrice"), "security_type": l.get("securityType", ""),
            "listing_type": l.get("type", ""),
        }
    return {"as_of": doc.get("asOf", ""), "items": items}


def count(raw):
    return len(parse(raw)["items"])
