"""Command line entry point.

    python -m tracker run      fetch every source, rebuild history + status, open the daily issue
    python -m tracker fetch    only call the sources and save raw files
    python -m tracker build    rebuild data/history.csv and data/status.json from the raw files
    python -m tracker issue    open / update today's GitHub issue from the current data
    python -m tracker trends   print the Trends page numbers computed in Python (cross-check)
    python -m tracker serve    serve the site at http://localhost:8000
"""

import argparse
import os

from . import config, fetch, history, issues, moves, status


def cmd_build():
    rows = history.build()
    history.write_csv(rows)
    rows = history.read_csv()
    st = status.build_status(rows)
    status.write_status(st)
    print(f"history.csv: {len(rows)} rows over {st['days_with_success']} day(s); latest run "
          f"{st['items']} items, {len(st['new_today'])} new, {len(st['gone_today'])} gone")
    return rows, st


def cmd_issue(rows=None, st=None):
    if rows is None:
        rows = history.read_csv()
        st = status.build_status(rows)
    cmp = moves.compare(rows, st["run_time"][:10] or None)
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    site = f"https://{repo.split('/')[0].lower()}.github.io/{repo.split('/')[1]}/" if "/" in repo else ""
    body = issues.render(cmp, st, rows, site)
    out = config.ROOT / "build" / "issue.md"
    out.parent.mkdir(exist_ok=True)
    out.write_text(body, encoding="utf-8")
    issues.publish(st["run_time"][:10], body)


def cmd_serve(port=8000):
    import functools
    import http.server
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(config.ROOT))
    print(f"Serving {config.ROOT} at http://localhost:{port}  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


def main():
    p = argparse.ArgumentParser(prog="tracker")
    p.add_argument("command", choices=["run", "fetch", "build", "issue", "trends", "serve"])
    p.add_argument("--port", type=int, default=8000)
    a = p.parse_args()
    if a.command in ("run", "fetch"):
        fetch.fetch_all()
    if a.command in ("run", "build"):
        rows, st = cmd_build()
        if a.command == "run":
            try:
                cmd_issue(rows, st)
            except Exception as e:  # never lose the day's data commit over an Issues API error
                print(f"Daily issue failed: {e}")
    elif a.command == "issue":
        cmd_issue()
    elif a.command == "trends":
        from .trends import report
        report(history.read_csv())
    elif a.command == "serve":
        cmd_serve(a.port)


if __name__ == "__main__":
    main()
