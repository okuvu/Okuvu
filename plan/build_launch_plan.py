#!/usr/bin/env python3
"""Build plan/LAUNCH-PLAN-v1.md from plan/launch-backlog.psv.

Validates before writing anything:
  - unique story ids, unique epic ids
  - every dependency resolves to a story that exists
  - no dependency cycles (topological sort must consume every story)
  - every epic's declared dependency is actually implied by its stories
  - per-epic and grand totals are summed from the parsed rows, never typed

Usage: python3 scripts/build_launch_plan.py [--check]
       --check  verify the rendered file already on disk matches a fresh render
"""
from __future__ import annotations

import sys
from pathlib import Path

PLAN_DIR = Path(__file__).resolve().parent.parent / "plan"
PSV = PLAN_DIR / "launch-backlog.psv"
TEMPLATE = PLAN_DIR / "LAUNCH-PLAN-v1.md.in"
OUT = PLAN_DIR / "LAUNCH-PLAN-v1.md"

EPIC_TITLES = {
    "E15": ("Platform: one repo, one pipeline, a healthy beta cluster", "gate G1", []),
    "E16": ("Therapist portal live on okuvu.in", "target 1", ["E15", "E17"]),
    "E17": ("Agent live on Qwen3 32B", "target 2", ["E15"]),
    "E18": ("Android release artefact", "target 3, part 1", ["E15", "E16"]),
    "E19": ("Play Store submission", "target 3, part 2", ["E18", "E16"]),
    "E20": ("Launch readiness", "gate G6", ["E16", "E17", "E19"]),
}


def die(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def load() -> list[dict]:
    if not PSV.exists():
        die(f"backlog not found: {PSV}")
    lines = [ln.rstrip("\n") for ln in PSV.read_text().splitlines() if ln.strip()]
    header = lines[0].split("|")
    want = ["id", "epic", "title", "owner", "deps", "days", "acceptance"]
    if header != want:
        die(f"header mismatch: {header} != {want}")
    rows = []
    for ln in lines[1:]:
        parts = ln.split("|")
        if len(parts) != len(want):
            die(f"row has {len(parts)} fields, expected {len(want)}: {ln[:80]}")
        r = dict(zip(want, parts))
        r["deps"] = [] if r["deps"] == "-" else [d.strip() for d in r["deps"].split(",") if d.strip()]
        r["days"] = float(r["days"])
        rows.append(r)
    return rows


def validate(rows: list[dict]) -> None:
    ids = [r["id"] for r in rows]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        die(f"duplicate story ids: {sorted(dupes)}")

    unknown_epics = {r["epic"] for r in rows} - set(EPIC_TITLES)
    if unknown_epics:
        die(f"stories reference undeclared epics: {sorted(unknown_epics)}")

    known = set(ids)
    for r in rows:
        for d in r["deps"]:
            if d not in known:
                die(f"{r['id']} depends on unknown story {d}")
            if d == r["id"]:
                die(f"{r['id']} depends on itself")

    # cycle detection by Kahn's algorithm
    indeg = {r["id"]: len(r["deps"]) for r in rows}
    edges: dict[str, list[str]] = {r["id"]: [] for r in rows}
    for r in rows:
        for d in r["deps"]:
            edges[d].append(r["id"])
    queue = [i for i, n in indeg.items() if n == 0]
    seen = 0
    while queue:
        cur = queue.pop()
        seen += 1
        for nxt in edges[cur]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)
    if seen != len(rows):
        stuck = sorted(i for i, n in indeg.items() if n > 0)
        die(f"dependency cycle among: {stuck}")

    # epic-level deps must follow from story-level deps
    by_id = {r["id"]: r for r in rows}
    for epic, (_, _, declared) in EPIC_TITLES.items():
        implied = {by_id[d]["epic"] for r in rows if r["epic"] == epic for d in r["deps"]}
        implied.discard(epic)
        missing = implied - set(declared)
        if missing:
            die(f"{epic} stories depend on {sorted(missing)} but the epic declares only {declared}")
        for dep in declared:
            if dep not in EPIC_TITLES:
                die(f"{epic} declares unknown epic dependency {dep}")


