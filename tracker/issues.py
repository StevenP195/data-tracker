"""Daily GitHub Issue, titled with the date: the biggest moves since the previous
run (old and new close), items that appeared or disappeared, and flags gained or
lost. Closes the previous day's issue. Opened every day, even with no changes.

Uses the GitHub REST API with GITHUB_TOKEN / GITHUB_REPOSITORY (set by Actions).
A second run on the same day edits that day's issue instead of opening another.
"""

import json
import os
import urllib.request

from . import config

LABEL = "daily-report"


def money(v):
    return f"{v:,.2f}"


def render(cmp, status, rows, site_url=""):
    date = cmp["date"] or status.get("run_time", "")[:10]
    names = {r["item_id"]: r["item"] for r in rows}
    ok = sum(s["ok"] for s in status["sources"])
    lines = [
        f"cc @{config.NOTIFY_USER} — market tracker for **{date}**",
        "",
        f"{status['items']} items tracked · {ok}/{len(status['sources'])} sources ok · "
        f"compared with the run of {cmp['prev_date'] or '— (first run)'}",
    ]
    failed = [s["name"] for s in status["sources"] if not s["ok"]]
    if failed:
        lines.append(f"⚠️ Sources that failed today: {', '.join(failed)}")
    if site_url:
        lines.append(f"Site: {site_url}")
    lines += ["", f"### Biggest moves since the previous run (top {config.TOP_MOVES} by absolute % change in close)"]
    if cmp["moves"]:
        lines += ["| Item | Exchange | Old close | New close | Move |", "|---|---|--:|--:|--:|"]
        lines += [f"| {m['item']} ({m['item_id']}) | {m['exchange']} | {money(m['old'])} | {money(m['new'])} | "
                  f"{m['move_pct']:+.2f}% |" for m in cmp["moves"]]
    else:
        lines.append("_No closing prices changed since the previous run (market closed, or first run)._")

    def listing(title, ids):
        out = ["", f"### {title} ({len(ids)})"]
        return out + ([f"- {names.get(i, i)} ({i})" for i in ids] or ["_None._"])

    lines += listing("Appeared since the previous run", cmp["appeared"])
    lines += listing("Disappeared since the previous run", cmp["gone"])
    lines += ["", f"### Flags gained ({len(cmp['flags_added'])})"]
    lines += [f"- {f['item']} ({f['item_id']}): **{f['flag']}**" for f in cmp["flags_added"]] or ["_None._"]
    lines += ["", f"### Flags lost ({len(cmp['flags_removed'])})"]
    lines += [f"- {f['item']} ({f['item_id']}): {f['flag']}" for f in cmp["flags_removed"]] or ["_None._"]
    return "\n".join(lines)[:60000] + "\n"


class GitHub:
    def __init__(self, token, repo):
        self.token, self.repo = token, repo

    def call(self, method, path, body=None):
        req = urllib.request.Request(
            f"https://api.github.com/repos/{self.repo}{path}",
            data=json.dumps(body).encode() if body is not None else None, method=method,
            headers={"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "data-tracker"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            return json.loads(data) if data else None


def publish(date, body, token=None, repo=None):
    token = token or os.environ.get("GITHUB_TOKEN")
    repo = repo or os.environ.get("GITHUB_REPOSITORY")
    if not (token and repo):
        print("No GITHUB_TOKEN/GITHUB_REPOSITORY: skipping issue (preview written to build/issue.md)")
        return None
    gh = GitHub(token, repo)
    try:
        gh.call("POST", "/labels", {"name": LABEL, "color": "bf0a30"})
    except Exception:
        pass  # label already exists

    open_issues = [i for i in gh.call("GET", f"/issues?state=open&labels={LABEL}&per_page=100") or []
                   if "pull_request" not in i]
    today = next((i for i in open_issues if i["title"] == date), None)
    if today is None:  # same-day re-run after the issue was closed by hand
        closed = gh.call("GET", f"/issues?state=closed&labels={LABEL}&per_page=30") or []
        today = next((i for i in closed if i["title"] == date), None)
    if today:
        num = today["number"]
        gh.call("PATCH", f"/issues/{num}", {"body": body, "state": "open"})
    else:
        num = gh.call("POST", "/issues", {"title": date, "body": body, "labels": [LABEL]})["number"]
    for i in open_issues:  # close the previous day's issue(s)
        if i["title"] != date:
            gh.call("PATCH", f"/issues/{i['number']}", {"state": "closed", "state_reason": "completed"})
    print(f"Issue #{num} ({date}) updated")
    return num
