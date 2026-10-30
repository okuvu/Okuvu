#!/usr/bin/env python3
"""Size the tone_alliance gap from committed v2 run reports.

Aggregates failing judgements per scenario and per requirement id across every
counted run, so the dispatch plan is built on counts rather than prose.
"""
import json
import os
import sys
from collections import Counter, defaultdict

ROOT = "/opt/data/okuvu/ts"

RUN_FILES = [
    ("S5b/run-1", "evidence/E17-S5b-runs/run-1.json"),
    ("S5b/run-2", "evidence/E17-S5b-runs/run-2.json"),
    ("S5b/run-3", "evidence/E17-S5b-runs/run-3.json"),
    ("INSTR/old", "evidence/E17-S14-instrument-runs/instr-0-old-instrument.json"),
    ("INSTR/new", "evidence/E17-S14-instrument-runs/instr-1.json"),
]

CATEGORY = "tone_alliance"


def agg():
    per_file = {}
    scen_total = Counter()
    scen_fail = Counter()
    req_fail = Counter()
    req_total = Counter()
    reps_per_scen = Counter()

    for label, rel in RUN_FILES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            print(f"MISSING {label} {rel}")
            continue
        with open(p) as fh:
            d = json.load(fh)
        results = d.get("results") or d.get("scenarios") or []
        tot = 0
        ok = 0
        s_fail = Counter()
        for r in results:
            if r.get("category") != CATEGORY:
                continue
            rid = r.get("id")
            for rp in r.get("reps", []):
                tot += 1
                reps_per_scen[rid] += 1
                if rp.get("verdict") == "satisfied":
                    ok += 1
                else:
                    s_fail[rid] += 1
                    for q in rp.get("requirements", []):
                        qid = q.get("id")
                        req_total[qid] += 1
                        if q.get("verdict") != "satisfied":
                            req_fail[qid] += 1
        per_file[label] = (ok, tot)
        for k, v in s_fail.items():
            scen_fail[k] += v
        for k, v in reps_per_scen.items():
            pass
        # scenario totals are per-file; recompute below
        for r in results:
            if r.get("category") != CATEGORY:
                continue
            scen_total[r.get("id")] += len(r.get("reps", []))

    print("PER-RUN tone_alliance")
    for label, (ok, tot) in per_file.items():
        pct = (100.0 * ok / tot) if tot else 0.0
        print(f"  {label:12s} {ok:3d}/{tot:3d}  {pct:5.1f}%")

    print("\nFULL-SET scenario totals")
    for k in sorted(scen_total):
        print(f"  {k:8s} reps={scen_total[k]}")

    print("\nPER-SCENARIO failures (across all runs above)")
    total_reps = sum(scen_total.values())
    total_fail = sum(scen_fail.values())
    print(f"  total judgements {total_reps}, failing {total_fail}")
    for k, v in scen_fail.most_common():
        print(f"  {k:8s} fail={v:3d} of {scen_total[k]:3d}  ({100.0*v/scen_total[k]:5.1f}%)")

    print("\nPER-REQUIREMENT failures")
    for k, v in req_fail.most_common():
        print(f"  {k:20s} fail={v:3d} of {req_total[k]:3d}")

    # allowed failures arithmetic at n per run
    print("\nCLOSABILITY")
    for label, (ok, tot) in per_file.items():
        per_run_n = tot / 3 if tot and "INSTR" not in label else tot / 3
        print(f"  {label}: judgements/run ~ {per_run_n:.0f}, allowed failures at 85% ~ {per_run_n*0.15:.0f}")


if __name__ == "__main__":
    agg()