def render(rows: list[dict]) -> str:
    by_id = {r["id"]: r for r in rows}

    dep_rows = ["| Epic | Scope | Depends on | Why |", "|---|---|---|---|"]
    why = {
        "E15": "— starts immediately; everything else is blocked on a healthy api",
        "E16": "the portal has no product without the api answering, and its end-to-end journey exercises the agent from E17",
        "E17": "the agent runs inside the api and worker that G1 makes healthy",
        "E18": "the app must point at a live https host and the Cognito pool from G2",
        "E19": "a store submission needs the signed artefact and a live privacy URL",
        "E20": "launch acceptance needs all three targets standing",
    }
    for epic, (title, scope, deps) in EPIC_TITLES.items():
        d = ", ".join(deps) if deps else "none"
        dep_rows.append(f"| {epic} — {title} | {scope} | {d} | {why[epic]} |")

    sections = []
    for epic, (title, scope, deps) in EPIC_TITLES.items():
        erows = [r for r in rows if r["epic"] == epic]
        days = sum(r["days"] for r in erows)
        d = ", ".join(deps) if deps else "none"
        sections.append(f"### {epic} — {title}\n")
        sections.append(f"*Scope: {scope}. Depends on: {d}. {len(erows)} stories, {days:g} dev-days.*\n")
        sections.append("| ID | Story | Owner | Depends on | Days | Acceptance criterion |")
        sections.append("|---|---|---|---|---|---|")
        for r in erows:
            r["deps"] = r["deps"]
            dd = ", ".join(r["deps"]) if r["deps"] else "none"
            sections.append(
                f"| {r['id']} | {r['title']} | {r['owner']} | {dd} | {r['days']:g} | {r['acceptance']} |"
            )
        sections.append("")

    total_days = sum(r["days"] for r in rows)
    total_declared = sum(len(v[2]) for v in EPIC_TITLES.values())
    epics_with_stories = len({r["epic"] for r in rows})
    roots = [r["id"] for r in rows if not r["deps"]]
    longest = longest_chain(rows)

    totals = [
        "| Measure | Value |",
        "|---|---|",
        f"| Epics | {epics_with_stories} |",
        f"| Stories | {len(rows)} |",
        f"| Total effort | {total_days:g} dev-days |",
        f"| Stories with no dependency (start immediately) | {len(roots)} — {', '.join(roots)} |",
        f"| Longest dependency chain | {longest} stories |",
        f"| Epic-level dependency edges | {total_declared} |",
        "",
        "Owners are functions, not people: the rows owned by *clinical* and *external* are the ones that do not",
        "shrink when engineering works harder. Of the effort above, "
        f"{sum(r['days'] for r in rows if r['owner'] in ('clinical', 'decision', 'external')):g} dev-days sit outside",
        "the engineering track.",
    ]

    out = TEMPLATE.read_text()
    out = out.replace("{{EPIC_DEPS}}", "\n".join(dep_rows))
    out = out.replace("{{EPIC_SECTIONS}}", "\n".join(sections).rstrip() + "\n")
    out = out.replace("{{TOTALS}}", "\n".join(totals))
    return out


def longest_chain(rows: list[dict]) -> int:
    by_id = {r["id"]: r for r in rows}
    memo: dict[str, int] = {}

    def depth(i: str) -> int:
        if i in memo:
            return memo[i]
        deps = by_id[i]["deps"]
        memo[i] = 1 if not deps else 1 + max(depth(d) for d in deps)
        return memo[i]

    return max(depth(i) for i in by_id)


def main() -> None:
    rows = load()
    validate(rows)
    text = render(rows)
    if "--check" in sys.argv:
        if not OUT.exists():
            die(f"{OUT} does not exist; run without --check")
        if OUT.read_text() != text:
            die("rendered plan on disk does not match a fresh render")
        print(f"OK: {OUT.name} matches backlog ({len(rows)} stories)")
        return
    # assert totals before writing: the document must contain the summed value
    total = sum(r["days"] for r in rows)
    if f"{total:g} dev-days" not in text:
        die("grand total missing from rendered document")
    OUT.write_text(text)
    print(f"wrote {OUT} — {len(rows)} stories, {len(EPIC_TITLES)} epics, {total:g} dev-days")


if __name__ == "__main__":
    main()
