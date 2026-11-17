"""Paths, tracked items, and the rules that pick and flag them.

Everything the pipeline tracks is set here, so a change to a rule is one edit,
and rebuilding the history applies it to every day.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
RUNS = DATA / "runs"          # one record per run day: every source's ok / count / error
HISTORY = DATA / "history.csv"
STATUS = DATA / "status.json"

NOTIFY_USER = "StevenP195"

# ---- items -----------------------------------------------------------------
# The four markets. TXSE has no index of its own yet, so the Texas Capital
# Texas Equity Index ETF (TXS, listed on TXSE) stands in for it.
INDEXES = {
    "^GSPC": "S&P 500",
    "^IXIC": "Nasdaq Composite",
    "^NYA": "NYSE Composite",
    "TXS": "TXSE: Texas Equity Index ETF",
}

# Large companies tracked every day (Nasdaq and NYSE bellwethers, Houston energy).
WATCHLIST = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META",   # Nasdaq
    "JPM", "BAC", "GS", "WFC",                          # NYSE banks
    "XOM", "CVX", "COP", "SLB", "KMI", "HAL",           # NYSE energy (Houston-heavy)
]

# Used only when the TXSE listings feed fails that day, so TXSE prices are still
# requested from Yahoo. The real list always comes from the TXSE feed.
TXSE_FALLBACK = [
    "CECO", "CFR", "CFR-PB", "CTAG", "DDS", "DDT", "ET", "ET-PI", "FIFT", "IBOC", "ICOM",
    "ILS", "OBK", "OILT", "PWRX", "SCHW", "SUN", "SUNC", "THRU", "TXCP", "TXCP-PB", "TXS",
    "USAC", "WSLS", "WTAL",
]

# The N largest companies (by market cap) reporting earnings in the week of the run.
EARNINGS_TOP_N = 15

# ---- signal rules ----------------------------------------------------------
RISE_MIN_UPSIDE = 25.0       # % below the consensus price target ...
                             # ... and buy ratings at least half of all ratings
FALL_MAX_UPSIDE = 0.0        # trading at or above the consensus target, or sells > buys
SHORT_JUMP_PCT = 25.0        # TXSE common stock whose short position grew this much
SIGNALS = ["Earnings this week", "Expected to rise", "Expected to fall", "Below expectations"]

# ---- moves -----------------------------------------------------------------
TOP_MOVES = 10               # how many biggest moves the issue and Today page list

# ---- history file ----------------------------------------------------------
HISTORY_COLUMNS = [
    "date", "item_id", "item", "source",
    "exchange", "group", "signals", "price_date",
    "close", "change_pct", "volume", "high_52w", "low_52w", "pct_off_high",
    "target_price", "upside_pct", "analysts_buy", "analysts_hold", "analysts_sell",
    "eps_qtr", "eps_forecast", "eps_revisions_up", "eps_revisions_down", "last_surprise_pct",
    "earnings_date", "earnings_time", "market_cap_b",
    "short_interest", "short_change_pct", "days_to_cover",
]
NUMERIC_COLUMNS = [
    "close", "change_pct", "volume", "high_52w", "low_52w", "pct_off_high",
    "target_price", "upside_pct", "analysts_buy", "analysts_hold", "analysts_sell",
    "eps_forecast", "eps_revisions_up", "eps_revisions_down", "last_surprise_pct",
    "market_cap_b", "short_interest", "short_change_pct", "days_to_cover",
]
