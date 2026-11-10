#!/usr/bin/env python3
"""Prove that a failed security gate stops the deploy.

The defect this proves fixed: CodeBuild runs `post_build` even when the build
phase failed. Every build in the 2026-11-07..11-10 history has the shape

    BUILD       FAILED      (scripts/security-gate.py ecr exited 1)
    POST_BUILD  SUCCEEDED   (migrate + register-task-definition + update-service)

so the security gate coloured the build red and production changed anyway. The
gate is now a ledger every mutating command consults, and this harness runs the
*shipping* shell blocks from buildspec.yml (extracted, never copied) against
stubbed `aws`/`npx`/gate scripts to show what each one does with a pass, a
breach, a missing ledger and a stale one.

What is proven here: the ledger's behaviour, the gate's exception handling, and
that the real post_build blocks make no mutating call when a gate is missing —
deterministically, offline, touching nothing in AWS.

What is NOT proven here: that a real CodeBuild run on develop refuses to deploy
when a scan fails. That needs one live build with a failing gate, and it is the
owner's call (it deliberately fails a deploy attempt).

Usage:
    python3 scripts/verify-release-gates.py [--keep] [--verbose]
Exit codes: 0 every case behaved as required, 1 at least one did not.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import traceback
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LEDGER_HELPER = REPO_ROOT / "scripts" / "release-gates.py"
GATE = REPO_ROOT / "scripts" / "security-gate.py"
BUILDSPEC = REPO_ROOT / "buildspec.yml"
REAL_LEDGER = Path("/tmp/release-gates.json")
DECISION_FILE = Path("/tmp/deploy-scope.env")

GATES = ("secret-scan", "typecheck", "unit-tests", "dependency-audit",
         "esm-imports", "ecr-image-scan")
SHA = "a1b2c3d4e5f6"
OTHER_SHA = "0f0f0f0f0f0f"

# gate -> the command in buildspec.yml that performs it. Used to assert that each
# one is immediately followed by its `record`, so a future edit cannot add a gate
# that nobody records (which would read as a failed gate, not a silent pass).
GATE_COMMANDS = {
    "secret-scan": "scripts/secret-scan.py tree",
    "typecheck": "cd apps/therapist-portal && npx tsc --noEmit",
    "unit-tests": "cd apps/therapist-portal && npx vitest run",
    "dependency-audit": "scripts/security-gate.py audit",
    "esm-imports": "scripts/check-esm-imports.py",
    "ecr-image-scan": "scripts/security-gate.py ecr",
}

# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------
FAKE_AWS = textwrap.dedent(
    '''\
    #!/usr/bin/env python3
    """Stub of the AWS calls buildspec.yml and security-gate.py make."""
    import json, os, sys, pathlib

    state_path = pathlib.Path(os.environ["FAKE_STATE"])
    state = json.loads(state_path.read_text())
    argv = sys.argv[1:]
    state["calls"].append(argv)

    def save():
        state_path.write_text(json.dumps(state, indent=2))

    def opt(name):
        return argv[argv.index(name) + 1] if name in argv else None

    def names_after(flag):
        out = []
        for a in argv[argv.index(flag) + 1:]:
            if a.startswith("--"):
                break
            out.append(a)
        return out

    verb = argv[:2]

    if verb == ["ecr", "describe-image-scan-findings"]:
        print(json.dumps(state.get("scan", {})))
        save(); sys.exit(0)

    if verb == ["ecs", "describe-task-definition"]:
        fam = (opt("--task-definition") or "evia-beta-api").rsplit("/", 1)[-1].rsplit(":", 1)[0]
        workload = fam.split("-")[-1]
        td = {
            "taskDefinitionArn": "arn:aws:ecs:ap-south-1:562654496378:task-definition/%s:31" % fam,
            "family": fam,
            "revision": 31,
            "status": "ACTIVE",
            "containerDefinitions": [{
                "name": workload,
                "image": "stub/%s:old" % workload,
                "environment": [],
                "portMappings": [{"containerPort": 8080}],
            }],
            "requiresAttributes": [],
            "compatibilities": ["EC2"],
        }
        q = opt("--query") or ""
        print(json.dumps(td) if q.strip() == "taskDefinition" else json.dumps({"taskDefinition": td}))
        save(); sys.exit(0)

    if verb == ["ecs", "register-task-definition"]:
        path = (opt("--cli-input-json") or "").replace("file://", "")
        pinned = json.loads(pathlib.Path(path).read_text())
        fam = pinned["family"]
        n = state["revisions"].get(fam, 31) + 1
        state["revisions"][fam] = n
        arn = "arn:aws:ecs:ap-south-1:562654496378:task-definition/%s:%d" % (fam, n)
        state["primary"][fam] = arn
        print(arn)
        save(); sys.exit(0)

    if verb == ["ecs", "update-service"]:
        state["updates"].append(opt("--service"))
        print("{}")
        save(); sys.exit(0)

    if verb == ["ecs", "wait"]:
        save(); sys.exit(0)

    if verb == ["ecs", "describe-services"]:
        fams = names_after("--services")
        q = opt("--query") or ""
        if "[0].deployments" in q.replace(" ", ""):
            print(state["primary"].get(fams[0], "") if fams else "")
            save(); sys.exit(0)
        for fam in fams:
            print(fam, state["primary"].get(fam, ""), "COMPLETED")
        save(); sys.exit(0)

    print("{}")
    save(); sys.exit(0)
    '''
)

SCAN_CLEAN = {"imageScanStatus": {"status": "COMPLETE"}, "imageScanFindings": {"findings": []}}
SCAN_CRITICAL = {
    "imageScanStatus": {"status": "COMPLETE"},
    "imageScanFindings": {"findings": [
        {"name": "CVE-2026-4738", "severity": "CRITICAL", "description": "zlib in base image"},
    ]},
}


def sh(cmd: list[str], *, cwd: Path | None = None, check: bool = True,
       env: dict[str, str] | None = None, timeout: int = 300) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=env, timeout=timeout)
    if check and proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed ({proc.returncode}):\n{proc.stdout}\n{proc.stderr}")
    return proc


class Case:
    def __init__(self, name: str, expect: str, why: str) -> None:
        self.name, self.expect, self.why = name, expect, why
        self.got = ""
        self.output = ""
        self.ok = False


# ---------------------------------------------------------------------------
# 1. The ledger CLI
# ---------------------------------------------------------------------------
def ledger_cases(root: Path) -> list[Case]:
    cases: list[Case] = []
    counter = {"n": 0}
    ledger = root / "ledger-cases.json"

    def run(args: list[str], *, sha: str = SHA, ledger_path: Path | None = None,
            build: bool = True) -> subprocess.CompletedProcess:
        cmd = [sys.executable, str(LEDGER_HELPER), "--file", str(ledger_path or ledger)]
        if sha:
            cmd += ["--sha", sha]
        cmd += args
        env = dict(os.environ)
        env.pop("CODEBUILD_RESOLVED_SOURCE_VERSION", None)
        if build:
            env["CODEBUILD_BUILD_ID"] = "evia-beta-build:test-" + str(counter["n"])
        return sh(cmd, check=False, env=env)

    def case(name: str, expect: str, why: str, steps: list[list[str]],
             ledger_path: Path | None = None, sha: str = SHA) -> None:
        counter["n"] += 1
        c = Case(name, expect, why)
        target = ledger_path or ledger
        target.unlink(missing_ok=True)
        try:
            outputs, rc = [], 0
            for step in steps:
                proc = run(step, sha=sha, ledger_path=target)
                outputs.append(f"$ release-gates.py {' '.join(step)}  -> exit {proc.returncode}")
                outputs.append((proc.stdout + proc.stderr).strip())
                rc = proc.returncode
            c.got = f"exit-{rc}"
            c.output = "\n".join(outputs)
        except Exception as exc:  # noqa: BLE001
            c.got = f"<harness error: {exc}>"
            c.output = traceback.format_exc()
        c.ok = c.got == expect
        cases.append(c)

    all_gates = [["record", g] for g in GATES]

    case("ledger/reset-then-require-empty", "exit-1",
         "a ledger with no recorded gate refuses to deploy", [["reset"], ["require"]])
    case("ledger/all-gates-pass", "exit-0",
         "all six gates recorded → deploy allowed", [["reset"], *all_gates, ["require"]])
    case("ledger/nothing-run-at-all", "exit-1",
         "no ledger exists (the build never started one) → refuse", [["require"]])
    case("ledger/record-without-reset", "exit-1",
         "a gate cannot record into a ledger that was never created",
         [["record", "secret-scan"]])

    for gate in GATES:
        case(f"ledger/missing-{gate}", "exit-1",
             f"every gate except {gate} passed → still refuse",
             [["reset"], *[["record", g] for g in GATES if g != gate], ["require"]])

    # A ledger written for a different sha, then required for this one.
    counter["n"] += 1
    c = Case("ledger/foreign-sha", "exit-1", "the ledger names another commit")
    ledger.unlink(missing_ok=True)
    try:
        run(["reset"], sha=OTHER_SHA)
        proc = run(["require"], sha=SHA)
        c.got = f"exit-{proc.returncode}"
        c.output = proc.stdout + proc.stderr
    except Exception as exc:  # noqa: BLE001
        c.got = f"<harness error: {exc}>"
        c.output = traceback.format_exc()
    c.ok = c.got == "exit-1"
    cases.append(c)

    # A corrupt ledger must not read as a pass.
    counter["n"] += 1
    c = Case("ledger/corrupt", "exit-1", "unparseable ledger is a refusal, not a pass")
    ledger.write_text("{not json", encoding="utf-8")
    try:
        proc = run(["require"])
        c.got = f"exit-{proc.returncode}"
        c.output = proc.stdout + proc.stderr
    except Exception as exc:  # noqa: BLE001
        c.got = f"<harness error: {exc}>"
        c.output = traceback.format_exc()
    c.ok = c.got == "exit-1"
    cases.append(c)
    ledger.unlink(missing_ok=True)

    # Explicitly recorded-but-failed must never count (the writer refuses to
    # produce it; a hand-edited ledger must not be trusted either).
    counter["n"] += 1
    c = Case("ledger/gate-marked-false", "exit-1", "ok:false is not a pass")
    ledger.write_text(json.dumps({
        "version": 1, "sha": SHA, "build": "x",
        "gates": {g: {"at": "2026-11-10T00:00:00Z", "ok": True} for g in GATES}
        | {"ecr-image-scan": {"at": "2026-11-10T00:00:00Z", "ok": False}},
    }), encoding="utf-8")
    try:
        proc = run(["require"])
        c.got = f"exit-{proc.returncode}"
        c.output = proc.stdout + proc.stderr
    except Exception as exc:  # noqa: BLE001
        c.got = f"<harness error: {exc}>"
        c.output = traceback.format_exc()
    c.ok = c.got == "exit-1"
    cases.append(c)
    ledger.unlink(missing_ok=True)

    case("ledger/unknown-gate-name", "exit-2", "a typo'd gate name is a usage error",
         [["reset"], ["record", "ecr-scan"]])
    case("ledger/record-twice", "exit-0", "recording the same gate twice is harmless",
         [["reset"], ["record", "secret-scan"], ["record", "secret-scan"]])

    # reset with no identity at all cannot produce a usable ledger
    counter["n"] += 1
    c = Case("ledger/reset-no-identity", "exit-2", "no commit identity → reset refuses")
    ledger.unlink(missing_ok=True)
    env = dict(os.environ)
    env.pop("CODEBUILD_RESOLVED_SOURCE_VERSION", None)
    proc = sh([sys.executable, str(LEDGER_HELPER), "--file", str(ledger), "reset"],
              check=False, env=env)
    c.got = f"exit-{proc.returncode}"
    c.output = proc.stdout + proc.stderr
    c.ok = c.got == "exit-2"
    cases.append(c)

    return cases


# ---------------------------------------------------------------------------
# 2. The ECR gate's exception handling
# ---------------------------------------------------------------------------
def exception_cases(root: Path) -> list[Case]:
    cases: list[Case] = []
    scan_state = root / "scan.state.json"
    scan_state.write_text(json.dumps({
        "calls": [], "updates": [], "primary": {},
        "revisions": {"evia-beta-api": 31}, "scan": SCAN_CRITICAL,
    }), encoding="utf-8")

    def case(name: str, expect: str, why: str, exceptions: str | None,
             findings: dict | None = None, extra: list[str] | None = None) -> None:
        c = Case(name, expect, why)
        state = json.loads(scan_state.read_text())
        state["scan"] = findings or SCAN_CRITICAL
        state["calls"] = []
        scan_state.write_text(json.dumps(state), encoding="utf-8")
        exc_path = root / f"exc-{name.replace('/', '-')}.json"
        if exceptions is not None:
            exc_path.write_text(exceptions, encoding="utf-8")
        else:
            exc_path.unlink(missing_ok=True)
        cmd = [sys.executable, str(GATE), "ecr", "--repo", "evia-beta/api",
               "--tag", SHA, "--timeout", "1"]
        if exceptions is not None:
            cmd += ["--exceptions", str(exc_path)]
        cmd += extra or []
        env = dict(os.environ)
        env["FAKE_STATE"] = str(scan_state)
        env["PATH"] = f"{root / 'bin'}:{env['PATH']}"
        try:
            proc = sh(cmd, check=False, env=env, cwd=REPO_ROOT)
            c.got = f"exit-{proc.returncode}"
            c.output = proc.stdout + proc.stderr
        except Exception as exc:  # noqa: BLE001
            c.got = f"<harness error: {exc}>"
            c.output = traceback.format_exc()
        c.ok = c.got == expect
        cases.append(c)

    case("exception/critical-no-exceptions", "exit-1",
         "a CRITICAL with no exception file breaches the gate", None)
    case("exception/critical-empty-list", "exit-1",
         "an empty exception list changes nothing", '{"exceptions": []}')
    case("exception/critical-unexpired", "exit-0",
         "a dated, owned exception lets this one CVE through",
         json.dumps({"exceptions": [{
             "cve": "CVE-2026-4738", "reason": "gdal zlib absent from the runtime path",
             "owner": "Rajwant", "expires": "2999-01-01"}]}))
    case("exception/critical-expired", "exit-1",
         "an expired exception is a failure, not a warning",
         json.dumps({"exceptions": [{
             "cve": "CVE-2026-4738", "reason": "old", "owner": "Rajwant",
             "expires": "2020-01-01"}]}))
    case("exception/other-cve-only", "exit-1",
         "an exception for a different CVE does not cover this one",
         json.dumps({"exceptions": [{
             "cve": "CVE-1999-0001", "reason": "unrelated", "owner": "Rajwant",
             "expires": "2999-01-01"}]}))
    case("exception/unparseable", "exit-1",
         "an unreadable exception list is a breach, not a pass", "{oops")
    case("exception/no-owner", "exit-1",
         "an exception must name an owner and a reason",
         json.dumps({"exceptions": [{"cve": "CVE-2026-4738", "expires": "2999-01-01"}]}))
    case("exception/bad-flag", "exit-2",
         "a misspelt flag is a usage error (argparse), never a silent pass",
         None, extra=["--exception", "x.json"])
    case("exception/clean-image", "exit-0",
         "no CRITICAL findings → gate passes", None, findings=SCAN_CLEAN)

    return cases


# ---------------------------------------------------------------------------
# 3. The shipping post_build blocks
# ---------------------------------------------------------------------------
def buildspec_commands() -> dict[str, list[str]]:
    import yaml

    spec = yaml.safe_load(BUILDSPEC.read_text())
    out: dict[str, list[str]] = {}
    bad: list[str] = []
    for phase, body in spec["phases"].items():
        cmds = body.get("commands", [])
        for i, cmd in enumerate(cmds):
            # A `- echo "a: b"` line is a YAML mapping, not a string: YAML reads
            # the colon-space as a key separator. CodeBuild then gets a mapping
            # where it expects a command. Catch it here rather than in a build.
            if not isinstance(cmd, str):
                bad.append(f"{phase}[{i}]: parsed as {type(cmd).__name__}, not a command string: {cmd!r}")
        out[phase] = cmds
    if bad:
        raise RuntimeError("buildspec.yml has commands YAML did not read as strings:\n  "
                           + "\n  ".join(bad))
    return out


def post_build_parts() -> tuple[list[str], str, str]:
    cmds = buildspec_commands()["post_build"]
    migrate = next(c for c in cmds if "prisma migrate deploy" in c)
    rollout = next(c for c in cmds if "deploy_service" in c)
    return cmds, migrate, rollout


def write_ledger(path: Path, gates: list[str], sha: str = SHA) -> None:
    path.write_text(json.dumps({
        "version": 1, "sha": sha, "build": "evia-beta-build:harness",
        "started": "2026-11-10T00:00:00Z",
        "required": list(GATES),
        "gates": {g: {"at": "2026-11-10T00:00:01Z", "ok": True} for g in gates},
    }), encoding="utf-8")


def block_cases(root: Path) -> list[Case]:
    cases: list[Case] = []
    cmds, migrate, rollout = post_build_parts()
    guard = next((x for x in cmds if x.strip() == "python3 scripts/release-gates.py require"), None)
    npx_log = root / "npx.log"
    aws_state = root / "aws.state.json"

    base_env = dict(os.environ)
    base_env["PATH"] = f"{root / 'bin'}:{base_env['PATH']}"
    base_env["FAKE_STATE"] = str(aws_state)
    base_env["NAME_PREFIX"] = "evia-beta"
    base_env["AWS_REGION"] = "ap-south-1"
    base_env["ECR_REGISTRY"] = "562654496378.dkr.ecr.ap-south-1.amazonaws.com"
    base_env["IMAGE_TAG"] = SHA
    base_env["DB_SECRET_JSON"] = json.dumps({
        "username": "okuvu", "password": "hunter2", "host": "db.internal",
        "port": 5432, "dbname": "okuvu",
    })

    def run_block(name: str, script: str, script_path: Path, gates: list[str] | None,
                  expect: str, why: str, *, run_migrations: bool = True,
                  build_sha: str = SHA, decision: str = "deploy") -> None:
        c = Case(name, expect, why)
        env = dict(base_env)
        env["RUN_MIGRATIONS"] = "true" if run_migrations else "false"
        # The ledger always describes SHA; build_sha is what this "build" claims
        # to be. A mismatch is the stale-ledger case.
        env["CODEBUILD_RESOLVED_SOURCE_VERSION"] = build_sha
        REAL_LEDGER.unlink(missing_ok=True)
        if gates is not None:
            write_ledger(REAL_LEDGER, gates, sha=SHA)
        DECISION_FILE.write_text(
            f"DEPLOY_DECISION={decision}\nDEPLOY_SCOPE_REASON='harness'\n", encoding="utf-8")
        aws_state.write_text(json.dumps({
            "calls": [], "updates": [], "primary": {}, "revisions": {},
        }), encoding="utf-8")
        npx_log.unlink(missing_ok=True)
        script_path.write_text(script, encoding="utf-8")
        try:
            proc = sh(["bash", str(script_path)], cwd=REPO_ROOT, check=False, env=env)
            calls = json.loads(aws_state.read_text())["calls"]
            registers = len([x for x in calls if x[:2] == ["ecs", "register-task-definition"]])
            updates = len([x for x in calls if x[:2] == ["ecs", "update-service"]])
            migrated = npx_log.exists()
            c.got = f"exit-{proc.returncode} reg-{registers} upd-{updates} migrate-{int(migrated)}"
            c.output = proc.stdout[-3000:] + proc.stderr[-2000:]
        except Exception as exc:  # noqa: BLE001
            c.got = f"<harness error: {exc}>"
            c.output = traceback.format_exc()
        c.ok = c.got == expect
        cases.append(c)
        REAL_LEDGER.unlink(missing_ok=True)
        DECISION_FILE.unlink(missing_ok=True)

    # The guard that opens the phase.
    if guard is None:
        c = Case("guard/present-in-buildspec", "present", "post_build must open with the guard")
        c.got = "absent"
        c.output = "no `release-gates.py require` command found in post_build"
        cases.append(c)
    else:
        run_block("guard/all-gates-pass", guard, root / "g1.sh", list(GATES),
                  "exit-0 reg-0 upd-0 migrate-0", "all gates recorded → the guard passes")
        run_block("guard/ecr-gate-missing", guard, root / "g2.sh",
                  [g for g in GATES if g != "ecr-image-scan"],
                  "exit-1 reg-0 upd-0 migrate-0", "a failed image scan stops the phase here")
        run_block("guard/no-ledger", guard, root / "g3.sh", None,
                  "exit-1 reg-0 upd-0 migrate-0", "a build with no ledger cannot deploy")

    # The migration block guards itself, so a reordered buildspec cannot help.
    run_block("migrate/all-gates-pass", migrate, root / "m1.sh", list(GATES),
              "exit-0 reg-0 upd-0 migrate-1", "all gates pass → migrations run")
    run_block("migrate/ecr-gate-missing", migrate, root / "m2.sh",
              [g for g in GATES if g != "ecr-image-scan"],
              "exit-1 reg-0 upd-0 migrate-0", "a failed image scan means no migration")
    run_block("migrate/no-ledger", migrate, root / "m3.sh", None,
              "exit-1 reg-0 upd-0 migrate-0", "no ledger means no migration")
    run_block("migrate/stale-ledger", migrate, root / "m4.sh", list(GATES),
              "exit-1 reg-0 upd-0 migrate-0", "a ledger for another commit means no migration",
              build_sha=OTHER_SHA)

    # The rollout block guards itself likewise.
    run_block("rollout/all-gates-pass", rollout, root / "r1.sh", list(GATES),
              "exit-0 reg-3 upd-3 migrate-0", "all gates pass → three services roll",
              run_migrations=False)
    run_block("rollout/ecr-gate-missing", rollout, root / "r2.sh",
              [g for g in GATES if g != "ecr-image-scan"],
              "exit-1 reg-0 upd-0 migrate-0",
              "THE REGRESSION: a failed image scan now makes no ECS call at all",
              run_migrations=False)
    run_block("rollout/secret-scan-missing", rollout, root / "r3.sh",
              [g for g in GATES if g != "secret-scan"],
              "exit-1 reg-0 upd-0 migrate-0", "any missing gate blocks the rollout",
              run_migrations=False)
    run_block("rollout/unit-tests-missing", rollout, root / "r4.sh",
              [g for g in GATES if g != "unit-tests"],
              "exit-1 reg-0 upd-0 migrate-0", "a failed test run blocks the rollout",
              run_migrations=False)
    run_block("rollout/no-ledger", rollout, root / "r5.sh", None,
              "exit-1 reg-0 upd-0 migrate-0", "no ledger → no ECS mutation",
              run_migrations=False)
    run_block("rollout/stale-ledger", rollout, root / "r6.sh", list(GATES),
              "exit-1 reg-0 upd-0 migrate-0", "another commit's ledger → no ECS mutation",
              run_migrations=False, build_sha=OTHER_SHA)

    return cases


# ---------------------------------------------------------------------------
# 4. Structural wiring, and every block parses
# ---------------------------------------------------------------------------
def structural_cases() -> list[Case]:
    cases: list[Case] = []
    cmds = buildspec_commands()
    pre, build, post = cmds["pre_build"], cmds["build"], cmds["post_build"]
    everything = pre + build + post

    c = Case("wiring/guard-opens-post_build", "yes",
             "the standalone guard must run before the migrate block, within the "
             "first two commands")
    guard_at = next((i for i, x in enumerate(post)
                     if x.strip() == "python3 scripts/release-gates.py require"), None)
    migrate_at = next((i for i, x in enumerate(post) if "prisma migrate deploy" in x), None)
    c.got = "yes" if (guard_at is not None and migrate_at is not None
                      and guard_at <= 1 and guard_at < migrate_at) else \
        f"no (guard={guard_at}, migrate={migrate_at})"
    c.output = f"post_build order: {[x.splitlines()[0][:50] for x in post]}"
    c.ok = c.got == "yes"
    cases.append(c)

    c = Case("wiring/reset-before-secret-scan", "yes",
             "the ledger must exist before the first gate records into it")
    reset_at = next((i for i, x in enumerate(everything) if "release-gates.py reset" in x), None)
    scan_at = next((i for i, x in enumerate(everything) if GATE_COMMANDS["secret-scan"] in x), None)
    c.got = "yes" if reset_at is not None and scan_at is not None and reset_at < scan_at else \
        f"no (reset={reset_at}, scan={scan_at})"
    c.output = f"reset at {reset_at}, secret scan at {scan_at}"
    c.ok = c.got == "yes"
    cases.append(c)

    for gate, marker in GATE_COMMANDS.items():
        c = Case(f"wiring/{gate}-is-recorded", "yes",
                 f"`{marker}` must be immediately followed by record {gate}")
        idx = next((i for i, x in enumerate(everything) if marker in x), None)
        nxt = everything[idx + 1] if idx is not None and idx + 1 < len(everything) else ""
        c.got = "yes" if idx is not None and f"record {gate}" in nxt else \
            f"no (idx={idx}, next={nxt[:50]!r})"
        c.output = f"gate at index {idx}; next command: {nxt[:160]!r}"
        c.ok = c.got == "yes"
        cases.append(c)

    c = Case("wiring/ecr-gate-uses-exceptions", "yes",
             "the image gate must read the dated exception list")
    ecr_cmd = next((x for x in build if "security-gate.py ecr" in x), "")
    c.got = "yes" if "--exceptions scripts/security-gate-exceptions.json" in ecr_cmd else "no"
    c.output = ecr_cmd[:400]
    c.ok = c.got == "yes"
    cases.append(c)

    for label, block, danger in (
        ("migrate", next(x for x in post if "prisma migrate deploy" in x), "prisma migrate deploy"),
        ("rollout", next(x for x in post if "deploy_service" in x), 'deploy_service "${NAME_PREFIX}-worker"'),
    ):
        c = Case(f"wiring/{label}-block-guards-itself", "yes",
                 f"the {label} block must call require before `{danger}`")
        guard_at = block.find("release-gates.py require")
        danger_at = block.find(danger)
        c.got = "yes" if 0 <= guard_at < danger_at else f"no (guard={guard_at}, danger={danger_at})"
        c.output = block[max(0, guard_at - 200):danger_at + 60]
        c.ok = c.got == "yes"
        cases.append(c)

    # Every shell block parses.
    c = Case("wiring/bash-n", "0-bad", "every command block in buildspec.yml parses")
    bad: list[str] = []
    total = 0
    for phase, block_cmds in cmds.items():
        for i, cmd in enumerate(block_cmds):
            total += 1
            with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as handle:
                handle.write(cmd + "\n")
                path = handle.name
            proc = sh(["bash", "-n", path], check=False)
            if proc.returncode != 0:
                bad.append(f"{phase}[{i}]: {proc.stderr.strip()}")
            Path(path).unlink(missing_ok=True)
    c.got = f"{len(bad)}-bad"
    c.output = f"{total} blocks checked\n" + "\n".join(bad)
    c.ok = not bad
    cases.append(c)

    return cases


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="prove a failed gate stops the deploy")
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv[1:])

    root = Path(tempfile.mkdtemp(prefix="release-gates-proof-"))
    (root / "bin").mkdir()
    for name, body in (("aws", FAKE_AWS),
                       ("npx", '#!/bin/sh\necho "npx $*" >> "$NPX_LOG"\nexit 0\n')):
        path = root / "bin" / name
        path.write_text(body, encoding="utf-8")
        path.chmod(0o755)
    os.environ["NPX_LOG"] = str(root / "npx.log")
    # The npx stub reads $NPX_LOG, which the blocks inherit through the env.
    (root / "bin" / "npx").write_text(
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NPX_LOG"\nexit 0\n', encoding="utf-8")

    try:
        cases = ledger_cases(root)
        cases += exception_cases(root)
        cases += block_cases(root)
        cases += structural_cases()

        width = max(len(c.name) for c in cases)
        print(f"{'case'.ljust(width)}  expect    got                            result")
        print(f"{'-' * width}  --------  -----------------------------  ------")
        for c in cases:
            print(f"{c.name.ljust(width)}  {c.expect:<8}  {c.got:<29}  {'PASS' if c.ok else 'FAIL'}")
        print()

        failures = [c for c in cases if not c.ok]
        if args.verbose or failures:
            for c in failures or cases:
                print(f"===== {c.name} — want {c.expect}, got {c.got}")
                print(f"      why: {c.why}")
                print(textwrap.indent(c.output.strip(), "      "))
                print()

        print(f"{len(cases) - len(failures)}/{len(cases)} cases behaved as required")
        if failures:
            print("FAILED: " + ", ".join(c.name for c in failures))
            return 1
        print("OK: a failed gate, a missing gate, a missing ledger or another commit's")
        print("    ledger each stop the migration and every ECS mutation; with all six")
        print("    gates recorded the same blocks migrate and roll as before.")
        return 0
    finally:
        REAL_LEDGER.unlink(missing_ok=True)
        DECISION_FILE.unlink(missing_ok=True)
        if args.keep:
            print(f"scratch tree kept at {root}")
        else:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
