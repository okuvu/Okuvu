#!/usr/bin/env python3
"""The release-gate ledger: what THIS build proved before it may touch production.

Why this exists
---------------
buildspec.yml ran its security gates and then rolled out anyway. On 2026-11-09 a
build failed the ECR image-scan gate at 17:11 and `post_build` still ran
`prisma migrate deploy` and rolled all three services at 17:16; every build in
the CodeBuild history for 2026-11-07..11-10 has the same shape:

    BUILD        FAILED      (security-gate.py ecr exited 1)
    POST_BUILD   SUCCEEDED   (migrate + register-task-definition + update-service)

CodeBuild does not stop later phases when an earlier phase fails, so "the gate
is at the end of the build phase" was never a control. A gate that only colours
the build red is a dashboard, not a gate.

The ledger makes the control local to the dangerous command instead of to the
phase order: each gate records its own pass, and every command that mutates live
state refuses to run unless ALL of them are recorded, for this commit, in this
build. Absence is failure — a missing file, a corrupt file, a ledger from another
commit, a gate that never ran, a gate that ran and failed: every one of them
means no migration and no rollout.

Usage
-----
    release-gates.py reset              # start a build's ledger (fail-closed empty)
    release-gates.py record <gate>      # called immediately after a gate passes
    release-gates.py require            # guard in front of every mutating command
    release-gates.py show               # human summary, exit 0 always

The ledger lives in /tmp/release-gates.json by default: one CodeBuild build is
one container, so /tmp is per-build, and buildspec.yml already carries the
deploy-scope decision across phases the same way.

Exit codes: 0 the requested action succeeded, 1 the ledger says this build may
not deploy (or cannot be trusted), 2 usage/tooling error. Both non-zero codes
mean "do not deploy": there is no exit code that means "probably fine".
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_LEDGER = Path("/tmp/release-gates.json")

# The gates a build must pass before it may change anything that is live. Order
# here is the order buildspec.yml runs them, and it is what `require` prints.
REQUIRED: tuple[str, ...] = (
    "secret-scan",      # no new credential in the tree
    "typecheck",        # api, worker, portal compile
    "unit-tests",       # api, worker, portal test suites
    "dependency-audit", # no CRITICAL advisory in production dependencies
    "esm-imports",      # no container-only import failure
    "ecr-image-scan",   # no CRITICAL CVE in the three pushed images
)

LEDGER_VERSION = 1


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _identity(sha_arg: str | None) -> tuple[str, str]:
    """(commit tag, build id) — the ledger is only valid for the build that wrote it."""
    sha = (sha_arg or os.environ.get("CODEBUILD_RESOLVED_SOURCE_VERSION") or "").strip()
    if len(sha) > 12:
        sha = sha[:12]
    build = (os.environ.get("CODEBUILD_BUILD_ID") or "").strip()
    return sha, build


def _load(path: Path) -> dict:
    """Read the ledger or raise. Callers decide whether that is fatal."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError("ledger is not a JSON object")
    gates = data.get("gates")
    if not isinstance(gates, dict):
        raise ValueError("ledger has no gates object")
    return data


