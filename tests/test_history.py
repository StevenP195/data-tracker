"""History logic: one row per item per day from the raw files alone, missing
sources, rebuild reproducibility, and a second run on the same day."""

import datetime as dt
import gzip

import pytest

from tracker import config, fetch, history, status
from tracker.sources import nasdaq_analyst, nasdaq_earnings, txse, txse_short, yahoo, yahoo_analyst

from .conftest import (SHORT_CSV, earnings_raw, nasdaq_analyst_raw, txse_raw, yahoo_analyst_raw,
                       yahoo_raw)


def by_id(rows):
    return {r["item_id"]: r for r in rows}


def test_day_rows_common_columns(day_files):
    rows = history.day_rows("2026-11-16", day_files)
    ids = [r["item_id"] for r in rows]
    assert ids == sorted(ids)
    assert set(ids) == {"CFR", "CFR-PB", "TXS", "NVDA", "^GSPC"}  # BAD failed, no row
    r = by_id(rows)
    for row in rows:
        assert row["date"] == "2026-11-16" and set(row) <= set(config.HISTORY_COLUMNS)


def test_txse_official_close_wins_and_yahoo_fills_the_rest(day_files):
    cfr = by_id(history.day_rows("2026-11-16", day_files))["CFR"]
    assert cfr["source"] == "txse" and cfr["exchange"] == "TXSE" and cfr["group"] == "TXSE"
    assert cfr["close"] == 158.17           # TXSE official, not Yahoo's 158.0
    assert cfr["volume"] == 1000            # from Yahoo
    assert cfr["price_date"] == "2026-11-13"
    # analyst columns come from Yahoo because Nasdaq has no CFR record
    assert cfr["target_price"] == 173.8571 and cfr["analysts_hold"] == 9.0
    assert cfr["upside_pct"] == round((173.8571 / 158.17 - 1) * 100, 4)
    # short interest joined for TXSE common stock
    assert cfr["short_interest"] == 1500000.0 and cfr["short_change_pct"] == 50.0
    # Yahoo's next earnings date (Nov 18) falls in the run's week
    assert cfr["earnings_date"] == "2026-11-18"


def test_groups_and_signals(day_files):
    r = by_id(history.day_rows("2026-11-16", day_files))
    assert r["^GSPC"]["group"] == "Index" and r["^GSPC"]["item"] == "S&P 500"
    assert r["TXS"]["group"] == "Index"               # the TXSE stand-in
    assert r["NVDA"]["group"] == "Watchlist"          # on the watchlist, and reporting this week
    assert r["NVDA"]["earnings_date"] == "2026-11-17"
    assert r["NVDA"]["signals"] == "Earnings this week; Expected to rise; Below expectations"
    assert "Expected to fall" in r["CFR"]["signals"]  # short position up 50%
    assert "short_interest" not in r["CFR-PB"]        # preferreds get no short interest
    assert r["CFR"]["houston"] == "Texas Banks" and r["NVDA"]["houston"] == "" and r["^GSPC"]["houston"] == ""


def test_signal_rules():
    s = history.signals
    assert s({}) == []
    assert s({"upside_pct": 30, "analysts_buy": 5, "analysts_hold": 5, "analysts_sell": 0}) == ["Expected to rise"]
    assert s({"upside_pct": 30, "analysts_buy": 2, "analysts_hold": 5, "analysts_sell": 0}) == []  # buys < half
    assert s({"upside_pct": 20, "analysts_buy": 5, "analysts_hold": 0, "analysts_sell": 0}) == []  # under the 25% bar
    assert s({"upside_pct": -1}) == ["Expected to fall"]
    assert s({"upside_pct": 5, "analysts_buy": 1, "analysts_sell": 2}) == ["Expected to fall"]
    assert s({"eps_revisions_up": 1, "eps_revisions_down": 2}) == ["Below expectations"]
    assert s({"eps_revisions_up": 2, "eps_revisions_down": 2}) == []


def test_missing_source_gives_no_rows_from_it(day_files):
    del day_files["yahoo_chart"]
    rows = history.day_rows("2026-11-16", day_files)
    assert {r["item_id"] for r in rows} == {"CFR", "CFR-PB", "TXS"}  # only TXSE feed rows
    assert all(r["source"] == "txse" for r in rows)
    assert by_id(rows)["CFR"].get("volume") is None  # left empty


def test_txse_feed_missing_falls_back_to_yahoo(day_files):
    del day_files["txse_listings"]
    cfr = by_id(history.day_rows("2026-11-16", day_files))["CFR"]
    assert cfr["source"] == "yahoo_chart" and cfr["close"] == 158.0 and cfr["group"] == "TXSE"


def write_day(raw_dir, date, files):
    d = raw_dir / date
    d.mkdir(parents=True, exist_ok=True)
    for name, raw in files.items():
        mod = {m.NAME: m for m in (txse, txse_short, nasdaq_earnings, yahoo, nasdaq_analyst, yahoo_analyst)}[name]
        with gzip.open(d / f"{name}.{mod.FORMAT}.gz", "wb") as f:
            f.write(raw)


