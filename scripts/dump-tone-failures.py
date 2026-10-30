#!/usr/bin/env python3
"""Dump the tone_alliance failures from the newest instrument run with served text.

Tells product from instrument: a reply that performs the behaviour in other words is
measurement; one that does not perform it is product.
"""
import json
import os

ROOT = "/opt/data/okuvu/ts"
CATEGORY = "tone_alliance"

FILES = [
    ("INSTR/new", "evidence/E17-S14-instrument-runs/instr-1.json"),
    ("S5b/run-1", "evidence/E17-S5b-runs/run-1.json"),
]


def probe_s5b():
    p = os.path.join(ROOT, FILES[1][1])
    if not os.path.exists(p):
        return
    d = json.load(open(p))
    print("S5b top-level keys:", list(d.keys())[:15])
    results = d.get("results") or []
    cats = {}
    for r in results:
        cats[r.get("category")] = cats.get(r.get("category"), 0) + 1
    print("S5b categories:", cats)


def dump(path, label):
    p = os.path.join(ROOT, path)
    if not os.path.exists(p):
        print("MISSING", p)
        return
    d = json.load(open(p))
    print("=" * 100)
    print(f"{label}  model={d.get('model')}  prompt={str(d.get('promptSha') or d.get('prompt_sha'))[:16]}")
    for r in d.get("results") or []:
        if r.get("category") != CATEGORY:
            continue
        fails = [rp for rp in r.get("reps", []) if rp.get("verdict") != "satisfied"]
        if not fails:
            continue
        print("-" * 100)
        print(f"{r['id']}  fails {len(fails)}/{len(r.get('reps', []))}")
        msg = (r.get("input") or r.get("message") or "")
        print(f"  MSG: {msg!r}")
        for rp in fails[:1]:
            st = rp.get("served_text") or ""
            print(f"  SERVED: {st[:600]}")
            for q in rp.get("requirements", []):
                if q.get("verdict") != "satisfied":
                    print(f"    FAIL {q.get('id')}: {q.get('reason')}")


if __name__ == "__main__":
    probe_s5b()
    dump(FILES[0][1], "INSTR/new")
