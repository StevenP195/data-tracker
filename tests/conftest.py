"""Small hand-made raw files, shaped exactly like each source's real responses."""

import json

import pytest


def dumps(x):
    return json.dumps(x).encode()


def txse_raw(cfr_close=158.17, extra=()):
    listings = [
        {"_key": "CFR", "symbol": "CFR", "issuer": "Cullen/Frost Bankers, Inc.", "closingPrice": cfr_close,
         "securityType": "common_stock", "type": "Corporate"},
        {"_key": "CFR-PRB", "symbol": "CFR", "suffix": "PRB", "issuer": "Cullen/Frost Bankers, Inc.",
         "closingPrice": 15.15, "securityType": "preferred_stock", "type": "Corporate"},
        {"_key": "TXS", "symbol": "TXS", "issuer": "Texas Capital Bank", "closingPrice": 42.3,
         "securityName": "Texas Capital Texas Equity Index ETF", "securityType": "etf", "type": "ETP"},
        *extra,
    ]
    return dumps({"result": {"asOf": "2026-11-13", "listings": listings}})


SHORT_CSV = (
    "Settlement Date for Shorts Cycle,Symbol Code,Issue Name,ISG Exchange Code,Exchange Code,"
    "Short Position in the current cycle,Short Position in the previous cycle,Split Indicator,"
    "Average Daily Volume Quantity,Days to Cover Quantity,Revision Indicator,Percent Change,Difference\n"
    "20261030,CFR,Cullen/Frost Bankers,F,TXSE,1500000,1000000,,500000,3.00,,50.00,500000\n"
    '20261030,DDS,"Dillard\'s, Inc. Class A",F,TXSE,612253,614896,,88555,6.91,,-0.43,-2643\n'
).encode()


def earnings_raw(rows_by_date=None):
    rows_by_date = rows_by_date or {
        "2026-11-17": [{"symbol": "NVDA", "name": "NVIDIA", "marketCap": "$4,005,178,900,000",
                        "epsForecast": "$2.49", "time": "time-after-hours"},
                       {"symbol": "HD", "name": "Home Depot", "marketCap": "$347,455,390,000",
                        "epsForecast": "$3.87", "time": "time-pre-market"}],
        "2026-11-18": [{"symbol": "TINY", "name": "Tiny Co", "marketCap": "", "epsForecast": "",
                        "time": "time-not-supplied"}],
    }
    return dumps({"week": ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"],
                  "days": {d: {"data": {"rows": r}} for d, r in rows_by_date.items()}})


def chart(sym, price, closes, exch="NYSE", instrument="EQUITY", name=None, hi=None, lo=None, t=1794603600):
    return {"chart": {"result": [{
        "meta": {"symbol": sym, "longName": name or f"{sym} Inc.", "fullExchangeName": exch,
                 "instrumentType": instrument, "regularMarketPrice": price, "regularMarketTime": t,
                 "gmtoffset": -18000, "regularMarketVolume": 1000, "fiftyTwoWeekHigh": hi or price * 1.25,
                 "fiftyTwoWeekLow": lo or price * 0.8, "chartPreviousClose": closes[0]},
        "timestamp": list(range(len(closes))),
        "indicators": {"quote": [{"close": closes}]}}], "error": None}}


def yahoo_raw(prices=None):
    prices = prices or {"NVDA": 162.85, "^GSPC": 7561.67, "CFR": 158.0}
    symbols = {}
    for s, p in prices.items():
        if s == "^GSPC":
            symbols[s] = chart(s, p, [7500.0, p], exch="SNP", instrument="INDEX")
        elif s == "CFR":
            symbols[s] = chart(s, p, [157.81, p], exch="TXSE")
        else:
            symbols[s] = chart(s, p, [160.0, p], exch="NasdaqGS")
    symbols["BAD"] = {"error": "HTTP Error 404"}
    return dumps({"symbols": symbols})


def nasdaq_analyst_raw():
    return dumps({"symbols": {
        "NVDA": {
            "targetprice": {"data": {"consensusOverview": {"priceTarget": 250.0, "buy": 40, "hold": 5, "sell": 1}}},
            "earnings_forecast": {"data": {"quarterlyForecast": {"rows": [
                {"fiscalEnd": "Jan 2027", "consensusEPSForecast": 2.49, "up": 1, "down": 3}]}}},
            "earnings_surprise": {"data": {"earningsSurpriseTable": {"rows": [
                {"fiscalQtrEnd": "Oct 2026", "percentageSurprise": "-2.5"}]}}},
        },
        "CFR": {"targetprice": {"data": None, "status": {"bCodeMessage": [{"errorMessage": "Symbol not exists."}]}},
                "earnings_forecast": {"data": None}, "earnings_surprise": {"error": "timeout"}},
    }})


def yahoo_analyst_raw():
    return dumps({"symbols": {"CFR": {"quoteSummary": {"result": [{
        "financialData": {"targetMeanPrice": {"raw": 173.85715}},
        "recommendationTrend": {"trend": [{"period": "0m", "strongBuy": 2, "buy": 3, "hold": 9, "sell": 1,
                                           "strongSell": 0}]},
        "earningsTrend": {"trend": [{"period": "0q", "endDate": "2026-12-31",
                                     "earningsEstimate": {"avg": {"raw": 2.90186}},
                                     "epsRevisions": {"upLast30days": {"raw": 8}, "downLast30days": {"raw": 3}}}]},
        "earningsHistory": {"history": [{"quarter": {"raw": 1790000000}, "surprisePercent": {"raw": 0.0121}},
                                         {"quarter": {"raw": 1780000000}, "surprisePercent": {"raw": -0.05}}]},
        "calendarEvents": {"earnings": {"earningsDate": [{"raw": 1795000000}]}},
    }]}}}})


@pytest.fixture
def day_files():
    return {
        "txse_listings": txse_raw(),
        "txse_short_interest": SHORT_CSV,
        "nasdaq_earnings": earnings_raw(),
        "yahoo_chart": yahoo_raw(),
        "nasdaq_analyst": nasdaq_analyst_raw(),
        "yahoo_analyst": yahoo_analyst_raw(),
    }
