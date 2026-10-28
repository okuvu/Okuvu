#!/usr/bin/env python3
"""Set status for a set of story ids in the run ledger. Usage:
   ledger-set.py ID=status[:assigned[:branch]] ..."""
import sys, pathlib

P = pathlib.Path("/opt/data/okuvu/ts/plan/run-ledger.psv")
rows = [l for l in P.read_text().splitlines() if l.strip()]
hdr, data = rows[0], [r.split("|") for r in rows[1:]]

changes = {}
for arg in sys.argv[1:]:
    sid, rest = arg.split("=", 1)
    parts = rest.split(":")
    changes[sid] = parts

COLS = hdr.split("|")
idx = {c: i for i, c in enumerate(COLS)}

for r in data:
    sid = r[0]
    if sid not in changes:
        continue
    parts = changes[sid]
    r[idx["status"]] = parts[0]
    if len(parts) > 1 and parts[1]:
        r[idx["assigned"]] = parts[1]
    if len(parts) > 2 and parts[2]:
        r[idx["branch"]] = parts[2]
    if len(parts) > 3 and parts[3]:
        r[idx["notes"]] = parts[3]

P.write_text("\n".join([hdr] + ["|".join(r) for r in data]) + "\n")
for r in data:
    if r[0] in changes:
        print(r[0], r[idx["status"]], r[idx["assigned"]], r[idx["branch"]])
