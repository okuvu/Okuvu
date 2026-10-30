#!/usr/bin/env python3
"""Is the scope_boundary move a v2.3 regression or run-to-run variance?

Compares per-scenario failures under v2.2 (instrument-corrected single run,
938bccc) against the three v2.3 runs of wave 13.
"""
import json
from collections import defaultdict

ROOT = "/opt/data/okuvu/ts"
BASE = f"{ROOT}/evidence/E17-S14-instrument-runs/instr-1.json"
NEW = [f"{ROOT}/evidence/wave13-runs/run-{i}.json" for i in (1, 2, 3)]
CATS = ["scope_boundary", "clinical_content", "tone_alliance"]


def per_scen(path):
    d = json.load(open(path))
    out = defaultdict(lambda: defaultdict(dict))
    for r in d["results"]:
        c = r["category"]
        if c not in CATS:
            continue
        fails = sum(1 for rp in r["reps"] if rp["verdict"] != "satisfied")
        out[c][r["id"]] = (fails, len(r["reps"]))
    return out


base = per_scen(BASE)
news = [per_scen(p) for p in NEW]

for c in CATS:
    print("=" * 78)
    print(c)
    ids = sorted(set(base[c]) | set(k for n in news for k in n[c]))
    tot_b = 0
    tot_n = [0, 0, 0]
    for i in ids:
        bf, bn = base[c].get(i, (0, 3))
        nf = [n[c].get(i, (0, 3))[0] for n in news]
        tot_b += bf
        for k in range(3):
            tot_n[k] += nf[k]
        flag = "  <-- v2.2 PASS, v2.3 fails" if bf == 0 and sum(nf) > 0 else ""
        print(f"  {i:8s} v2.2={bf}/3   v2.3={nf}{flag}")
    print(f"  TOTAL    v2.2={tot_b}   v2.3={tot_n}")
