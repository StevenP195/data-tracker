"""Write data/status.json describing the latest run."""

import json

from . import config
from .history import raw_days
from .moves import compare


def build_status(rows, raw_dir=None, runs_dir=None):
    raw_dir, runs_dir = raw_dir or config.RAW, runs_dir or config.RUNS
    dates = sorted(raw_days(raw_dir))

    # the latest run record (a run where every source failed has no raw files,
    # but it is still the latest run)
    run_files = sorted(runs_dir.glob("*.json")) if runs_dir.exists() else []
    if run_files:
        run = json.loads(run_files[-1].read_text(encoding="utf-8"))
        run_time, run_date = run["run_time"], run["date"]
        sources = [{"name": s["name"], "format": s.get("format", ""), "ok": s["ok"], "count": s["count"],
                    "error": s.get("error", "")} for s in run["sources"]]
    else:
        run_date = dates[-1] if dates else ""
        run_time = f"{run_date}T00:00:00Z" if run_date else ""
        sources = []

    latest = [r for r in rows if r["date"] == run_date]
    c = compare(rows, run_date) if latest else {"appeared": [], "gone": []}
    return {
        "run_time": run_time,
        "first_run_date": dates[0] if dates else "",
        "days_with_success": len(dates),
        "items": len(latest),
        "new_today": c["appeared"],
        "gone_today": c["gone"],
        "sources": sources,
    }


def write_status(status, path=None):
    (path or config.STATUS).write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
