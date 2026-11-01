#!/usr/bin/env python3
"""Security gates for the CodeBuild pipeline.

Two independent checks, both fail-closed on CRITICAL severity:

  audit <pnpm-audit.json>
      Parses `pnpm audit --prod --json` output and fails if any production
      dependency has a CRITICAL advisory. HIGH is reported but does not fail.

  ecr --repo <name> --tag <tag> [--repo ... --tag ...] [--timeout 1800]
      Waits for the ECR basic scan of each pushed image to reach COMPLETE and
      fails if any image has a CRITICAL finding. A scan that never completes
      is treated as a failure: "unknown" is not "clean".

Why CRITICAL and not HIGH: ECR basic scanning reports operating-system layer
CVEs, and a Node base image routinely carries HIGH findings that have no
usable fix inside the image. A gate that always fires gets disabled, and a
disabled gate protects nothing. CRITICAL is the line where an image must not
reach a running service.

Exit codes: 0 clean, 1 gate breached, 2 usage/tooling error (also fails).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time

CRITICAL = "critical"
SEVERITIES = ("critical", "high", "moderate", "low", "info")


def _fail(msg: str) -> int:
    print(f"SECURITY GATE FAILED: {msg}", file=sys.stderr)
    return 1


def cmd_audit(path: str) -> int:
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        # pnpm audit writes nothing when the registry is unreachable, and a
        # missing report must not read as a pass.
        return _fail(f"could not read audit report {path}: {exc}")

    advisories = data.get("advisories") or {}
    if not advisories:
        meta = data.get("metadata", {}).get("vulnerabilities")
        if meta is None:
            return _fail(
                "audit report has no advisories and no metadata — treat as "
                "an incomplete run, not a clean one"
            )

    counts = {sev: 0 for sev in SEVERITIES}
    critical_items: list[str] = []
    for adv in advisories.values():
        sev = str(adv.get("severity", "")).lower()
        if sev not in counts:
            continue
        counts[sev] += 1
        if sev == CRITICAL:
            critical_items.append(
                "  {mod} {vuln} -> {patched}  ({title})".format(
                    mod=adv.get("module_name", "?"),
                    vuln=adv.get("vulnerable_versions", "?"),
                    patched=adv.get("patched_versions", "?"),
                    title=(adv.get("title") or "")[:100],
                )
            )

    print("dependency audit (production): " + ", ".join(
        f"{sev}={counts[sev]}" for sev in SEVERITIES
    ))

    if counts[CRITICAL]:
        print("\n".join(critical_items), file=sys.stderr)
        return _fail(
            f"{counts[CRITICAL]} CRITICAL production dependency advisory(s); "
            "bump or pin before this build may deploy"
        )
    return 0


def _scan_once(repo: str, tag: str) -> tuple[str, dict]:
    """Return (status, payload) for one image.

    status is one of COMPLETE, PENDING, FAILED. Only the scan's own
    imageScanStatus is trusted: a successful API call that reports
    IN_PROGRESS has NOT been checked yet, and scoring it clean because its
    findings array is currently empty is how a real CVE reaches production.
    """
    proc = subprocess.run(
        [
            "aws", "ecr", "describe-image-scan-findings",
            "--repository-name", repo,
            "--image-id", f"imageTag={tag}",
            "--output", "json",
        ],
        capture_output=True, text=True, check=False,
    )
    if proc.returncode != 0:
        # ImageNotFoundException / ScanNotFoundException land here while the
        # push is still settling, so report it as retryable.
        return "PENDING", {"error": proc.stderr.strip()[:200]}
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return "PENDING", {"error": "unparseable describe-image-scan-findings"}

    status = str((payload.get("imageScanStatus") or {}).get("status", "")).upper()
    if status == "COMPLETE":
        return "COMPLETE", payload
    if status in ("FAILED", "UNSUPPORTED", "SCAN_ELIGIBILITY_EXPIRED"):
        return "FAILED", payload
    return "PENDING", payload


def cmd_ecr(pairs: list[tuple[str, str]], timeout_s: int) -> int:
    pending = list(pairs)
    results: dict[tuple[str, str], dict] = {}
    failures: dict[tuple[str, str], str] = {}
    deadline = time.time() + timeout_s
    poll = 10
    last_status: dict[tuple[str, str], str] = {}

    while pending and time.time() < deadline:
        still: list[tuple[str, str]] = []
        for repo, tag in pending:
            status, payload = _scan_once(repo, tag)
            if status == "COMPLETE":
                results[(repo, tag)] = payload
            elif status == "FAILED":
                failures[(repo, tag)] = str(
                    (payload.get("imageScanStatus") or {}).get("description", "scan failed")
                )[:200]
            else:
                err = str(payload.get("error", "")).strip()
                st = str((payload.get("imageScanStatus") or {}).get("status", "")).upper()
                last_status[(repo, tag)] = st or err[:80] or "not listed"
                still.append((repo, tag))
        pending = still
        if pending:
            detail = ", ".join(f"{r}:{t}={last_status.get((r, t), '?')}" for r, t in pending)
            print(f"waiting on {len(pending)} image scan(s) ({detail}); {int(deadline - time.time())}s left")
            time.sleep(poll)
            poll = min(poll + 5, 30)

    breached = False
    for repo, tag in pairs:
        payload = results.get((repo, tag))
        if payload is None:
            breached = True
            reason = failures.get((repo, tag)) or (
                f"scan did not complete within {timeout_s}s "
                f"(last state: {last_status.get((repo, tag), 'unknown')})"
            )
            print(f"{repo}:{tag} — {reason}", file=sys.stderr)
            continue
        findings = (payload.get("imageScanFindings") or {}).get("findings") or []
        counts: dict[str, int] = {}
        criticals = []
        for f in findings:
            sev = str(f.get("severity", "")).upper()
            counts[sev] = counts.get(sev, 0) + 1
            if sev == "CRITICAL":
                criticals.append(
                    f"  {f.get('name', '?')}: "
                    f"{(f.get('description') or '')[:110]}"
                )
        summary = ", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "none"
        print(f"{repo}:{tag} — findings: {summary}")
        if criticals:
            breached = True
            print("\n".join(criticals), file=sys.stderr)

    if breached:
        return _fail("one or more images are not fit to deploy")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_audit = sub.add_parser("audit")
    p_audit.add_argument("report")

    p_ecr = sub.add_parser("ecr")
    p_ecr.add_argument("--repo", action="append", required=True)
    p_ecr.add_argument("--tag", action="append", required=True)
    p_ecr.add_argument("--timeout", type=int, default=1800)

    args = parser.parse_args(argv)

    if args.cmd == "audit":
        return cmd_audit(args.report)

    if len(args.repo) != len(args.tag):
        # The pipeline pushes one commit SHA to all three repositories, so a
        # single --tag broadcasts to every --repo.
        if len(args.tag) == 1 and len(args.repo) > 1:
            args.tag = args.tag * len(args.repo)
        else:
            return _fail(
                "give one --tag, or one --tag per --repo "
                f"(got {len(args.repo)} repo(s), {len(args.tag)} tag(s))"
            )
    return cmd_ecr(list(zip(args.repo, args.tag)), args.timeout)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:  # noqa: BLE001 - a crashed gate must not pass
        print(f"SECURITY GATE ERROR: {exc}", file=sys.stderr)
        sys.exit(2)
