#!/usr/bin/env python3
"""Security gates for the CodeBuild pipeline.

Two independent checks, both fail-closed on CRITICAL severity:

  audit <pnpm-audit.json>
      Parses `pnpm audit --prod --json` output and fails if any production
      dependency has a CRITICAL advisory. HIGH is reported but does not fail.

  ecr --repo <name> --tag <tag> [--repo ... --tag ...] [--timeout 1800]
                 [--exceptions scripts/security-gate-exceptions.json]
      Waits for the ECR basic scan of each pushed image to reach COMPLETE and
      fails if any image has a CRITICAL finding. A scan that never completes
      is treated as a failure: "unknown" is not "clean".

  Exceptions are deliberate, dated and logged. A CRITICAL finding that has no
  fix available inside the image (a base-image library, no `fixed_in_version`)
  would otherwise block every deploy forever, and a gate that can never pass
  gets removed — which protects nothing. So a finding may be excepted by an
  entry in scripts/security-gate-exceptions.json that carries a CVE id, a
  written reason, an owner and an expiry date. Every use is printed in the
  build log, an expired entry is a breach (not a warning), and any CRITICAL
  finding without an entry is still a breach. The file is code: it is reviewed
  in a pull request and it expires on its own.

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


def _load_exceptions(path: str | None) -> tuple[dict[str, dict], str | None]:
    """Read the exception file. Returns (by-cve, error).

    A missing file means "no exceptions", which is the safe default: every
    CRITICAL finding then breaches. A file that exists but cannot be parsed is
    an error the caller must treat as a breach — an unreadable exception list
    must never be read as "everything is excepted".
    """
    if not path:
        return {}, None
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return {}, None
    except (OSError, json.JSONDecodeError) as exc:
        return {}, f"could not read exceptions file {path}: {exc}"

    raw = data.get("exceptions") if isinstance(data, dict) else None
    if raw is None:
        return {}, None
    if not isinstance(raw, list):
        return {}, f"exceptions file {path} has a non-list 'exceptions'"

    by_cve: dict[str, dict] = {}
    for item in raw:
        if not isinstance(item, dict):
            return {}, f"exceptions file {path} has a non-object entry"
        cve = str(item.get("cve", "")).strip().upper()
        if not cve:
            return {}, f"exceptions file {path} has an entry with no cve"
        if not str(item.get("reason", "")).strip() or not str(item.get("owner", "")).strip():
            return {}, f"exception {cve} needs both a reason and an owner"
        by_cve[cve] = item
    return by_cve, None


def _exception_state(entry: dict, today: str) -> tuple[bool, str]:
    """(is_valid_now, why). An expiry that cannot be read is not valid."""
    expires = str(entry.get("expires", "")).strip()
    if not expires:
        return False, "no expiry date"
    if expires < today:
        return False, f"expired on {expires}"
    return True, f"owner {entry.get('owner')}, expires {expires}"


def cmd_ecr(pairs: list[tuple[str, str]], timeout_s: int,
            exceptions_path: str | None = None) -> int:
    exceptions, exc_error = _load_exceptions(exceptions_path)
    today = time.strftime("%Y-%m-%d", time.gmtime())
    if exc_error:
        return _fail(exc_error)

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
        excepted = []
        for f in findings:
            sev = str(f.get("severity", "")).upper()
            counts[sev] = counts.get(sev, 0) + 1
            if sev == "CRITICAL":
                cve = str(f.get("name", "?")).upper()
                entry = exceptions.get(cve)
                if entry is not None:
                    valid, why = _exception_state(entry, today)
                    if valid:
                        # Deliberate, dated, and printed: the build log names the
                        # CVE, the owner and the day the exception lapses.
                        excepted.append(f"  EXCEPTED {cve} ({why}): {entry.get('reason')}")
                        continue
                    criticals.append(
                        f"  {cve}: exception is not valid ({why})"
                    )
                    continue
                criticals.append(
                    f"  {cve}: "
                    f"{(f.get('description') or '')[:110]}"
                )
        summary = ", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "none"
        print(f"{repo}:{tag} — findings: {summary}")
        if excepted:
            print("\n".join(excepted))
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

    p_ecr = sub.add_parser("ecr", allow_abbrev=False)
    p_ecr.add_argument("--repo", action="append", required=True)
    p_ecr.add_argument("--tag", action="append", required=True)
    p_ecr.add_argument("--timeout", type=int, default=1800)
    p_ecr.add_argument("--exceptions", default=None,
                       help="dated exception list; omitted means no exceptions")

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
    return cmd_ecr(list(zip(args.repo, args.tag)), args.timeout,
                   exceptions_path=getattr(args, "exceptions", None))


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:  # noqa: BLE001 - a crashed gate must not pass
        print(f"SECURITY GATE ERROR: {exc}", file=sys.stderr)
        sys.exit(2)
