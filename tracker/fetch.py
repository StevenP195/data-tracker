"""Call every source and save what it returns, compressed and in the format it
came in, to data/raw/<date>/<source>.<format>.gz.

One source failing never stops the run: it writes no raw file that day, and the
result of every source (ok / count / error) is recorded in data/runs/<date>.json.
A second run on the same day replaces that day's raw files.
"""

import datetime as dt
import gzip
import json
import shutil
import traceback

from . import config, universe
from .sources import ORDER, nasdaq_analyst, yahoo, yahoo_analyst


def utc_now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def write_raw(day_dir, mod, raw: bytes):
    path = day_dir / f"{mod.NAME}.{mod.FORMAT}.gz"
    with open(path, "wb") as f:  # mtime=0: the same bytes always give the same file
        with gzip.GzipFile(filename="", mode="wb", fileobj=f, mtime=0) as gz:
            gz.write(raw)
    return path


def fetch_all(now=None, raw_dir=None, runs_dir=None, sources=None):
    now = now or utc_now()
    raw_dir, runs_dir = raw_dir or config.RAW, runs_dir or config.RUNS
    date = now.date().isoformat()
    run_time = now.isoformat().replace("+00:00", "Z")
    day_dir = raw_dir / date
    if day_dir.exists():  # a re-run replaces that day's raw files
        shutil.rmtree(day_dir)
    day_dir.mkdir(parents=True)

    ctx, parsed, results = {"date": date}, {}, []
    for mod in sources or ORDER:
        if mod is yahoo:
            ctx["symbols"] = universe.pool(parsed.get("txse_listings"), parsed.get("nasdaq_earnings"))
            ctx["pool"] = ctx["symbols"]
        elif mod is nasdaq_analyst:
            ctx["symbols"] = universe.analyst_symbols(
                ctx.get("pool") or universe.pool(parsed.get("txse_listings"), parsed.get("nasdaq_earnings")),
                parsed.get("txse_listings"))
        elif mod is yahoo_analyst:
            ctx["symbols"] = universe.txse_common(parsed.get("txse_listings"), parsed.get("yahoo_chart"))
        try:
            raw = mod.fetch(ctx)
            parsed[mod.NAME] = mod.parse(raw)
            write_raw(day_dir, mod, raw)
            results.append({"name": mod.NAME, "format": mod.FORMAT, "ok": True,
                            "count": mod.count(raw), "error": ""})
        except Exception as e:
            traceback.print_exc()
            results.append({"name": mod.NAME, "format": mod.FORMAT, "ok": False,
                            "count": 0, "error": str(e)[:300]})

    if not any(day_dir.iterdir()):
        day_dir.rmdir()
    run = {"run_time": run_time, "date": date, "sources": results}
    runs_dir.mkdir(parents=True, exist_ok=True)
    (runs_dir / f"{date}.json").write_text(json.dumps(run, indent=2) + "\n", encoding="utf-8")
    for r in results:
        print(f"{'OK  ' if r['ok'] else 'FAIL'} {r['name']:22} {r['count']:5}  {r['error']}")
    return run
