"""Conversion of each source's raw file to plain records / common columns."""

from tracker.sources import nasdaq_analyst, nasdaq_earnings, num, txse, txse_short, yahoo, yahoo_analyst

from .conftest import SHORT_CSV, earnings_raw, nasdaq_analyst_raw, txse_raw, yahoo_analyst_raw, yahoo_raw


def test_num():
    assert num("$1,234.50") == 1234.5
    assert num("-3.2") == -3.2
    assert num(7) == 7.0
    assert num("") is None and num("N/A") is None and num(None) is None and num("abc") is None


def test_txse_listings():
    p = txse.parse(txse_raw())
    assert p["as_of"] == "2026-11-13"
    assert set(p["items"]) == {"CFR", "CFR-PB", "TXS"}
    assert p["items"]["CFR"]["close"] == 158.17
    assert p["items"]["CFR-PB"]["item"] == "Cullen/Frost Bankers, Inc. (preferred)"
    assert p["items"]["TXS"]["item"] == "Texas Capital Texas Equity Index ETF"  # ETPs use the fund name
    assert txse.count(txse_raw()) == 3


def test_txse_item_id_matches_yahoo_symbols():
    assert txse.item_id({"symbol": "ET", "suffix": "PRI"}) == "ET-PI"
    assert txse.item_id({"symbol": "DDT"}) == "DDT"


def test_txse_short_interest():
    p = txse_short.parse(SHORT_CSV)
    assert set(p) == {"CFR", "DDS"}  # header skipped, quoted comma handled
    assert p["CFR"] == {"settlement_date": "2026-10-30", "short_interest": 1500000.0, "short_prev": 1000000.0,
                        "days_to_cover": 3.0, "short_change_pct": 50.0}


def test_earnings_week_dates():
    assert nasdaq_earnings.week_dates("2026-11-18") == [
        "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]
    # a weekend run looks at the coming week
    assert nasdaq_earnings.week_dates("2026-11-15")[0] == "2026-11-16"
    assert nasdaq_earnings.week_dates("2026-11-14")[0] == "2026-11-16"


def test_earnings_parse_and_top():
    p = nasdaq_earnings.parse(earnings_raw())
    assert p["NVDA"]["earnings_date"] == "2026-11-17"
    assert p["NVDA"]["earnings_time"] == "after close"
    assert p["HD"]["earnings_time"] == "before open"
    assert p["NVDA"]["market_cap_b"] == 4005.18
    assert p["TINY"]["market_cap_b"] is None
    assert nasdaq_earnings.top(p, 1) == ["NVDA"]
    assert nasdaq_earnings.top(p, 10) == ["NVDA", "HD"]  # no market cap -> never ranked


def test_yahoo_chart():
    p = yahoo.parse(yahoo_raw())
    assert "BAD" not in p  # a failed symbol gives no record
    n = p["NVDA"]
    assert n["close"] == 162.85 and n["exchange"] == "Nasdaq"
    assert n["change_pct"] == round((162.85 / 160 - 1) * 100, 4)
    assert n["price_date"] == "2026-11-13"  # market time in New York, not UTC
    assert p["^GSPC"]["exchange"] == "Index"
    assert p["CFR"]["exchange"] == "TXSE"


def test_yahoo_exchange_names():
    assert yahoo.exchange("NasdaqGS", "EQUITY") == "Nasdaq"
    assert yahoo.exchange("NYSE American", "EQUITY") == "NYSE"
    assert yahoo.exchange("TXSE", "ETF") == "TXSE"
    assert yahoo.exchange("SNP", "INDEX") == "Index"


def test_nasdaq_analyst():
    p = nasdaq_analyst.parse(nasdaq_analyst_raw())
    assert set(p) == {"NVDA"}  # CFR has no Nasdaq records
    assert p["NVDA"] == {"target_price": 250.0, "analysts_buy": 40.0, "analysts_hold": 5.0, "analysts_sell": 1.0,
                         "eps_qtr": "Jan 2027", "eps_forecast": 2.49, "eps_revisions_up": 1.0,
                         "eps_revisions_down": 3.0, "last_surprise_pct": -2.5}


def test_yahoo_analyst():
    p = yahoo_analyst.parse(yahoo_analyst_raw())
    c = p["CFR"]
    assert c["target_price"] == 173.8571
    assert (c["analysts_buy"], c["analysts_hold"], c["analysts_sell"]) == (5.0, 9.0, 1.0)
    assert c["eps_qtr"] == "Dec 2026" and c["eps_forecast"] == 2.90186
    assert (c["eps_revisions_up"], c["eps_revisions_down"]) == (8, 3)
    assert c["last_surprise_pct"] == 1.21  # the latest quarter, in percent
    assert c["next_earnings"] == "2026-11-18"


def test_earnings_raw_keeps_only_tracked_rows():
    import json
    doc = json.loads(earnings_raw())
    small = nasdaq_earnings.trim(doc, n=1, tracked=["HD"])
    kept = nasdaq_earnings.parse(json.dumps(small).encode())
    assert set(kept) == {"NVDA", "HD"}          # the top 1 by market cap, plus a tracked symbol
    assert nasdaq_earnings.top(kept, 1) == nasdaq_earnings.top(nasdaq_earnings.parse(earnings_raw()), 1)
    assert set(small["days"]) == set(doc["days"])   # the response structure is unchanged
