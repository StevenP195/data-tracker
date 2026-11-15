"""The move rule: % change in close since the previous run, ranked by size."""

from tracker import config
from tracker.moves import compare


def row(date, iid, close, signals=""):
    return {"date": date, "item_id": iid, "item": iid.title(), "exchange": "NYSE", "group": "Watchlist",
            "close": str(close) if close is not None else "", "signals": signals}


def test_moves_ranked_by_absolute_percent():
    rows = [row("2026-11-16", "A", 100), row("2026-11-16", "B", 50), row("2026-11-16", "C", 10),
            row("2026-11-17", "A", 103), row("2026-11-17", "B", 45), row("2026-11-17", "C", 10)]
    c = compare(rows)
    assert c["date"] == "2026-11-17" and c["prev_date"] == "2026-11-16"
    assert [(m["item_id"], m["move_pct"]) for m in c["moves"]] == [("B", -10.0), ("A", 3.0)]
    assert c["moves"][0]["old"] == 50 and c["moves"][0]["new"] == 45
    assert len(c["all_moves"]) == 3  # C did not move: not listed, still compared


def test_ties_broken_by_item_id_and_capped():
    rows = []
    for i in range(config.TOP_MOVES + 5):
        rows += [row("2026-11-16", f"S{i:02}", 100), row("2026-11-17", f"S{i:02}", 102)]
    c = compare(rows)
    assert len(c["moves"]) == config.TOP_MOVES
    assert [m["item_id"] for m in c["moves"]][:2] == ["S00", "S01"]


def test_compares_with_previous_run_not_older_ones():
    rows = [row("2026-11-14", "A", 50), row("2026-11-16", "A", 100), row("2026-11-17", "A", 110)]
    assert compare(rows)["moves"][0]["old"] == 100


def test_appeared_gone_and_missing_close():
    rows = [row("2026-11-16", "A", 100), row("2026-11-16", "OLD", 5), row("2026-11-16", "E", None),
            row("2026-11-17", "A", 100), row("2026-11-17", "NEW", 7), row("2026-11-17", "E", 9)]
    c = compare(rows)
    assert c["appeared"] == ["NEW"] and c["gone"] == ["OLD"]
    assert c["moves"] == []  # E had no close before; A did not move


def test_first_run_has_no_moves_or_changes():
    c = compare([row("2026-11-16", "A", 100)])
    assert c["prev_date"] == "" and c["moves"] == [] and c["appeared"] == [] and c["gone"] == []


def test_flags_gained_and_lost():
    rows = [row("2026-11-16", "A", 100, "Expected to rise"),
            row("2026-11-17", "A", 100, "Expected to rise; Below expectations"),
            row("2026-11-16", "B", 100, "Expected to fall"), row("2026-11-17", "B", 100, "")]
    c = compare(rows)
    assert c["flags_added"] == [{"item_id": "A", "item": "A", "flag": "Below expectations"}]
    assert c["flags_removed"] == [{"item_id": "B", "item": "B", "flag": "Expected to fall"}]


def test_specific_date():
    rows = [row("2026-11-16", "A", 100), row("2026-11-17", "A", 110), row("2026-11-18", "A", 99)]
    assert compare(rows, "2026-11-17")["moves"][0]["move_pct"] == 10.0
