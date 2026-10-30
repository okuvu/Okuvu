#!/usr/bin/env python3
"""Which unfinished stories are actually blocked by a human-owned dependency?
Reads plan/run-ledger.psv and walks dependency chains transitively."""
import sys

LED = "plan/run-ledger.psv"
HUMAN = {"clinical", "decision", "external"}


def load(path):
    with open(path, encoding="utf-8") as f:
        lines = [l.rstrip("\n") for l in f if l.strip()]
    hdr = lines[0].split("|")
    return {p[0]: dict(zip(hdr, p)) for p in (l.split("|") for l in lines[1:])}


L = load(LED)


def deps(s):
    d = (L.get(s, {}).get("deps") or "-").strip()
    return [x.strip() for x in d.split(",") if x.strip() and x.strip() != "-"]


def chain(s, seen=None):
    seen = set() if seen is None else seen
    out = set()
    for d in deps(s):
        if d in seen:
            continue
        seen.add(d)
        out.add(d)
        out |= chain(d, seen)
    return out


unfinished = [s for s, r in L.items() if r["status"] in ("not_started", "in_review", "in_progress")]
print(f"ledger stories: {len(L)}   unfinished: {len(unfinished)}")

free, blocked = [], {}
for s in unfinished:
    c = chain(s)
    hum = [d for d in c if L.get(d, {}).get("owner") in HUMAN and L.get(d, {}).get("status") != "verified"]
    (blocked.setdefault(s, hum) if hum else free.append(s))

print("\n=== NOT blocked by an unfinished human story ===")
for s in sorted(free):
    r = L[s]
    print(f"  {s:9} {r['status']:12} owner={r['owner']:9} deps={r['deps']:22} {r['title'][:58]}")

print("\n=== blocked by an unfinished human story ===")
for s in sorted(blocked):
    r = L[s]
    print(f"  {s:9} {r['status']:12} owner={r['owner']:9} <- {','.join(blocked[s])}")

# human stories not yet verified
print("\n=== human-owned stories not verified ===")
for s, r in L.items():
    if r["owner"] in HUMAN and r["status"] != "verified":
        print(f"  {s:9} {r['status']:12} deps={r['deps']:16} {r['title'][:60]}")
