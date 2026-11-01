#!/usr/bin/env python3
"""Per-run category table plus per-scenario stability for the wave-13 runs."""
import json
import os
from collections import Counter, defaultdict

D = "/opt/data/okuvu/ts/evidence/wave13-runs"
FILES = [f"{D}/run-{i}.json" for i in (1, 2, 3)]
CATS = ["crisis_self_harm", "medical_emergency", "scope_boundary",
        "fail_closed", "clinical_content", "tone_alliance"]

runs = []
for f in FILES:
    d = json.load(open(f))
    runs.append(d)

print("PROMPT METADATA")
for i, d in enumerate(runs, 1):
    p = d["prompt"]
    print(f"  run {i}: version={p['version']} file={p['file']} sha={p['sha256'][:16]}")

print("\nPER-RUN CATEGORIES  (satisfied/judgements, wilson_lower, met)")
hdr = f"{'category':22s}" + "".join(f"{'run'+str(i+1):>26s}" for i in range(3))
print(hdr)
for c in CATS:
    row = f"{c:22s}"
    for d in runs:
        v = d["categories"][c]
        row += f"{v['satisfied']:>4d}/{v['judgements']:<4d} lb={v['wilson_lower']:.3f} {'Y' if v['met'] else 'N'}   "
    print(row)

o = [d["overall"] for d in runs]
row = f"{'overall':22s}"
for v in o:
    row += f"{v['satisfied']:>4d}/{v['judgements']:<4d} lb={v['wilson_lower']:.3f} {'Y' if v['met'] else 'N'}   "
print(row)
print("\n  scenarios_all_satisfied:", [v["scenarios_all_satisfied"] for v in o])

print("\nPER-SCENARIO tone_alliance failures per run")
scen = defaultdict(lambda: [0, 0, 0])
msg = {}
for i, d in enumerate(runs):
    for r in d["results"]:
        if r["category"] != "tone_alliance":
            continue
        msg[r["id"]] = r.get("message") or r.get("input") or (r.get("context") or {}).get("session_history_summary", "") or ""
        for rp in r["reps"]:
            if rp["verdict"] != "satisfied":
                scen[r["id"]][i] += 1
tot = [0, 0, 0]
for k in sorted(scen):
    v = scen[k]
    for i in range(3):
        tot[i] += v[i]
    print(f"  {k:8s} {v}  {msg.get(k,'')[:44]!r}")
print(f"  TOTAL    {tot}")

print("\nPER-SCENARIO failures, other categories")
byc = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))
for i, d in enumerate(runs):
    for r in d["results"]:
        if r["category"] == "tone_alliance":
            continue
        for rp in r["reps"]:
            if rp["verdict"] != "satisfied":
                byc[r["category"]][r["id"]][i] += 1
for c in byc:
    print(f"  [{c}]")
    t = [0, 0, 0]
    for k, v in sorted(byc[c].items()):
        for i in range(3):
            t[i] += v[i]
        print(f"    {k:8s} {v}")
    print(f"    TOTAL {t}")
