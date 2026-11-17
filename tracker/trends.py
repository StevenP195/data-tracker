"""The Trends page findings, computed in Python from data/history.csv.

assets/trends.js computes the same numbers in the browser; `python -m tracker
trends` prints these so the two can be compared (and tests/test_trends.py checks
them on a small history).
"""

from statistics import mean

from .moves import compare, run_dates


def _f(v):
    try:
        return float(v) if v not in ("", None) else None
    except (TypeError, ValueError):
        return None


def change_since_first(rows, keep):
    """{item_id: (item, first_close, latest_close, pct)} for rows where keep(row)."""
    first, last = {}, {}
    for r in sorted(rows, key=lambda r: r["date"]):
        c = _f(r["close"])
        if c is None or not keep(r):
            continue
        first.setdefault(r["item_id"], (r["item"], c))
        last[r["item_id"]] = c
    return {i: (first[i][0], first[i][1], last[i], round((last[i] / first[i][1] - 1) * 100, 4))
            for i in first if first[i][1]}


def market_scoreboard(rows):
    return change_since_first(rows, lambda r: r["group"] == "Index")


def txse_leaders(rows):
    return change_since_first(rows, lambda r: r["group"] == "TXSE")


def analyst_upside(rows):
    dates = run_dates(rows)
    if not dates:
        return []
    latest = [r for r in rows if r["date"] == dates[-1] and _f(r["upside_pct"]) is not None]
    return sorted(((r["item_id"], r["item"], _f(r["upside_pct"])) for r in latest), key=lambda x: (-x[2], x[0]))


def daily_volatility(rows):
    """[(date, mean absolute move %, items compared, mean signed move %)] for every run after the first."""
    out = []
    for d in run_dates(rows)[1:]:
        ms = [m["move_pct"] for m in compare(rows, d)["all_moves"]]
        if ms:
            out.append((d, round(mean(abs(m) for m in ms), 4), len(ms), round(mean(ms), 4)))
    return out


def flag_counts(rows):
    """[(date, {flag: count}, stocks with EPS revisions)] per run."""
    out = []
    for d in run_dates(rows):
        day = [r for r in rows if r["date"] == d]
        counts = {f: sum(f in (r["signals"] or "") for r in day)
                  for f in ("Expected to rise", "Expected to fall", "Below expectations", "Earnings this week")}
        with_est = sum(_f(r["eps_revisions_up"]) is not None or _f(r["eps_revisions_down"]) is not None for r in day)
        out.append((d, counts, with_est))
    return out


def report(rows):
    print("1. Market scoreboard (% since first run)")
    for i, (name, a, b, p) in sorted(market_scoreboard(rows).items(), key=lambda x: -x[1][3]):
        print(f"   {name:40} {a:>12,.2f} -> {b:>12,.2f}  {p:+.2f}%")
    print("2. TXSE listings (% since first run)")
    for i, (name, a, b, p) in sorted(txse_leaders(rows).items(), key=lambda x: (-x[1][3], x[0])):
        print(f"   {i:8} {a:>10,.2f} -> {b:>10,.2f}  {p:+.2f}%")
    print("3. Analyst upside, latest run (top and bottom 5)")
    up = analyst_upside(rows)
    for i, name, p in up[:5] + up[-5:]:
        print(f"   {i:8} {p:+.2f}%")
    print("4. Mean absolute move per run")
    for d, m, n, net in daily_volatility(rows):
        print(f"   {d}  mean |move| {m:.2f}%  mean move {net:+.2f}%  ({n} items)")
    print("5. Flags per run")
    for d, c, n in flag_counts(rows):
        print(f"   {d}  " + "  ".join(f"{k}: {v}" for k, v in c.items()) + f"  (with estimates: {n})")
