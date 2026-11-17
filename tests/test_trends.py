"""The Trends findings computed from a small history (the browser computes the
same numbers with the same rules in assets/trends.js)."""

from tracker import trends


def row(date, iid, group, close, upside="", signals="", up="", down=""):
    return {"date": date, "item_id": iid, "item": iid, "group": group, "exchange": "TXSE" if group == "TXSE" else "NYSE",
            "houston": "Texas Banks" if iid == "CFR" else "",
            "close": str(close), "upside_pct": str(upside), "signals": signals,
            "eps_revisions_up": str(up), "eps_revisions_down": str(down)}


ROWS = [
    row("2026-11-16", "^GSPC", "Index", 100), row("2026-11-16", "TXS", "Index", 40),
    row("2026-11-16", "CFR", "TXSE", 150, 10, "", 2, 1), row("2026-11-16", "DDS", "TXSE", 600, -5, "Expected to fall"),
    row("2026-11-17", "^GSPC", "Index", 102), row("2026-11-17", "TXS", "Index", 39),
    row("2026-11-17", "CFR", "TXSE", 165, 20, "Expected to rise; Below expectations", 1, 3),
    row("2026-11-17", "DDS", "TXSE", 600, -8, "Expected to fall"),
]


def test_market_scoreboard():
    m = trends.market_scoreboard(ROWS)
    assert m["^GSPC"][3] == 2.0 and m["TXS"][3] == -2.5


def test_txse_leaders():
    t = trends.txse_leaders(ROWS)
    assert t["CFR"] == ("CFR", 150.0, 165.0, 10.0) and t["DDS"][3] == 0.0


def test_analyst_upside_latest_only():
    assert trends.analyst_upside(ROWS) == [("CFR", "CFR", 20.0), ("DDS", "DDS", -8.0)]


def test_daily_volatility():
    # moves on 11-17: +2%, -2.5%, +10%, 0% -> mean of absolutes 3.625, signed mean 2.375
    assert trends.daily_volatility(ROWS) == [("2026-11-17", 3.625, 4, 2.375)]


def test_flag_counts():
    (d1, c1, n1), (d2, c2, n2) = trends.flag_counts(ROWS)
    assert c1["Expected to fall"] == 1 and c1["Below expectations"] == 0 and n1 == 1
    assert c2["Expected to rise"] == 1 and c2["Below expectations"] == 1 and n2 == 1


def test_houston_desk():
    assert trends.houston_desk(ROWS) == {"Texas Banks": (10.0, {"CFR": 10.0})}
