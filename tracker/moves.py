"""The move rule, shared by the daily Issue and status.json (the Today page
computes the same thing in the browser, in assets/today.js).

    move % = (close in the latest run / close in the previous run - 1) x 100

for every item that has a close in both runs. Items are ranked by the size of
the move (absolute value, largest first; ties by item_id) and the top
config.TOP_MOVES with a non-zero move are listed. An item in the latest run but
not the previous one "appeared"; one in the previous run but not the latest
"disappeared". Flags (signals) an item gained or lost are listed too.
"""

from . import config


def _f(v):
    try:
        return float(v) if v not in ("", None) else None
    except ValueError:
        return None


def run_dates(rows):
    return sorted({r["date"] for r in rows})


def _flags(r):
    return {s.strip() for s in (r.get("signals") or "").split(";") if s.strip()}


def compare(rows, date=None, top=None):
    dates = run_dates(rows)
    if not dates:
        return {"date": "", "prev_date": "", "moves": [], "all_moves": [], "appeared": [], "gone": [],
                "flags_added": [], "flags_removed": []}
    date = date or dates[-1]
    earlier = [d for d in dates if d < date]
    prev_date = earlier[-1] if earlier else ""
    today = {r["item_id"]: r for r in rows if r["date"] == date}
    prev = {r["item_id"]: r for r in rows if r["date"] == prev_date}

    moves = []
    for iid, r in today.items():
        p = prev.get(iid)
        new, old = _f(r.get("close")), _f(p.get("close")) if p else None
        if new is None or not old:
            continue
        moves.append({"item_id": iid, "item": r["item"], "exchange": r.get("exchange", ""),
                      "group": r.get("group", ""), "old": old, "new": new,
                      "move_pct": round((new / old - 1) * 100, 4)})
    moves.sort(key=lambda m: (-abs(m["move_pct"]), m["item_id"]))

    flags_added, flags_removed = [], []
    for iid in sorted(today.keys() & prev.keys()):
        a, b = _flags(prev[iid]), _flags(today[iid])
        flags_added += [{"item_id": iid, "item": today[iid]["item"], "flag": f} for f in sorted(b - a)]
        flags_removed += [{"item_id": iid, "item": today[iid]["item"], "flag": f} for f in sorted(a - b)]

    n = config.TOP_MOVES if top is None else top
    return {
        "date": date, "prev_date": prev_date,
        "moves": [m for m in moves if m["move_pct"] != 0][:n],
        "all_moves": moves,
        "appeared": sorted(today.keys() - prev.keys()) if prev_date else [],
        "gone": sorted(prev.keys() - today.keys()) if prev_date else [],
        "flags_added": flags_added, "flags_removed": flags_removed,
    }
