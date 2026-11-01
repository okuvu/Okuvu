#!/usr/bin/env python3
"""Validate plan/run-ledger.psv: field count per row and %Y-%m-%dT%H:%MZ timestamps.

Repairs the known column shift (a dropped `commit` cell) once, in place, after
copying the file to plan/run-ledger.psv.bak. Exits non-zero on anything it
cannot fix so a wave cannot be reported from a malformed ledger.
"""
import sys, pathlib, datetime, shutil

P = pathlib.Path(__file__).resolve().parent.parent / "plan" / "run-ledger.psv"
HDR = "id|epic|title|owner|deps|status|assigned|branch|commit|evidence|verified_at|verified_by|notes"
N = len(HDR.split("|"))
STATUSES = {"verified", "in_review", "in_progress", "not_started", "blocked"}

lines = P.read_text().splitlines()
if lines[0] != HDR:
    sys.exit(f"header mismatch: {lines[0]}")

bad, fixed, out = [], [], [HDR]
for ln in lines[1:]:
    if not ln.strip():
        continue
    f = ln.split("|")
    if len(f) == N - 1 and f[5] in STATUSES:
        f = f[:8] + [""] + f[8:]
        ln = "|".join(f)
        fixed.append(f[0])
    if len(f) != N:
        bad.append((f[0], f"{len(f)} fields"))
        out.append(ln)
        continue
    if f[10]:
        try:
            datetime.datetime.strptime(f[10], "%Y-%m-%dT%H:%MZ")
        except ValueError:
            bad.append((f[0], f"bad verified_at {f[10]!r}"))
    if f[5] not in STATUSES:
        bad.append((f[0], f"unknown status {f[5]!r}"))
    out.append(ln)

if fixed:
    shutil.copy2(P, P.with_suffix(".psv.bak"))
    P.write_text("\n".join(out) + "\n")
    pathlib.Path(P.with_suffix(".psv.bak")).unlink()

print("rows:", len(out) - 1)
print("column-shift repaired:", fixed or "none")
print("remaining problems:", bad or "none")
sys.exit(1 if bad else 0)
