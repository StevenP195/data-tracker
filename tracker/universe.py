"""Which symbols a run asks the price and analyst sources for.

    indexes + every TXSE listing + the watchlist + this week's EARNINGS_TOP_N
    largest earnings reporters

The list is decided from the TXSE and earnings raw files, and the price source's
raw file records exactly which symbols were asked for, so the build never needs
anything but the raw files.
"""

from . import config
from .sources import nasdaq_earnings


def pool(txse_parsed=None, earnings_parsed=None):
    txse_ids = list((txse_parsed or {}).get("items", {})) or config.TXSE_FALLBACK
    earnings = nasdaq_earnings.top(earnings_parsed or {}, config.EARNINGS_TOP_N)
    seen, out = set(), []
    for s in [*config.INDEXES, *txse_ids, *config.WATCHLIST, *earnings]:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def txse_common(txse_parsed=None, yahoo_parsed=None):
    """TXSE-listed common stocks (for the Yahoo analyst source)."""
    items = (txse_parsed or {}).get("items", {})
    if items:
        return sorted(i for i, l in items.items() if l["security_type"] == "common_stock" and i not in config.INDEXES)
    return sorted(s for s, q in (yahoo_parsed or {}).items()
                  if q["exchange"] == "TXSE" and q["instrument"] == "EQUITY" and "-" not in s)


def analyst_symbols(symbols, txse_parsed=None):
    """Common stocks only: no indexes, ETFs or preferreds."""
    items = (txse_parsed or {}).get("items", {})
    out = []
    for s in symbols:
        if s in config.INDEXES or s.startswith("^") or "-" in s:
            continue
        if s in items and items[s]["security_type"] != "common_stock":
            continue
        out.append(s)
    return out
