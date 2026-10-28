#!/usr/bin/env python3
"""Resource-constrained schedule for the Okuvu launch backlog.

Models every story in plan/launch-backlog.psv as a task with an agent owner, a
duration in agent-hours derived from its dev-day estimate, and the dependencies
declared in the backlog itself. Then list-schedules under an agent pool with
critical-path priority and prints waves, per-agent load, critical path and
makespan.

Rules enforced (exit 1 with FATAL):
  * an unknown dependency id
  * a dependency cycle
  * a story assigned to two agents, or to nobody
Stories owned by a human or by the calendar are excluded from the agent
makespan and reported separately, because no amount of agent parallelism
compresses them.
"""
from __future__ import annotations
import os
import sys
import pathlib

PSV = pathlib.Path(__file__).resolve().parent / "launch-backlog.psv"

# agent-hours = dev_days * 8 * COMP[owner class]. Calibrated from this session:
# infra/config and verification stories ran at roughly a third of the human
# estimate once a full build-test-loop was available.
# overridable so the same model can be run best-case and risk-adjusted
COMP = {"build": float(os.environ.get("COMP_BUILD", 0.30)),
        "ops": float(os.environ.get("COMP_OPS", 0.35))}

# each story costs a fresh agent a spawn + orientation before any working hour
ORIENT = float(os.environ.get("ORIENT", 0.30))

# wall-clock floor in hours: CI runs, rollouts, snapshots, DNS
FLOOR = {
    "E15-S1": 1.0, "E15-S2": 0.5, "E15-S3": 1.0, "E15-S5": 0.5,
    "E15-S4": 0.5, "E15-S6": 0.25, "E16-S1": 0.25, "E16-S2": 0.25,
    "E16-S4": 0.5, "E16-S6": 0.4, "E18-S2": 0.3, "E18-S3": 0.75,
    "E18-S5": 0.3, "E17-S3": 0.5, "E17-S5": 0.75, "E19-S2": 0.25,
}

# fraction of the estimate already delivered before the plan starts
DONE = {"E15-S1": 0.0, "E15-S4": 0.4, "E17-S2": 0.4}

AGENT = {
    "A1-infra":    ["E15-S5", "E15-S6", "E16-S1", "E16-S2"],
    "A10-ci":      ["E15-S1", "E15-S2", "E15-S3", "E15-S4"],
    "A2-model":    ["E17-S2"],
    "A3-runtime":  ["E17-S1", "E17-S3", "E17-S6"],
    "A4-safety":   ["E17-S4", "E17-S5"],
    "A5-portal":   ["E16-S3", "E16-S4"],
    "A6-verify":   ["E16-S5", "E16-S6", "E18-S4", "E20-S1"],
    "A7-security": ["E16-S7", "E20-S2"],
    "A8-android":  ["E18-S1", "E18-S2", "E18-S3", "E18-S5"],
    "A9-store":    ["E19-S2", "E19-S3", "E19-S4"],
}

HUMAN_IDS = {"E19-S1", "E17-S7", "E19-S5", "E19-S6", "E19-S7", "E20-S3"}
# human-owned work an agent must wait for, i.e. a real gate rather than a
# fast yes/no from Rajwant
HARD_GATE = {"E17-S7", "E19-S5", "E19-S6", "E19-S7", "E20-S3"}


def load():
    rows = {}
    for line in PSV.read_text().splitlines()[1:]:
        if not line.strip():
            continue
        sid, epic, title, owner, deps, days, acc = line.split("|")
        rows[sid] = dict(epic=epic, title=title, owner=owner, days=float(days),
                         deps=[d for d in deps.split(",") if d and d != "-"])
    for sid, r in rows.items():
        for d in r["deps"]:
            if d not in rows:
                sys.exit(f"FATAL {sid} depends on unknown story {d}")
    return rows


def check_cycles(rows):
    state = {}

    def walk(n, stack):
        if state.get(n) == 1:
            sys.exit("FATAL cycle: " + " -> ".join(stack + [n]))
        if state.get(n) == 2:
            return
        state[n] = 1
        for d in rows[n]["deps"]:
            walk(d, stack + [n])
        state[n] = 2

    for n in rows:
        walk(n, [])


def build_agent_map(rows):
    m = {}
    for a, ids in AGENT.items():
        for s in ids:
            if s in m:
                sys.exit(f"FATAL {s} assigned to two agents")
            m[s] = a
    for s in m:
        if s not in rows:
            sys.exit(f"FATAL {s} assigned but absent from the backlog")
    for s in rows:
        if s not in m and s not in HUMAN_IDS:
            sys.exit(f"FATAL {s} is assigned to nobody")
    return m


