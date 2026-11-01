#!/usr/bin/env python3
"""Set one ledger row by id, column-safe. Usage: set-ledger.py <json-file>"""
import json, pathlib, sys

P = pathlib.Path("/opt/data/okuvu/ts/plan/run-ledger.psv")
updates = json.load(open(sys.argv[1]))
lines = P.read_text().splitlines()
hdr = lines[0].split("|")
out = [lines[0]]
seen = set()
for ln in lines[1:]:
    if not ln.strip():
        continue
    f = ln.split("|")
    sid = f[0]
    if sid in updates:
        for k, v in updates[sid].items():
            f[hdr.index(k)] = v
        seen.add(sid)
    out.append("|".join(f))
missing = set(updates) - seen
P.write_text("\n".join(out) + "\n")
print("updated:", sorted(seen), "missing:", sorted(missing) or "none")
for sid in sorted(seen):
    f = [l for l in out if l.startswith(sid + "|")][0].split("|")
    assert len(f) == len(hdr), f"{sid} field count {len(f)} != {len(hdr)}"
print("field counts OK")