def test_build_is_reproducible_and_sorted(tmp_path, day_files):
    write_day(tmp_path, "2026-11-17", day_files)
    write_day(tmp_path, "2026-11-16", {"txse_listings": txse_raw(150.0)})
    rows = history.build(tmp_path)
    assert [(r["date"], r["item_id"]) for r in rows] == sorted((r["date"], r["item_id"]) for r in rows)
    assert rows[0]["date"] == "2026-11-16"
    a, b = tmp_path / "a.csv", tmp_path / "b.csv"
    history.write_csv(rows, a)
    history.write_csv(history.build(tmp_path), b)
    assert a.read_bytes() == b.read_bytes()
    header = a.read_text(encoding="utf-8").splitlines()[0].split(",")
    assert header[:4] == ["date", "item_id", "item", "source"]


def test_fmt():
    assert history.fmt(None) == "" and history.fmt(3.0) == "3" and history.fmt(1.23456789) == "1.2346"
    assert history.fmt(-0.00001) == "0" and history.fmt("x") == "x"


@pytest.fixture
def fake_sources(monkeypatch):
    """Replace every network call with the fixture raw files; returns a dict
    whose values can be swapped between runs."""
    state = {"txse": txse_raw(), "fail_yahoo": False}
    monkeypatch.setattr(txse, "fetch", lambda ctx: state["txse"])
    monkeypatch.setattr(txse_short, "fetch", lambda ctx: SHORT_CSV)
    monkeypatch.setattr(nasdaq_earnings, "fetch", lambda ctx: earnings_raw())

    def yh(ctx):
        if state["fail_yahoo"]:
            raise RuntimeError("HTTP Error 429")
        state["yahoo_symbols"] = ctx["symbols"]
        return yahoo_raw()
    monkeypatch.setattr(yahoo, "fetch", yh)
    monkeypatch.setattr(nasdaq_analyst, "fetch", lambda ctx: nasdaq_analyst_raw())
    monkeypatch.setattr(yahoo_analyst, "fetch", lambda ctx: yahoo_analyst_raw())
    return state


def test_failed_source_does_not_stop_the_run(tmp_path, fake_sources):
    fake_sources["fail_yahoo"] = True
    run = fetch.fetch_all(dt.datetime(2026, 11, 16, 9, tzinfo=dt.timezone.utc), tmp_path / "raw", tmp_path / "runs")
    res = {s["name"]: s for s in run["sources"]}
    assert res["yahoo_chart"]["ok"] is False and "429" in res["yahoo_chart"]["error"]
    assert all(s["ok"] for n, s in res.items() if n != "yahoo_chart")
    files = sorted(p.name for p in (tmp_path / "raw" / "2026-11-16").iterdir())
    assert "yahoo_chart.json.gz" not in files and "txse_listings.json.gz" in files
    assert (tmp_path / "runs" / "2026-11-16.json").exists()


def test_universe_passed_to_price_source(tmp_path, fake_sources):
    fetch.fetch_all(dt.datetime(2026, 11, 16, 9, tzinfo=dt.timezone.utc), tmp_path / "raw", tmp_path / "runs")
    syms = fake_sources["yahoo_symbols"]
    assert syms[:4] == list(config.INDEXES)
    assert "CFR-PB" in syms and "NVDA" in syms and "HD" in syms  # TXSE + watchlist + earnings top N
    assert len(syms) == len(set(syms))


def test_second_run_same_day_replaces_that_day(tmp_path, fake_sources):
    raw, runs = tmp_path / "raw", tmp_path / "runs"
    t = dt.datetime(2026, 11, 16, 9, tzinfo=dt.timezone.utc)
    fetch.fetch_all(t, raw, runs)
    first = history.build(raw)
    fake_sources["txse"] = txse_raw(cfr_close=170.0)  # values changed by the second run
    fetch.fetch_all(t + dt.timedelta(hours=3), raw, runs)
    second = history.build(raw)
    assert len(second) == len(first)                         # the day counts once
    assert by_id(second)["CFR"]["close"] == 170.0
    assert [p.name for p in raw.iterdir()] == ["2026-11-16"]
    st = status.build_status(history_rows := [{k: history.fmt(v) for k, v in r.items()} for r in second],
                             raw, runs)
    assert st["days_with_success"] == 1 and st["items"] == len(history_rows)
    assert st["run_time"] == "2026-11-16T12:00:00Z"


def test_status_keys(tmp_path, fake_sources):
    raw, runs = tmp_path / "raw", tmp_path / "runs"
    fetch.fetch_all(dt.datetime(2026, 11, 16, 9, tzinfo=dt.timezone.utc), raw, runs)
    fake_sources["txse"] = txse_raw(extra=[{"_key": "NEWX", "symbol": "NEWX", "issuer": "New Listing",
                                            "closingPrice": 10.0, "securityType": "common_stock",
                                            "type": "Corporate"}])
    fetch.fetch_all(dt.datetime(2026, 11, 17, 9, tzinfo=dt.timezone.utc), raw, runs)
    rows = [{k: history.fmt(v) for k, v in r.items()} for r in history.build(raw)]
    st = status.build_status(rows, raw, runs)
    assert set(st) == {"run_time", "first_run_date", "days_with_success", "items", "new_today", "gone_today",
                       "sources"}
    assert st["first_run_date"] == "2026-11-16" and st["days_with_success"] == 2
    assert st["new_today"] == ["NEWX"] and st["gone_today"] == []
    assert all(set(s) >= {"name", "ok", "count"} for s in st["sources"])