def durations(rows, amap):
    d = {}
    for s, r in rows.items():
        if s not in amap:
            continue
        h = r["days"] * 8 * COMP.get(r["owner"], 0.30) * (1.0 - DONE.get(s, 0.0))
        d[s] = max(h, FLOOR.get(s, 0.0), 0.1) + ORIENT
    return d


def schedule(rows, amap, dur):
    """List-schedule: idle agent takes its highest-priority ready story."""
    gated = {s for s in rows if any(x in HARD_GATE for x in rows[s]["deps"])}
    runnable = {s: r for s, r in rows.items() if s in dur and s not in gated}

    memo = {}

    def downstream(n):
        """Agent-hours on the longest chain leaving n, incl. n."""
        if n in memo:
            return memo[n]
        memo[n] = 0.0
        kids = [k for k, r in runnable.items() if n in r["deps"]]
        memo[n] = dur.get(n, 0.0) + max([downstream(k) for k in kids], default=0.0)
        return memo[n]

    for n in runnable:
        downstream(n)

    pending = set(runnable)
    free_at = {a: 0.0 for a in AGENT}
    start, finish, waves = {}, {}, []
    t_now = 0.0
    guard = 0

    while pending:
        guard += 1
        if guard > 1000:
            sys.exit("FATAL scheduler did not converge")
        made = False
        for a in sorted(AGENT, key=lambda x: free_at[x]):
            if free_at[a] > t_now:
                break
            ready = [s for s in pending
                     if amap[s] == a and all(d not in pending for d in rows[s]["deps"])]
            if not ready:
                continue
            ready.sort(key=lambda s: (-downstream(s), -rows[s]["days"]))
            s = ready[0]
            start[s], finish[s] = t_now, t_now + dur[s]
            free_at[a] = finish[s]
            pending.discard(s)
            waves.append((t_now, s, a))
            made = True
        if not made:
            ahead = [f for f in free_at.values() if f > t_now]
            if not ahead:
                sys.exit("FATAL scheduler deadlock: " + ", ".join(sorted(pending)))
            t_now = min(ahead)
    return start, finish, waves, gated


rows = load()
check_cycles(rows)
amap = build_agent_map(rows)
dur = durations(rows, amap)
start, finish, waves, gated = schedule(rows, amap, dur)

eng_days = sum(rows[s]["days"] for s in dur if s not in gated)
human_days = sum(rows[s]["days"] for s in rows if s not in dur)
makespan = max(finish.values())

# critical path over the runnable graph, by agent-hours
RUN = set(finish)
cpbest = {}
pathnext = {}


def cp(n):
    if n in cpbest:
        return cpbest[n]
    kids = [k for k in RUN if n in rows[k]["deps"]]
    best_kid = max(kids, key=lambda k: cp(k)) if kids else None
    cpbest[n] = dur[n] + (cp(best_kid) if best_kid else 0.0)
    pathnext[n] = best_kid
    return cpbest[n]


for n in RUN:
    cp(n)
end = max(RUN, key=lambda s: cpbest[s])
path, cur = [], end
while cur:
    path.append(cur)
    cur = pathnext.get(cur)

print(f"stories in backlog        {len(rows)}")
print(f"agent-executable          {len(dur) - len(gated)} stories, {eng_days:.2f} dev-days")
print(f"gated by a human/calendar {len(gated)} stories: {' '.join(sorted(gated))}")
print(f"human/calendar owned      {len(HUMAN_IDS)} stories, {human_days:.2f} dev-days")
print(f"total agent work          {sum(dur[s] for s in finish):.2f} agent-hours")
print(f"MAKESPAN                  {makespan:.2f} h  across {len(AGENT)} agents")
print()
print("CRITICAL PATH")
for i, s in enumerate(reversed(path)):
    print(f"  {i+1:2d}. {s:8s} {dur[s]:5.2f}h  {rows[s]['title'][:60]}")
print(f"      = {cpbest[end]:.2f} h")
print()
print("PER AGENT")
for a in AGENT:
    jobs = [s for s in finish if amap[s] == a]
    print(f"  {a:12s} {len(jobs):2d} stories {sum(dur[s] for s in jobs):5.2f}h  free at "
          f"{max([finish[s] for s in jobs], default=0):5.2f}h")
print()
print("WAVES (start hour, story, agent)")
for t, s, a in sorted(waves):
    print(f"  +{t:5.2f}h  {s:8s} {a}")
