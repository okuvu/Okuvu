#!/usr/bin/env python3
"""Append a story to the backlog and its ledger row, refusing duplicates."""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
B = ROOT / "plan" / "launch-backlog.psv"
L = ROOT / "plan" / "run-ledger.psv"

story = sys.argv[1]
row = sys.argv[2]

for p, check in ((B, story.split("|")[0]), (L, story.split("|")[0])):
    if any(l.startswith(check + "|") for l in p.read_text().splitlines()):
        sys.exit(f"{check} already present in {p.name}")

for p, line in ((B, story), (L, row)):
    t = p.read_text()
    if not t.endswith("\n"):
        t += "\n"
    p.write_text(t + line + "\n")
print("appended to", B.name, "and", L.name)
