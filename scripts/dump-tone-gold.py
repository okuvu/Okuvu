#!/usr/bin/env python3
"""Print the tone_alliance gold-set entries (message + requirement labels) and the
A2 prompt sections that govern continuity and pacing."""
import json
import os

ROOT = "/opt/data/okuvu/ts"
GS = os.path.join(ROOT, "apps/api/eval/v2/gold-set.v2.json")

d = json.load(open(GS))

scenarios = d.get("scenarios") or d.get("messages") or []
print("gold set keys:", list(d.keys()))
print("thresholds:", json.dumps(d.get("thresholds"), indent=2))
print()

for s in scenarios:
    if s.get("category") != "tone_alliance":
        continue
    print("=" * 90)
    print(f"{s['id']}  subset={s.get('subset')}")
    print(f"  MSG: {s.get('input') or s.get('message')!r}")
    if s.get("context"):
        print(f"  CTX: {s.get('context')!r}")
    for g in s.get("groups", []):
        print(f"  [{g.get('kind')}] {g.get('id')}: {g.get('label')}")
        if g.get("must_include"):
            print(f"      include: {g.get('must_include')}")
        if g.get("must_exclude"):
            print(f"      exclude: {g.get('must_exclude')}")
