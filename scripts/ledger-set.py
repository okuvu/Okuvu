#!/usr/bin/env python3
"""Set fields in the run ledger.

Usage:
  ledger-set.py E15-S2.status=verified E15-S2.commit=abc123 E15-S2.notes="..."

Fields are columns of plan/run-ledger.psv (id, epic, title, owner, deps, status,
assigned, branch, commit, evidence, verified_at, verified_by, notes).
Unknown columns are rejected so a typo cannot silently vanish.
"""
import sys, pathlib
from datetime import datetime, timezone

P = pathlib.Path("/opt/data/okuvu/ts/plan/run-ledger.psv")
rows = [l for l in P.read_text().splitlines() if l.strip()]
hdr, data = rows[0], [r.split("|") for r in rows[1:]]
COLS = hdr.split("|")
idx = {c: i for i, c in enumerate(COLS)}

changes = {}
for arg in sys.argv[1:]:
    if "=" not in arg or "." not in arg:
        sys.exit(f"bad argument: {arg!r} (want ID.field=value)")
    left, value = arg.split("=", 1)
    sid, field = left.split(".", 1)
    if field not in idx:
        sys.exit(f"unknown field {field!r}; known: {', '.join(COLS)}")
    changes.setdefault(sid, {})[field] = value

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
seen = set()
for r in data:
    sid = r[0]
    if sid not in changes:
        continue
    seen.add(sid)
    for f, v in changes[sid].items():
        r[idx[f]] = v
    if r[idx["status"]] == "verified":
        if not r[idx["verified_at"]]:
            r[idx["verified_at"]] = now
        if not r[idx["verified_by"]]:
            r[idx["verified_by"]] = "orchestrator"

missing = set(changes) - seen
if missing:
    sys.exit(f"unknown story ids: {sorted(missing)}")

P.write_text("\n".join([hdr] + ["|".join(r) for r in data]) + "\n")
for r in data:
    if r[0] in changes:
        print(f"{r[0]:8} {r[idx['status']]:12} {r[idx['commit']][:12]:13} {r[idx['evidence']]}")
