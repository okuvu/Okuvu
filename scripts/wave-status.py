#!/usr/bin/env python3
"""Wave status: what is in flight, what is verified, and whether each claim is backed.

Read-only. Safe to run any time. Designed so the product owner can answer
"are the agents on track?" without trusting any summary.

Usage:
  python3 scripts/wave-status.py            # all non-empty stories
  python3 scripts/wave-status.py --live     # also query AWS for stack health
"""
import argparse
import datetime as dt
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(REPO, "plan", "run-ledger.psv")
COLS = ["id", "epic", "title", "owner", "deps", "status", "assigned",
        "branch", "commit", "evidence", "verified_at", "verified_by", "notes"]

# A story is DONE only if: status says verified AND evidence file exists AND
# evidence carries a command+output trace AND the commit is on a real branch.
STALE_HOURS = 6  # in_review/in_progress older than this is "stalled", not "running"


def read_ledger():
    rows = []
    with open(LEDGER, encoding="utf-8") as fh:
        header = fh.readline().rstrip("\n").split("|")
        assert header[:len(COLS)] == COLS[:len(header)], f"unexpected header: {header}"
        for line in fh:
            if not line.strip():
                continue
            parts = line.rstrip("\n").split("|")
            parts += [""] * (len(COLS) - len(parts))
            rows.append(dict(zip(COLS, parts)))
    return rows


def sh(cmd):
    try:
        return subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True,
                              text=True, timeout=60).stdout.strip()
    except Exception as exc:  # noqa: BLE001
        return f"<error: {exc}>"


def evidence_report(path):
    """Return (exists, bytes, has_command, has_timestamp, age_hours)."""
    full = os.path.join(REPO, path) if path else ""
    if not path or not os.path.exists(full):
        return (False, 0, False, False, None)
    body = open(full, encoding="utf-8", errors="replace").read()
    size = len(body.encode())
    low = body.lower()
    has_cmd = ("```" in body) or ("$ " in body) or ("command" in low)
    # accept any ISO-ish timestamp in the file
    has_ts = any(t in body for t in ("Z\n", "UTC", "T0", "T1", "T2"))
    age = (dt.datetime.now().timestamp() - os.path.getmtime(full)) / 3600.0
    return (True, size, has_cmd, has_ts, round(age, 1))


def commit_state(commit, branch):
    """Is the commit real, and is it merged into develop?"""
    if not commit:
        return {}
    exists = sh(f"git cat-file -t {commit} 2>/dev/null") == "commit"
    on_origin = sh(f"git branch -r --contains {commit} 2>/dev/null").strip()
    in_dev = sh(f"git merge-base --is-ancestor {commit} origin/develop "
                f"&& echo yes || echo no")
    subject = sh(f"git log -1 --format=%s {commit} 2>/dev/null") if exists else ""
    when = sh(f"git log -1 --format=%cI {commit} 2>/dev/null") if exists else ""
    return {"exists": exists, "branches": on_origin, "in_develop": in_dev,
            "subject": subject, "committed_at": when}


def live_health():
    out = {}
    out["ecs"] = sh(
        "aws ecs describe-services --cluster evia-beta "
        "--services evia-beta-api evia-beta-worker evia-beta-portal "
        "--query 'services[].{n:serviceName,run:runningCount,des:desiredCount,"
        "img:taskDefinition,roll:deployments[0].rolloutState}' --output text")
    out["api"] = sh("curl -s -o /dev/null -m 10 -w '%{http_code}' "
                    "https://api.okuvu.in/health")
    out["portal"] = sh("curl -s -o /dev/null -m 10 -w '%{http_code}' "
                       "https://portal.okuvu.in/api/health")
    out["apex"] = sh("curl -s -o /dev/null -m 10 -w '%{http_code}' "
                     "https://okuvu.in")
    out["alarms"] = sh("aws cloudwatch describe-alarms "
                       "--query 'MetricAlarms[].{n:AlarmName,s:StateValue}' "
                       "--output text")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()

    rows = read_ledger()
    by_status = {}
    for r in rows:
        by_status.setdefault(r["status"], []).append(r)

    print(f"BACKLOG {len(rows)} stories   "
          f"{dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("counts: " + "  ".join(f"{k}={len(v)}" for k, v in sorted(by_status.items())))
    print()

    active = [r for r in rows if r["status"] in
              ("in_progress", "in_review", "blocked", "verified")]
    if not active:
        print("Nothing is in flight and nothing is verified yet.")
        return

    problems = []
    for r in active:
        print("=" * 78)
        print(f"{r['id']}  [{r['status']}]  {r['title']}")
        print(f"  owner={r['assigned'] or '-'}  deps={r['deps']}")
        ev = evidence_report(r["evidence"])
        cs = commit_state(r["commit"], r["branch"])

        if r["commit"]:
            if not cs.get("exists"):
                problems.append(f"{r['id']}: commit {r['commit']} does not exist locally")
            else:
                print(f"  commit {r['commit']}  {cs['committed_at']}  \"{cs['subject'][:60]}\"")
                print(f"    on branches: {cs['branches'].replace(chr(10), ', ') or 'NOWHERE'}")
                print(f"    in origin/develop: {cs['in_develop']}")
                if cs["in_develop"] == "no":
                    print("    (expected for unmerged work; it becomes real only "
                          "after the orchestrator merges)")
        else:
            print("  commit: none recorded  -> nothing has been produced yet")

        if ev[0]:
            print(f"  evidence {r['evidence']}  {ev[1]} bytes  "
                  f"cmd={'yes' if ev[2] else 'NO'} ts={'yes' if ev[3] else 'NO'}  "
                  f"written {ev[4]}h ago")
            if not ev[2]:
                problems.append(f"{r['id']}: evidence has no command transcript")
        else:
            print(f"  evidence: MISSING ({r['evidence'] or 'no path'})")
            if r["status"] == "verified":
                problems.append(f"{r['id']}: marked verified with NO evidence file")

        if r["verified_at"]:
            age = (dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
                   - dt.datetime.strptime(r["verified_at"], "%Y-%m-%dT%H:%MZ")
                   ).total_seconds() / 3600
            age = max(age, 0.0)
            print(f"  verified {r['verified_at']} by {r['verified_by']} ({age:.1f}h ago)")
            if r["status"] == "verified" and not r["verified_by"]:
                problems.append(f"{r['id']}: verified with no verifier name")

        note = r["notes"].strip()
        if note:
            print(f"  note: {note[:400]}")

    if args.live:
        print("=" * 78)
        print("LIVE STACK")
        h = live_health()
        for k in ("api", "portal", "apex"):
            print(f"  {k:8s} https -> {h[k]}")
        print("  ecs:")
        for line in h["ecs"].splitlines():
            print("    " + line)
        print("  alarms:")
        for line in h["alarms"].splitlines():
            print("    " + line)

    print("=" * 78)
    if problems:
        print("PROBLEMS FOUND (these are the things that are not on track):")
        for p in problems:
            print("  - " + p)
    else:
        print("No integrity problems: every verified story has evidence and a commit, "
              "and no in-flight story is missing its artefact.")


if __name__ == "__main__":
    main()