def _write(path: Path, data: dict) -> None:
    """Write atomically: a half-written ledger must never read as a pass."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile("w", dir=str(path.parent), delete=False,
                                         prefix=".release-gates.", suffix=".json")
    try:
        json.dump(data, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    finally:
        handle.close()
    os.replace(handle.name, path)


def cmd_reset(args: argparse.Namespace) -> int:
    sha, build = _identity(args.sha)
    if not sha:
        print("release-gates: cannot reset — no commit identity "
              "(CODEBUILD_RESOLVED_SOURCE_VERSION unset and no --sha)", file=sys.stderr)
        return 2
    _write(args.file, {
        "version": LEDGER_VERSION,
        "sha": sha,
        "build": build,
        "started": _now(),
        "required": list(REQUIRED),
        "gates": {},
    })
    print(f"release-gates: ledger started for {sha} ({build or 'no build id'}); "
          f"{len(REQUIRED)} gates required, 0 passed")
    return 0


def cmd_record(args: argparse.Namespace) -> int:
    gate = args.gate
    if gate not in REQUIRED:
        print(f"release-gates: {gate!r} is not a required gate; known gates: "
              f"{', '.join(REQUIRED)}", file=sys.stderr)
        return 2
    try:
        data = _load(args.file)
    except FileNotFoundError:
        # A gate that passes in a build that never reset has no ledger to write
        # to. Refuse rather than create one: `reset` is the only creator, so a
        # gate cannot vouch for a build it did not start in.
        print(f"release-gates: no ledger at {args.file} — `reset` must run first",
              file=sys.stderr)
        return 1
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"release-gates: cannot read {args.file}: {exc}", file=sys.stderr)
        return 1

    sha, _build = _identity(args.sha)
    if sha and data.get("sha") != sha:
        print(f"release-gates: ledger is for {data.get('sha')!r}, this build is {sha!r} "
              "— refusing to record into another commit's ledger", file=sys.stderr)
        return 1

    data.setdefault("gates", {})[gate] = {"at": _now(), "ok": True}
    try:
        _write(args.file, data)
    except OSError as exc:
        print(f"release-gates: cannot write {args.file}: {exc}", file=sys.stderr)
        return 1
    passed = len(data["gates"])
    print(f"release-gates: recorded {gate} ({passed}/{len(REQUIRED)} gates)")
    return 0


def cmd_require(args: argparse.Namespace) -> int:
    """The guard. Prints why and exits 1 unless every gate passed in this build."""
    sha, build = _identity(args.sha)
    label = f"sha {sha or '<unknown>'} build {build or '<unknown>'}"

    try:
        data = _load(args.file)
    except FileNotFoundError:
        print(f"REFUSING TO DEPLOY ({label}): no release-gate ledger at {args.file}. "
              "No gate has run in this build, or the build did not start with "
              "`release-gates.py reset`.", file=sys.stderr)
        return 1
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"REFUSING TO DEPLOY ({label}): the release-gate ledger at {args.file} "
              f"cannot be read ({exc}). An unreadable ledger is not a pass.", file=sys.stderr)
        return 1

    if sha and data.get("sha") != sha:
        print(f"REFUSING TO DEPLOY ({label}): the ledger belongs to "
              f"{data.get('sha')!r}, so it describes a different commit.", file=sys.stderr)
        return 1

    gates = data.get("gates") or {}

    # A ledger is evidence about one commit. With no commit identity there is
    # nothing to bind it to, so the only safe answer is no: an unidentifiable
    # build could otherwise present any ledger that happened to be in /tmp.
    if not sha:
        print(f"REFUSING TO DEPLOY ({label}): this build has no commit identity "
              "(CODEBUILD_RESOLVED_SOURCE_VERSION unset and no --sha), so no ledger "
              "can be shown to be about it.", file=sys.stderr)
        return 1
    missing: list[str] = []
    print(f"release gates ({label}):")
    for gate in REQUIRED:
        entry = gates.get(gate)
        if isinstance(entry, dict) and entry.get("ok") is True:
            print(f"  PASS     {gate:<16} {entry.get('at', '')}")
        else:
            print(f"  MISSING  {gate:<16} — did not pass in this build")
            missing.append(gate)

    if missing:
        print("", file=sys.stderr)
        print(f"REFUSING TO DEPLOY: {len(missing)} of {len(REQUIRED)} gates did not pass "
              f"({', '.join(missing)}). Nothing live may change until they do.", file=sys.stderr)
        return 1
    print(f"all {len(REQUIRED)} gates passed — this build may deploy")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    try:
        data = _load(args.file)
    except FileNotFoundError:
        print(f"release-gates: no ledger at {args.file}")
        return 0
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"release-gates: unreadable ledger at {args.file}: {exc}")
        return 0
    print(f"sha={data.get('sha')} build={data.get('build')} started={data.get('started')}")
    for gate in REQUIRED:
        entry = (data.get("gates") or {}).get(gate)
        state = f"PASS {entry.get('at', '')}" if isinstance(entry, dict) and entry.get("ok") else "MISSING"
        print(f"  {gate:<16} {state}")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="release-gate ledger", allow_abbrev=False)
    parser.add_argument("--file", type=Path, default=DEFAULT_LEDGER,
                        help=f"ledger path (default {DEFAULT_LEDGER})")
    parser.add_argument("--sha", default=None,
                        help="commit tag; defaults to CODEBUILD_RESOLVED_SOURCE_VERSION")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("reset").set_defaults(func=cmd_reset)
    p_record = sub.add_parser("record")
    p_record.add_argument("gate", choices=list(REQUIRED))
    p_record.set_defaults(func=cmd_record)
    sub.add_parser("require").set_defaults(func=cmd_require)
    sub.add_parser("show").set_defaults(func=cmd_show)

    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except Exception as exc:  # noqa: BLE001 — a crashed guard must not read as a pass
        print(f"release-gates: ERROR {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
