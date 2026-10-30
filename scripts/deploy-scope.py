#!/usr/bin/env python3
"""Decide whether this commit needs a rollout, from evidence the build can derive itself.

Why this exists: every push to develop starts `evia-beta-build`, which builds three
images and rolls api, worker and portal. Commits that only touch `docs/`, `evidence/`
or `plan/` cannot change a container, but they still replace all three task-definition
revisions — a full outage-shaped operation per documentation edit, for no reason.

CodeBuild clones fresh on every build, so the job cannot be *told* what changed. It has
to derive it. The only two things the build can trust as "what is running right now" are:

  * ECS itself — the PRIMARY task definition of each service, whose container image
    carries the tag `IMAGE_TAG = ${CODEBUILD_RESOLVED_SOURCE_VERSION:0:12}` the
    deploying build used. That tag *is* a commit SHA (buildspec.yml pre_build), so the
    live stack names the commit it was built from.
  * git — the tree at HEAD (checked out here) and the tree at that commit.

So the question "does this commit need a rollout?" becomes a tree question:

    git diff --name-only <deployed-sha> HEAD

If every changed path is inside an allowed documentation prefix, the code the services
would run is already the code they are running, and the rollout is skipped. Everything
else — app code, infrastructure, the buildspec itself, the lockfile, anything unknown —
means deploy.

FAIL-CLOSED IS THE WHOLE CONTRACT. A skip that fires when it should not means a real
code change never reaches production, which is far worse than a wasted rollout. Every
uncertain answer here resolves to `deploy`:

  * ECS unreadable, a failure entry, a service mid-rollout, an unparseable response
  * the three services not serving the same tag (a partially failed earlier rollout)
  * the tag not looking like a commit SHA (`latest`, empty, a hand tag)
  * the commit absent from this clone and unfetchable (shallow clone, no origin,
    force-pushed away, network down)
  * the diff erroring, a path that cannot be decoded, an unexpected exception
  * this script not running at all — buildspec.yml sets DEPLOY_DECISION=deploy before
    it invokes this and normalises anything that is not the literal `skip` back to
    `deploy`.

The decision is written to an env file (default /tmp/deploy-scope.env) because
CodeBuild phases do not share variables; post_build re-reads it and defaults to deploy
if it is missing.

Exit codes: 0 always when a decision was reached and written (both `skip` and `deploy`
are successes). 1 only if the env file itself could not be written — the build then
uses its own default, which is `deploy`.

Usage:
    deploy-scope.py [--write /tmp/deploy-scope.env] [--allow docs/ ...]
                    [--cluster evia-beta] [--workloads api worker portal]
                    [--aws-bin aws] [--git-bin git] [--repo-dir .] [--expected-sha SHA]
Exit codes: 0 decision written, 1 decision could not be written.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_ALLOW = ("docs/", "evidence/", "plan/")
DECISION_ENV = "/tmp/deploy-scope.env"
SHA_RE = r"^[0-9a-f]{7,40}$"
FETCH_TIMEOUT_S = 180
CALL_TIMEOUT_S = 60


class ScopeError(Exception):
    """A condition that makes the answer unknowable — always resolves to deploy."""


@dataclass
class Decision:
    mode: str  # "deploy" | "skip"
    reason: str
    detail: list[str] = field(default_factory=list)

    @property
    def skipping(self) -> bool:
        return self.mode == "skip"


def log(msg: str) -> None:
    print(f"deploy-scope: {msg}", flush=True)


def run(
    argv: list[str],
    *,
    cwd: str | None = None,
    timeout: int = CALL_TIMEOUT_S,
    check: bool = True,
) -> str:
    """Run a command, returning stdout. Raises ScopeError with the command's own words."""
    try:
        proc = subprocess.run(
            argv,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise ScopeError(f"{argv[0]} not found ({exc})") from exc
    except subprocess.TimeoutExpired as exc:
        raise ScopeError(f"{' '.join(argv)} timed out after {timeout}s") from exc
    except OSError as exc:
        raise ScopeError(f"{' '.join(argv)} could not run ({exc})") from exc
    if check and proc.returncode != 0:
        lines = [ln.strip() for ln in (proc.stderr or proc.stdout or "").splitlines() if ln.strip()]
        # git's useful line is "fatal: ..." and it is rarely the last one printed.
        tail = next(
            (ln for ln in reversed(lines) if ln.startswith(("fatal:", "error:", "ERROR", "FAILED"))),
            lines[-1] if lines else "no output",
        )
        raise ScopeError(f"{' '.join(argv)} exited {proc.returncode}: {tail}")
    return proc.stdout


def _json(text: str, what: str) -> dict:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ScopeError(f"{what}: response was not JSON ({exc})") from exc
    if not isinstance(parsed, dict):
        raise ScopeError(f"{what}: response was not a JSON object")
    return parsed


def deployed_tag_from_ecs(
    aws_bin: str, cluster: str, workloads: list[str], region: str
) -> tuple[str, str]:
    """The single image tag the live services are running, and where it came from.

    Reads ECS rather than ECR on purpose: ECR holds tags for builds that pushed images
    and then failed before the rollout (or were never rolled out), so the newest ECR
    tag is not what is running. The PRIMARY deployment is.
    """
    services = [f"{cluster}-{w}" for w in workloads]
    out = run(
        [
            aws_bin,
            "ecs",
            "describe-services",
            "--cluster",
            cluster,
            "--services",
            *services,
            "--region",
            region,
            "--output",
            "json",
        ]
    )
    parsed = _json(out, "ecs describe-services")

    failures = parsed.get("failures") or []
    if failures:
        detail = "; ".join(
            f"{f.get('arn', f.get('reason', '?'))}: {f.get('reason', '?')}" for f in failures
        )
        raise ScopeError(f"ecs reported failures for the services ({detail})")

    found = {s.get("serviceName"): s for s in parsed.get("services") or []}
    missing = [name for name in services if name not in found]
    if missing:
        raise ScopeError(f"ecs did not return {', '.join(missing)}")

    tags: dict[str, str] = {}
    arns: dict[str, str] = {}
    for name in services:
        service = found[name]
        primary = [d for d in service.get("deployments") or [] if d.get("status") == "PRIMARY"]
        if len(primary) != 1:
            raise ScopeError(
                f"{name}: expected exactly one PRIMARY deployment, saw {len(primary)}"
            )
        rollout = primary[0].get("rolloutState")
        if rollout != "COMPLETED":
            # A service mid-rollout (or failed/rolled-back) is not a settled starting
            # point: the code it will be running in a minute is not the code it runs now.
            raise ScopeError(f"{name}: PRIMARY deployment rolloutState={rollout!r}, not COMPLETED")
        arn = primary[0].get("taskDefinition") or ""
        if not arn:
            raise ScopeError(f"{name}: PRIMARY deployment has no taskDefinition")
        arns[name] = arn

        td_out = run(
            [
                aws_bin,
                "ecs",
                "describe-task-definition",
                "--task-definition",
                arn,
                "--region",
                region,
                "--output",
                "json",
            ]
        )
        td = _json(td_out, f"ecs describe-task-definition {arn}").get("taskDefinition") or {}
        images = [
            c.get("image", "")
            for c in td.get("containerDefinitions") or []
            if f"/{cluster}/" in (c.get("image") or "")
        ]
        if not images:
            raise ScopeError(f"{name} ({arn}): no container image under /{cluster}/")
        image_tags = {img.rsplit(":", 1)[-1] if ":" in img.rsplit("/", 1)[-1] else "" for img in images}
        if len(image_tags) != 1:
            raise ScopeError(f"{name} ({arn}): containers disagree on the image tag {sorted(image_tags)}")
        tag = image_tags.pop()
        if not tag:
            raise ScopeError(f"{name} ({arn}): container image carries no tag")
        tags[name] = tag

    distinct = set(tags.values())
    if len(distinct) != 1:
        raise ScopeError(
            "the services are not on one commit: "
            + ", ".join(f"{name}={tag}" for name, tag in sorted(tags.items()))
        )
    tag = distinct.pop()
    provenance = ", ".join(arns[name].rsplit("/", 1)[-1] for name in services)
    return tag, provenance


def resolve_commit(git_bin: str, repo: str, tag: str) -> tuple[str, str]:
    """Full commit SHA for `tag`, or ScopeError. Never guesses."""
    if not re.match(SHA_RE, tag):
        raise ScopeError(f"deployed image tag {tag!r} is not a commit SHA")

    def try_resolve() -> str | None:
        proc = subprocess.run(
            [git_bin, "rev-parse", "--verify", "--quiet", f"{tag}^{{commit}}"],
            cwd=repo,
            capture_output=True,
            text=True,
            timeout=CALL_TIMEOUT_S,
        )
        if proc.returncode == 0:
            sha = proc.stdout.strip()
            return sha or None
        return None

    sha = try_resolve()
    if sha:
        return sha, "present in this clone"

    # A depth-limited clone: the deployed commit is an ancestor and simply is not here.
    # pipeline.tf now clones the full history (git_clone_depth = 0) so this is not the
    # normal path, but the attribute may not be applied yet and a build must not depend
    # on an apply having happened. Deepening is the only way to compare trees, and it is
    # optional — if it fails the build just deploys.
    shallow = run(
        [git_bin, "rev-parse", "--is-shallow-repository"], cwd=repo, check=False
    ).strip()
    if shallow != "true":
        raise ScopeError(
            f"deployed commit {tag} is not in this repository (force-pushed away, or from another fork)"
        )

    try:
        run(
            [git_bin, "fetch", "--unshallow", "--no-tags", "origin"],
            cwd=repo,
            timeout=FETCH_TIMEOUT_S,
        )
    except ScopeError as exc:
        raise ScopeError(f"could not deepen the clone to reach {tag}: {exc}") from exc

    sha = try_resolve()
    if not sha:
        raise ScopeError(f"deployed commit {tag} still absent after deepening the clone")
    return sha, "absent from the shallow clone, fetched after deepening from origin"


def changed_paths(git_bin: str, repo: str, base: str, head: str) -> list[str]:
    """Every path that differs between two commits, renames reported on both sides.

    --no-renames so a move out of docs/ into apps/ lists both paths (and therefore
    deploys); -z so a filename with a space or newline cannot be split wrongly.
    """
    out = run(
        [
            git_bin,
            "-c",
            "core.quotePath=false",
            "diff",
            "--no-renames",
            "--name-only",
            "--diff-filter=ACDMRTUXB",
            "-z",
            base,
            head,
        ],
        cwd=repo,
        timeout=FETCH_TIMEOUT_S,
    )
    paths = [p for p in out.split("\0") if p]
    if not paths and out.strip("\0"):
        raise ScopeError("git diff produced output that could not be split into paths")
    return paths


def normalise_prefixes(raw: list[str]) -> tuple[str, ...]:
    """Validate the allowlist. Anything questionable throws, and the caller deploys."""
    if not raw:
        return DEFAULT_ALLOW
    cleaned: list[str] = []
    for entry in raw:
        p = entry.strip()
        if not p:
            raise ScopeError(f"empty allowlist entry in {raw!r}")
        if p.startswith("/") or p.startswith("..") or p in (".", "/"):
            raise ScopeError(f"allowlist entry {entry!r} is not a relative path inside the repo")
        if not p.endswith("/"):
            p = p + "/"
        cleaned.append(p)
    return tuple(cleaned)


def decide(
    *,
    aws_bin: str,
    git_bin: str,
    repo: str,
    cluster: str,
    workloads: list[str],
    region: str,
    allow: tuple[str, ...],
    head: str | None,
) -> Decision:
    detail: list[str] = []
    tag, provenance = deployed_tag_from_ecs(aws_bin, cluster, workloads, region)
    detail.append(f"live task definitions: {provenance}")
    detail.append(f"deployed image tag (= commit SHA): {tag}")

    base, how = resolve_commit(git_bin, repo, tag)
    detail.append(f"deployed commit {base} ({how})")

    head_sha = head or run([git_bin, "rev-parse", "HEAD"], cwd=repo).strip()
    if head_sha == base:
        detail.append(f"HEAD is the deployed commit ({head_sha}) — nothing to roll")
        return Decision("skip", "HEAD is already deployed", detail)

    paths = changed_paths(git_bin, repo, base, head_sha)
    detail.append(f"changed paths between {base[:12]} and {head_sha[:12]}: {len(paths)}")
    for path in paths[:40]:
        detail.append(f"  {path}")
    if len(paths) > 40:
        detail.append(f"  ... {len(paths) - 40} more")

    outside = [p for p in paths if not any(p.startswith(prefix) for prefix in allow)]
    detail.append(f"allowlist: {', '.join(allow)}")
    if outside:
        detail.append(f"{len(outside)} path(s) outside the allowlist:")
        for path in outside[:40]:
            detail.append(f"  {path}")
        if len(outside) > 40:
            detail.append(f"  ... {len(outside) - 40} more")
        return Decision("deploy", f"{len(outside)} file(s) outside {', '.join(allow)}", detail)

    if not paths:
        return Decision("skip", "deployed tree identical to HEAD", detail)
    return Decision("skip", f"all {len(paths)} changed file(s) inside {', '.join(allow)}", detail)


def write_env(path: Path, decision: Decision) -> None:
    reason = "".join(ch for ch in decision.reason if ch.isprintable() and ch not in "'\"\\$`")
    body = (
        "# Written by scripts/deploy-scope.py. Anything other than DECISION=skip means deploy.\n"
        f"DEPLOY_DECISION={decision.mode}\n"
        f"DEPLOY_SCOPE_REASON='{reason}'\n"
    )
    path.write_text(body, encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    p.add_argument("--write", default=DECISION_ENV, help="env file to write the decision to")
    p.add_argument("--allow", nargs="*", default=list(DEFAULT_ALLOW),
                   help="path prefixes that cannot affect a container (default: docs/ evidence/ plan/)")
    p.add_argument("--cluster", default=os.environ.get("NAME_PREFIX", "evia-beta"))
    p.add_argument("--workloads", nargs="*", default=["api", "worker", "portal"])
    p.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-south-1"))
    p.add_argument("--aws-bin", default="aws")
    p.add_argument("--git-bin", default="git")
    p.add_argument("--repo-dir", default=".")
    p.add_argument("--head", default=None, help="commit to compare against (default: HEAD)")
    return p


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv[1:])
    env_path = Path(args.write)

    try:
        allow = normalise_prefixes(args.allow)
        decision = decide(
            aws_bin=args.aws_bin,
            git_bin=args.git_bin,
            repo=args.repo_dir,
            cluster=args.cluster,
            workloads=args.workloads,
            region=args.region,
            allow=allow,
            head=args.head,
        )
    except ScopeError as exc:
        # Every one of these is "cannot tell", and cannot-tell means deploy.
        decision = Decision("deploy", f"cannot determine scope: {exc}", [])
    except Exception as exc:  # noqa: BLE001 — a bug here must not become a silent skip
        decision = Decision("deploy", f"unexpected error: {type(exc).__name__}: {exc}", [])
        import traceback

        traceback.print_exc()

    for line in decision.detail:
        log(line)
    log(f"reason: {decision.reason}")
    log(f"DECISION={decision.mode}")

    try:
        write_env(env_path, decision)
    except OSError as exc:
        print(f"deploy-scope: could not write {env_path}: {exc}", file=sys.stderr)
        return 1
    log(f"wrote {env_path} ({decision.mode})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
