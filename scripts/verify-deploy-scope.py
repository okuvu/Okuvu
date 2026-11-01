#!/usr/bin/env python3
"""Prove the deploy-scope decision: docs-only skips the rollout, code does not, and
every way of not knowing deploys.

This is the inspectable proof for the E15-S7 change. It builds a synthetic git
repository with the commit shapes that matter, feeds `scripts/deploy-scope.py` a
fake ECS whose live services are pinned to a chosen commit, and asserts the
decision. Then it runs the *shipping* buildspec shell blocks — extracted from
buildspec.yml, not copied — against stubbed `aws`/helper binaries, to prove the
fail-safe wrapper and that a skip registers no task definition.

What is proven here: the decision logic and the shell gates, deterministically,
offline. What is NOT proven here: that a real CodeBuild run on develop leaves the
three ECS services alone — that needs two pushes and a live build, and it is the
orchestrator's to run.

Usage:
    python3 scripts/verify-deploy-scope.py [--keep]
Exit codes: 0 every case behaved as required, 1 at least one case did not.
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
HELPER = REPO_ROOT / "scripts" / "deploy-scope.py"
BUILDSPEC = REPO_ROOT / "buildspec.yml"
CLUSTER = "evia-beta"
REGION = "ap-south-1"
ACCOUNT = "562654496378"
WORKLOADS = ("api", "worker", "portal")

ACCOUNT_IMAGE = f"{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/{CLUSTER}"

# ---------------------------------------------------------------------------
# The fake `aws`. Two jobs: describe something plausible for the scope helper,
# and act as a state machine for the rollout block so the harness can assert
# exactly which mutating calls a build made.
# ---------------------------------------------------------------------------
FAKE_AWS = textwrap.dedent(
    '''\
    #!/usr/bin/env python3
    """Stub of the five AWS calls buildspec.yml makes. State lives in $FAKE_STATE."""
    import json, os, sys, pathlib

    state_path = pathlib.Path(os.environ["FAKE_STATE"])
    state = json.loads(state_path.read_text())
    argv = sys.argv[1:]
    state["calls"].append(argv)

    def save():
        state_path.write_text(json.dumps(state, indent=2))

    def fail(msg, code=255):
        print(msg, file=sys.stderr)
        save()
        sys.exit(code)

    if os.environ.get("FAKE_AWS_FAIL"):
        fail("An error occurred (AccessDeniedException) when calling the DescribeServices operation")

    def opt(name):
        return argv[argv.index(name) + 1] if name in argv else None

    def query():
        return (opt("--query") or "").replace(" ", "")

    def family_of(ref):
        return ref.rsplit("/", 1)[-1].rsplit(":", 1)[0]

    def services_names():
        if "--services" not in argv:
            return []
        out = []
        for a in argv[argv.index("--services") + 1:]:
            if a.startswith("--"):
                break
            out.append(a)
        return out

    def services_block():
        out = []
        for name in services_names():
            out.append({
                "serviceName": name,
                "deployments": [{
                    "status": "PRIMARY",
                    "rolloutState": state.get("rollout", "COMPLETED"),
                    "taskDefinition": state["primary"].get(name, ""),
                }],
            })
        return out

    def taskdef(ref):
        family = family_of(ref)
        workload = family.split("-")[-1]
        arn = state["primary"].get(family) or (
            "arn:aws:ecs:%s:%s:task-definition/%s:0" % (os.environ.get("FAKE_REGION", "ap-south-1"),
                                                         os.environ.get("FAKE_ACCOUNT", "562654496378"), family))
        return {
            "taskDefinitionArn": arn,
            "family": family,
            "revision": 31,
            "status": "ACTIVE",
            "containerDefinitions": [{
                "name": workload,
                "image": "%s/%s:%s" % (os.environ["FAKE_REGISTRY"], workload,
                                       state["tags"].get(workload, "unknown")),
                "environment": [],
            }] + ([{
                "name": "otel",
                "image": "public.ecr.aws/aws-observability/aws-otel-collector:v0.40.0",
            }] if os.environ.get("FAKE_SIDECAR") else []),
            "requiresAttributes": [],
        }

    verb = argv[:2]
    if verb == ["ecs", "describe-services"]:
        blocks = services_block()
        if state.get("failures"):
            print(json.dumps({"services": blocks, "failures": state["failures"]}))
            save(); sys.exit(0)
        q = query()
        if "[0].taskDefinition" in q:
            head = blocks[0]["deployments"][0]["taskDefinition"] if blocks else ""
            print(head)
            save(); sys.exit(0)
        if q.startswith("services[]."):
            for b in blocks:
                print(b["serviceName"], b["deployments"][0]["taskDefinition"],
                      b["deployments"][0]["rolloutState"])
            save(); sys.exit(0)
        print(json.dumps({"services": blocks, "failures": []}))
        save(); sys.exit(0)

    if verb == ["ecs", "describe-task-definition"]:
        td = taskdef(opt("--task-definition"))
        q = query()
        if q == "taskDefinition.taskDefinitionArn":
            print(td["taskDefinitionArn"])
        elif q == "taskDefinition":
            print(json.dumps(td))
        else:
            print(json.dumps({"taskDefinition": td}))
        save(); sys.exit(0)

    if verb == ["ecs", "register-task-definition"]:
        path = (opt("--cli-input-json") or "").replace("file://", "")
        pinned = json.loads(pathlib.Path(path).read_text())
        family = pinned["family"]
        workload = family.split("-")[-1]
        n = state["revisions"].get(family, 31) + 1
        state["revisions"][family] = n
        arn = "arn:aws:ecs:%s:%s:task-definition/%s:%d" % (
            os.environ.get("FAKE_REGION", "ap-south-1"),
            os.environ.get("FAKE_ACCOUNT", "562654496378"), family, n)
        state["primary"][family] = arn
        image = pinned["containerDefinitions"][0]["image"]
        state["tags"][workload] = image.rsplit(":", 1)[-1]
        print(arn)
        save(); sys.exit(0)

    if verb == ["ecs", "update-service"]:
        print("{}")
        save(); sys.exit(0)

    if verb == ["ecs", "wait"]:
        save(); sys.exit(0)

    print("{}")
    save(); sys.exit(0)
    '''
)


def sh(cmd: list[str], *, cwd: Path | None = None, check: bool = True,
       env: dict[str, str] | None = None, timeout: int = 300) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=env, timeout=timeout)
    if check and proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed ({proc.returncode}):\n{proc.stdout}\n{proc.stderr}")
    return proc


# ---------------------------------------------------------------------------
# Synthetic repository
# ---------------------------------------------------------------------------
GIT_ENV = {
    "GIT_AUTHOR_NAME": "deploy-scope harness",
    "GIT_AUTHOR_EMAIL": "harness@example.invalid",
    "GIT_COMMITTER_NAME": "deploy-scope harness",
    "GIT_COMMITTER_EMAIL": "harness@example.invalid",
    "GIT_AUTHOR_DATE": "2026-10-01T00:00:00+0000",
    "GIT_COMMITTER_DATE": "2026-10-01T00:00:00+0000",
}


def git(repo: Path, *args: str) -> str:
    env = dict(os.environ, **GIT_ENV)
    return sh(["git", *args], cwd=repo, env=env).stdout


def write(repo: Path, files: dict[str, str | None]) -> None:
    for rel, content in files.items():
        target = repo / rel
        if content is None:
            target.unlink(missing_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def commit(repo: Path, message: str, files: dict[str, str | None], empty: bool = False) -> str:
    write(repo, files)
    git(repo, "add", "-A")
    args = ["commit", "-q", "-m", message]
    if empty:
        args.insert(1, "--allow-empty")
    git(repo, *args)
    return git(repo, "rev-parse", "HEAD").strip()


BASE_FILES: dict[str, str | None] = {
    "apps/api/src/index.ts": "export const boot = () => 'api';\n",
    "apps/worker/src/index.ts": "export const boot = () => 'worker';\n",
    "packages/prisma/schema.prisma": "datasource db { provider = \"postgresql\" }\n",
    "infrastructure/aws/evia-beta/ecs.tf": "resource \"aws_ecs_service\" \"api\" {}\n",
    "docs/a.md": "# doc a\n",
    "evidence/E1-S1.md": "# evidence\n",
    "plan/backlog.psv": "ID|TITLE\nE1-S1|thing\n",
    "buildspec.yml": "version: 0.2\n",
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "README.md": "# readme\n",
}


def build_origin(root: Path) -> tuple[Path, dict[str, str], dict[str, Path]]:
    """A bare origin plus one branch per commit shape. Returns (origin, shas, branches)."""
    origin = root / "origin.git"
    seed = root / "seed"
    seed.mkdir()
    git(seed, "init", "-q", "-b", "main")
    git(seed, "config", "user.email", GIT_ENV["GIT_AUTHOR_EMAIL"])
    git(seed, "config", "user.name", GIT_ENV["GIT_AUTHOR_NAME"])

    shas: dict[str, str] = {}
    shas["base"] = commit(seed, "base: everything runs here", BASE_FILES)

    branches: dict[str, Path] = {}

    def branch(name: str, files: dict[str, str | None], message: str, empty: bool = False) -> str:
        git(seed, "checkout", "-q", "-B", name, shas["base"])
        sha = commit(seed, message, files, empty=empty)
        branches[name] = seed
        return sha

    shas["docs"] = branch("docs-only", {"docs/b.md": "# doc b\n"}, "docs: a page")
    shas["docs-multi"] = branch(
        "docs-multi",
        {"docs/c.md": "# c\n", "evidence/E2-S1.md": "# more evidence\n", "plan/backlog.psv": "ID|TITLE\nE1-S1|thing\nE2-S1|other\n"},
        "docs+evidence+plan",
    )
    shas["docs-deleted"] = branch("docs-deleted", {"docs/a.md": None}, "docs: delete a stale page")
    shas["app"] = branch("app-code", {"apps/api/src/index.ts": "export const boot = () => 'api-v2';\n"}, "feat(api): change a handler")
    shas["worker"] = branch("worker-code", {"apps/worker/src/index.ts": "export const boot = () => 'worker-v2';\n"}, "feat(worker): change a job")
    shas["infra"] = branch("infra", {"infrastructure/aws/evia-beta/ecs.tf": "resource \"aws_ecs_service\" \"api\" { desired_count = 2 }\n"}, "infra: scale api")
    shas["buildspec"] = branch("buildspec", {"buildspec.yml": "version: 0.2\n# changed\n"}, "ci: change the pipeline")
    shas["lockfile"] = branch("lockfile", {"pnpm-lock.yaml": "lockfileVersion: '9.0'\n# bump\n"}, "chore(deps): lockfile")
    shas["readme"] = branch("root-readme", {"README.md": "# readme\n\nmore words\n"}, "docs: root readme")
    shas["mixed"] = branch("mixed", {"docs/d.md": "# d\n", "apps/api/src/index.ts": "export const boot = () => 'api-v3';\n"}, "docs and code together")
    shas["script"] = branch("script", {"scripts/thing.sh": "#!/bin/sh\ntrue\n"}, "chore: a script")
    shas["empty"] = branch("empty", {}, "chore: no tree change", empty=True)

    git(seed, "checkout", "-q", "main")
    # Push every branch into the bare origin so clones can pick one.
    sh(  # noqa: F841  (explicit, readable failure if the seed is wrong)
        ["git", "clone", "-q", "--bare", str(seed), str(origin)]
    )
    for name in branches:
        sh(["git", "-C", str(origin), "branch", "-f", name, name])
    sh(["git", "-C", str(origin), "branch", "-f", "main", "main"])

    # A second origin with unrelated history: the deployed commit is nowhere in it,
    # which is the "the Tag says a SHA this repo has never seen" case.
    narrow_seed = root / "narrow-seed"
    narrow_seed.mkdir()
    git(narrow_seed, "init", "-q", "-b", "narrow")
    git(narrow_seed, "config", "user.email", GIT_ENV["GIT_AUTHOR_EMAIL"])
    git(narrow_seed, "config", "user.name", GIT_ENV["GIT_AUTHOR_NAME"])
    commit(narrow_seed, "narrow: unrelated root", {"docs/z.md": "# z\n"})
    sh(["git", "clone", "-q", "--bare", str(narrow_seed), str(root / "narrow.git")])
    return origin, shas, branches


def clone(origin: Path, branch: str, dest: Path, depth: int = 1) -> Path:
    args = ["git", "clone", "-q"]
    if depth > 0:
        args.append(f"--depth={depth}")  # 0 = full clone, as git_clone_depth=0 would be
    args += ["-b", branch, origin.as_uri(), str(dest)]
    sh(args)
    return dest


# ---------------------------------------------------------------------------
# Running the helper
# ---------------------------------------------------------------------------
class Case:
    def __init__(self, name: str, expect: str, why: str) -> None:
        self.name, self.expect, self.why = name, expect, why
        self.got = ""
        self.output = ""
        self.ok = False

    def fail(self, message: str) -> None:
        self.output += f"\nHARNESS: {message}"


def fake_env(state_file: Path, *, tag: str, tags: dict[str, str] | None = None,
             rollout: str = "COMPLETED", failures: list | None = None,
             aws_fail: bool = False, sidecar: bool = False) -> dict[str, str]:
    env = dict(os.environ)
    env.update({
        "FAKE_STATE": str(state_file),
        "FAKE_REGISTRY": ACCOUNT_IMAGE,
        "FAKE_REGION": REGION,
        "FAKE_ACCOUNT": ACCOUNT,
    })
    state = {
        "tags": tags or {w: tag for w in WORKLOADS},
        "revisions": {f"{CLUSTER}-{w}": 31 for w in WORKLOADS},
        "primary": {
            f"{CLUSTER}-{w}": f"arn:aws:ecs:{REGION}:{ACCOUNT}:task-definition/{CLUSTER}-{w}:31"
            for w in WORKLOADS
        },
        "rollout": rollout,
        "failures": failures or [],
        "calls": [],
    }
    state_file.write_text(json.dumps(state, indent=2))
    if aws_fail:
        env["FAKE_AWS_FAIL"] = "1"
    if sidecar:
        env["FAKE_SIDECAR"] = "1"
    return env


def run_helper(clone_dir: Path, aws_bin: Path, env: dict[str, str],
               extra: list[str] | None = None) -> tuple[str, str, int]:
    env_file = clone_dir.parent / f"{clone_dir.name}.decision.env"
    env_file.unlink(missing_ok=True)
    proc = sh(
        [sys.executable, str(HELPER), "--aws-bin", str(aws_bin), "--repo-dir", str(clone_dir),
         "--write", str(env_file), "--cluster", CLUSTER, "--region", REGION, *(extra or [])],
        check=False, env=env,
    )
    decision = ""
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("DEPLOY_DECISION="):
                decision = line.split("=", 1)[1].strip()
    return decision, proc.stdout + proc.stderr, proc.returncode


# ---------------------------------------------------------------------------
# Cases against the helper
# ---------------------------------------------------------------------------
def helper_cases(root: Path, origin: Path, shas: dict[str, str], aws_bin: Path) -> list[Case]:
    cases: list[Case] = []
    counter = {"n": 0}

    def case(name: str, branch: str, expect: str, why: str, *, depth: int = 1,
             deployed: str | None = None, tags: dict[str, str] | None = None,
             rollout: str = "COMPLETED", failures: list | None = None,
             aws_fail: bool = False, drop_origin: bool = False,
             sidecar: bool = False, origin_override: Path | None = None,
             extra: list[str] | None = None) -> None:
        counter["n"] += 1
        c = Case(name, expect, why)
        work = root / f"c{counter['n']:02d}-{name}"
        try:
            clone(origin_override or origin, branch, work, depth=depth)
            if drop_origin:
                git(work, "remote", "remove", "origin")
            tag = deployed if deployed is not None else shas["base"][:12]
            env = fake_env(root / f"c{counter['n']:02d}.state.json", tag=tag, tags=tags,
                           rollout=rollout, failures=failures, aws_fail=aws_fail,
                           sidecar=sidecar)
            decision, output, rc = run_helper(work, aws_bin, env, extra)
            c.got = decision or f"<none, exit {rc}>"
            c.output = output
        except Exception as exc:  # noqa: BLE001
            c.got = f"<harness error: {exc}>"
            c.output = traceback.format_exc()
        c.ok = c.got == c.expect
        cases.append(c)

    # ---- the two headlines ----
    case("skip/docs-only", "docs-only", "skip",
         "one new file under docs/ since the deployed commit")
    case("deploy/app-code", "app-code", "deploy",
         "apps/api/src/index.ts changed since the deployed commit")

    # ---- other doc shapes that must skip ----
    case("skip/docs-evidence-plan", "docs-multi", "skip", "three allowed prefixes at once")
    case("skip/docs-deleted", "docs-deleted", "skip", "a docs/ file was deleted")
    case("skip/empty-commit", "empty", "skip", "a commit with no tree change")
    case("skip/deploy-same-commit", "main", "skip", "HEAD is the deployed commit (a rebuild)")

    # ---- code and pipeline shapes that must deploy ----
    case("deploy/worker-code", "worker-code", "deploy", "apps/worker changed")
    case("deploy/infrastructure", "infra", "deploy", "infrastructure/aws/evia-beta/ecs.tf changed")
    case("deploy/buildspec", "buildspec", "deploy", "buildspec.yml changed")
    case("deploy/lockfile", "lockfile", "deploy", "pnpm-lock.yaml changed")
    case("deploy/root-readme", "root-readme", "deploy",
         "root README.md is outside the three allowed prefixes (deliberately conservative)")
    case("deploy/scripts", "script", "deploy", "scripts/ changed — the build itself runs from here")
    case("deploy/mixed", "mixed", "deploy", "docs and code in one commit")

    # ---- negative controls: cannot tell, therefore deploy ----
    case("negctl/ecs-unreachable", "docs-only", "deploy",
         "ECS describe-services fails — the deployed commit is unknown", aws_fail=True)
    case("negctl/ecs-failures", "docs-only", "deploy",
         "describe-services returns a failures[] entry",
         failures=[{"arn": "arn:aws:ecs:ap-south-1:562654496378:service/evia-beta-api", "reason": "MISSING"}])
    case("negctl/mid-rollout", "docs-only", "deploy",
         "a service has a PRIMARY deployment still IN_PROGRESS", rollout="IN_PROGRESS")
    case("negctl/services-disagree", "docs-only", "deploy",
         "portal is still on the previous tag (a half-finished earlier rollout)",
         tags={"api": shas["base"][:12], "worker": shas["base"][:12], "portal": "deadbeef1234"})
    case("negctl/tag-not-a-sha", "docs-only", "deploy",
         "the deployed tag is `latest`, not a commit", deployed="latest")
    case("negctl/commit-force-pushed-away", "docs-only", "deploy",
         "full clone, deployed commit absent from the repo", depth=0, deployed="0badc0ffee12")
    case("negctl/shallow-no-origin", "docs-only", "deploy",
         "shallow clone and no origin to deepen from", drop_origin=True)
    case("negctl/bad-allowlist", "docs-only", "deploy",
         "an allowlist entry that is not a repo-relative prefix", extra=["--allow", "/etc/"])
    case("negctl/commit-gone-after-deepening", "narrow", "deploy",
         "deepening succeeds but the deployed commit is not in the fetched history",
         origin_override=root / "narrow.git")
    case("skip/docs-only-with-sidecar", "docs-only", "skip",
         "a sidecar image without the cluster prefix is ignored, not treated as a mismatch",
         sidecar=True)
    case("skip/shallow-deepen-works", "docs-only", "skip",
         "shallow clone deepens from origin, then compares (the pre-git_clone_depth=0 path)")

    return cases


# ---------------------------------------------------------------------------
# The shipping buildspec shell blocks
# ---------------------------------------------------------------------------
def buildspec_commands() -> dict[str, list[str]]:
    import yaml

    spec = yaml.safe_load(BUILDSPEC.read_text())
    return {phase: body.get("commands", []) for phase, body in spec["phases"].items()}


def scope_gate_script(cmds: list[str]) -> str:
    found = [c for c in cmds if "deploy-scope.py --write" in c]
    if len(found) != 1:
        raise RuntimeError(f"expected exactly one pre_build scope gate, found {len(found)}")
    return found[0]


def rollout_script(cmds: list[str]) -> str:
    found = [c for c in cmds if "deploy-scope.env" in c and "deploy_service" in c]
    if len(found) != 1:
        raise RuntimeError(f"expected exactly one post_build rollout block, found {len(found)}")
    return found[0]


def syntax_cases() -> list[Case]:
    """Every shell block in buildspec.yml must parse — the gate adds new shell."""
    c = Case("buildspec/bash-n", "0-bad", "every command block in buildspec.yml parses")
    bad: list[str] = []
    total = 0
    out: list[str] = []
    for phase, cmds in buildspec_commands().items():
        for i, cmd in enumerate(cmds):
            total += 1
            with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as handle:
                handle.write(cmd + "\n")
                path = handle.name
            proc = sh(["bash", "-n", path], check=False)
            if proc.returncode != 0:
                bad.append(f"{phase}[{i}]: {proc.stderr.strip()}")
            Path(path).unlink(missing_ok=True)
    out.append(f"{total} command blocks checked with bash -n")
    out.extend(bad)
    c.got = f"{len(bad)}-bad"
    c.output = "\n".join(out)
    c.ok = not bad
    return [c]


def gate_cases(root: Path, work: Path) -> list[Case]:
    """Run the real pre_build gate with a doctored helper, and the real post_build block."""
    cases: list[Case] = []
    cmds = buildspec_commands()
    gate = scope_gate_script(cmds["pre_build"])
    rollout = rollout_script(cmds["post_build"])
    script_dir = work / "scripts"
    script_dir.mkdir(parents=True)

    def run_gate(name: str, helper_body: str, expect: str, why: str) -> None:
        c = Case(name, expect, why)
        target = script_dir / "deploy-scope.py"
        target.write_text(helper_body, encoding="utf-8")
        Path("/tmp/deploy-scope.env").unlink(missing_ok=True)
        gated = gate + "\necho \"GATE_RESULT=${DEPLOY_DECISION}\"\n"
        script = work / f"gate-{name.replace('/', '-')}.sh"
        script.write_text(gated, encoding="utf-8")
        proc = sh(["bash", str(script)], cwd=work, check=False)
        got = ""
        for line in proc.stdout.splitlines():
            if line.startswith("GATE_RESULT="):
                got = line.split("=", 1)[1].strip()
        c.got = got or f"<no GATE_RESULT, exit {proc.returncode}>"
        c.output = proc.stdout + proc.stderr
        c.ok = c.got == expect and proc.returncode == 0
        cases.append(c)

    run_gate("gate/helper-crashes", "import sys; sys.exit(3)\n", "deploy",
             "the helper exits non-zero — the phase must not fail and must deploy")
    run_gate("gate/helper-writes-nothing", "pass\n", "deploy",
             "the helper exits 0 but leaves the default in place")
    run_gate("gate/helper-writes-garbage",
             "open('/tmp/deploy-scope.env','w').write('DEPLOY_DECISION=maybe\\n')\n", "deploy",
             "anything other than the literal `skip` is normalised to deploy")
    run_gate("gate/helper-writes-skip",
             "open('/tmp/deploy-scope.env','w').write(\"DEPLOY_DECISION=skip\\nDEPLOY_SCOPE_REASON='docs only'\\n\")\n",
             "skip", "the helper says skip and the gate passes it through")
    run_gate("gate/helper-missing-entirely", "", "deploy",
             "python3 cannot even open the helper — the phase continues and deploys")

    # post_build: the skip branch must make no mutating ECS call; the deploy branch must.
    cases.extend(rollout_cases(root, work, rollout, cmds["post_build"]))
    return cases


def rollout_cases(root: Path, work: Path, rollout: str, post_cmds: list[str]) -> list[Case]:
    cases: list[Case] = []
    aws_bin = work / "bin" / "aws"
    aws_bin.parent.mkdir(exist_ok=True)
    aws_bin.write_text(FAKE_AWS, encoding="utf-8")
    aws_bin.chmod(0o755)

    for label, decision, expect_mutations in (("skip", "skip", False), ("deploy", "deploy", True)):
        c = Case(f"post_build/{label}-branch", "no-mutations" if not expect_mutations else "3-register-3-update",
                 "the rollout block's decision on what it touches")
        state = root / f"rollout-{label}.state.json"
        env = fake_env(state, tag="a1b2c3d4e5f6")
        env["PATH"] = f"{aws_bin.parent}:{env['PATH']}"
        env["NAME_PREFIX"] = CLUSTER
        env["AWS_REGION"] = REGION
        env["AWS_ACCOUNT_ID"] = ACCOUNT
        env["ECR_REGISTRY"] = ACCOUNT_IMAGE.rsplit("/", 1)[0]
        env["IMAGE_TAG"] = "a1b2c3d4e5f6"
        env["RUN_MIGRATIONS"] = "false"
        Path("/tmp/deploy-scope.env").write_text(
            f"DEPLOY_DECISION={decision}\nDEPLOY_SCOPE_REASON='harness'\n", encoding="utf-8"
        )
        # The block reads /tmp/deploy-scope.env; every build runs its own container,
        # so a fixed path is correct there and fine here because cases are serial.
        script = work / f"rollout-{label}.sh"
        script.write_text("set -u\n" + rollout, encoding="utf-8")
        proc = sh(["bash", str(script)], cwd=REPO_ROOT, check=False, env=env)
        calls = json.loads(Path(state).read_text())["calls"]
        registers = [x for x in calls if x[:2] == ["ecs", "register-task-definition"]]
        updates = [x for x in calls if x[:2] == ["ecs", "update-service"]]
        got = f"{len(registers)}-register-{len(updates)}-update"
        c.got = got if registers or updates else "no-mutations"
        c.output = proc.stdout[-4000:] + proc.stderr[-2000:] + f"\nexit={proc.returncode}"
        if expect_mutations:
            c.ok = c.got == "3-register-3-update" and proc.returncode == 0
        else:
            c.ok = c.got == "no-mutations" and proc.returncode == 0 and "SUCCEEDS" in proc.stdout
        cases.append(c)
    return cases


# ---------------------------------------------------------------------------
def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="prove the deploy-scope decision")
    parser.add_argument("--keep", action="store_true", help="keep the scratch tree")
    parser.add_argument("--verbose", action="store_true", help="print every case's helper output")
    args = parser.parse_args(argv[1:])

    root = Path(tempfile.mkdtemp(prefix="deploy-scope-proof-"))
    aws_bin = root / "aws"
    aws_bin.write_text(FAKE_AWS, encoding="utf-8")
    aws_bin.chmod(0o755)

    try:
        origin, shas, _ = build_origin(root)
        print("synthetic repository")
        print(f"  origin        {origin}")
        print(f"  deployed base {shas['base']} (this is what the fake ECS reports)")
        for name in ("docs", "app", "infra", "buildspec", "mixed", "empty"):
            print(f"  {name:<12}  {shas[name]}")
        print()

        cases = helper_cases(root, origin, shas, aws_bin)
        work = root / "buildspec"
        work.mkdir()
        cases += gate_cases(root, work)
        cases += syntax_cases()

        width = max(len(c.name) for c in cases)
        print(f"{'case'.ljust(width)}  expect    got       result")
        print(f"{'-' * width}  --------  --------  ------")
        for c in cases:
            print(f"{c.name.ljust(width)}  {c.expect:<8}  {c.got:<8}  {'PASS' if c.ok else 'FAIL'}")
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
        print("OK: docs-only commits skip the rollout; code, infrastructure and every")
        print("    cannot-tell path deploy; a skip registers no task definition.")
        return 0
    finally:
        if args.keep:
            print(f"scratch tree kept at {root}")
        else:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
