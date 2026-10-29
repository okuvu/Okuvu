#!/usr/bin/env python3
"""Fail-closed PII scanner for the Okuvu CloudWatch log groups (E16-S11).

DPDP Act context: an email address, a phone number or a person's name written
into a log line is personal data leaving the application's control. This
scanner reads log events for a configurable window across the three beta log
groups and exits non-zero the moment it finds one. It is a gate, not a report —
there is no "warn" mode, and no suppression list that silently drops hits.

PATTERN SET (this is the documented set the acceptance criterion refers to)
--------------------------------------------------------------------------
Every event body is tested against the patterns below. A hit is recorded per
(pattern id, log group, event) and every hit is fatal.

  email-address     `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}`
                    Any SMTP-shaped address, in text, JSON, or a JS object
                    literal. Catches the pre-fix `[AUTH] Successful sign-in:
                    <email>` line and the DB-probe JSON rows.

  phone-e164        `(?<![\\w+])\\+[1-9]\\d{1,3}[\\s-]?\\d{6,14}(?![\\w])`
                    Leading `+` country code, 7-15 digits total (ITU E.164
                    ceiling). The lookarounds stop it matching inside a longer
                    token. Formatted Indian mobiles (`+91 98765 43210`) are
                    covered because one space or dash is allowed after the
                    country code.

  phone-in-e164     `(?<![\\w.+-])(?:91)?[6-9]\\d{9}(?![\\w.])`
                    A bare 10-digit Indian mobile (optionally prefixed `91`),
                    the form the product stores when no country code is given.
                    Deliberately anchored on `[6-9]` (the only valid Indian
                    mobile leading digits) and guarded against a preceding
                    `.`/`-`/digit so timestamps, ports, IPv4 octets, hashes and
                    hostnames such as `ip-10-20-10-166` do not match.

  person-name       `<first>\\s+<last>` for every seeded therapist, plus the
                    bare first and last name tokens, case-insensitive
                    (`\\b`-anchored). Names come from `--names` (default: the
                    three therapists in scripts/seed-beta-therapists.sql, i.e.
                    Dr. Ananya Rao, Dr. Priya Nair, Dr. Rohan Mehta).
                    A person's name is personal data on its own — "Rao" in a
                    therapist log is as identifying as the address — so the
                    bare tokens are in scope, not just the two-word form.

  client-name       `<first>\\s+<last>` pairs supplied with `--client-names`.
                    Empty by default: the beta scan has no seeded client
                    roster, and this exists so a future run can add one
                    without editing the script.

  journal-text      `--journal-canary` / `--note-canary` markers (substring,
                    case-insensitive). Free-text journal, note and turn bodies
                    cannot be recognised by shape, so the scanner takes canary
                    strings and asserts they never appear in a log line at all.
                    Used by the CI/test harness; empty by default.

WHAT IT DOES NOT DO
-------------------
It does not read the application's source and cannot tell a redacted value
from a leaked one by intent — only by shape. It does not prove absence of
free text without a canary. Those are covered by the source sweep recorded in
evidence/E16-S11.md.

USAGE
-----
    python3 scripts/log-pii-scan.py                       # last 24h, all 3 groups
    python3 scripts/log-pii-scan.py --hours 6
    python3 scripts/log-pii-scan.py --start 2026-10-28T05:00:00Z --end 2026-10-29T05:00:00Z
    python3 scripts/log-pii-scan.py --files captured.log  # scan local text instead
    python3 scripts/log-pii-scan.py --list-patterns

Exit codes:
    0  clean — no hit in any group over the window
    1  violations found (the gate fails)
    2  the scan could not be completed (bad args, awscli or auth failure)

Nothing identifying is printed: samples are redacted (local part/domain for
addresses, inner characters for names and numbers). The full hit list is
never written to a file by this script.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

REGION = "ap-south-1"
DEFAULT_GROUPS = [
    "/ecs/evia-beta/api",
    "/ecs/evia-beta/worker",
    "/ecs/evia-beta/portal",
]

# Seeded therapist identities — scripts/seed-beta-therapists.sql.
DEFAULT_NAMES = [
    "Ananya Rao",
    "Priya Nair",
    "Rohan Mehta",
]

PATTERN_DOCS = [
    ("email-address", r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    ("phone-e164", r"(?<![\w+])\+[1-9]\d{1,3}[\s-]?\d{6,14}(?![\w])"),
    ("phone-in-e164", r"(?<![\w.+-])(?:91)?[6-9]\d{9}(?![\w.])"),
]


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def say(msg: str) -> None:
    print(msg, flush=True)


# --- redaction -------------------------------------------------------------


def redact_email(value: str) -> str:
    """a***a@o***.in — keeps shape and domain TLD, drops the identity."""
    try:
        local, domain = value.split("@", 1)
    except ValueError:
        return "***"
    host, _, tld = domain.rpartition(".")
    keep = lambda s: (s[0] + "***" + s[-1]) if len(s) > 2 else "***"
    return f"{keep(local)}@{keep(host) if host else '***'}.{tld}"


def redact_token(value: str) -> str:
    """Keep the first and last character of a name/number token."""
    if len(value) <= 2:
        return "**"
    if len(value) <= 4:
        return value[0] + "*" * (len(value) - 2) + value[-1]
    return value[:2] + "*" * (len(value) - 4) + value[-2:]


def redact_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    return "+" + "*" * max(len(digits) - 2, 0) + digits[-2:] if digits else "***"


# --- pattern compilation ---------------------------------------------------


def compile_patterns(names, client_names, journal_canaries, note_canaries):
    """Return [(id, compiled_regex, redactor)] — every hit is fatal."""
    pats = []
    for pid, rx in PATTERN_DOCS:
        redactor = redact_email if pid == "email-address" else redact_phone
        pats.append((pid, re.compile(rx), redactor))

    tokens = set()
    for full in list(names) + list(client_names):
        value = full.strip()
        if not value:
            continue
        tokens.add(value)
        # "Dr. Ananya Rao" -> also "Ananya Rao", "Ananya", "Rao"
        bare = re.sub(r"^(dr|mr|mrs|ms|prof)\.?\s+", "", value, flags=re.I)
        tokens.add(bare)
        parts = bare.split()
        tokens.update(parts)

    for token in sorted(tokens, key=len, reverse=True):
        if len(token) < 3:
            continue
        pats.append(
            (
                "person-name",
                re.compile(r"\b" + re.escape(token) + r"\b", re.I),
                redact_token,
            )
        )

    for pid, canaries in (("journal-text", journal_canaries), ("note-text", note_canaries)):
        for canary in canaries or []:
            if canary:
                pats.append(
                    ("journal-text" if pid == "journal-text" else "note-text",
                     re.compile(re.escape(canary), re.I),
                     redact_token)
                )
    return pats


# --- log retrieval ---------------------------------------------------------


def aws_json(args):
    p = subprocess.run(
        ["aws"] + args + ["--region", REGION, "--output", "json"],
        capture_output=True,
        text=True,
    )
    if p.returncode != 0:
        raise RuntimeError(f"awscli failed ({' '.join(args[:3])}…): {p.stderr.strip()[:400]}")
    return json.loads(p.stdout or "{}")


def fetch_events(group, start_ms, end_ms):
    """All events in [start, end). Paginates; filter-log-events caps at 10k."""
    out, token, pages = [], None, 0
    while True:
        args = [
            "logs",
            "filter-log-events",
            "--log-group-name",
            group,
            "--start-time",
            str(start_ms),
            "--end-time",
            str(end_ms),
            "--limit",
            "10000",
        ]
        if token:
            args += ["--next-token", token]
        page = aws_json(args)
        out.extend(page.get("events", []))
        token = page.get("nextToken")
        pages += 1
        if not token or pages >= 100:
            break
    return out


# --- scanning --------------------------------------------------------------


def parse_args(argv):
    ap = argparse.ArgumentParser(
        description="Fail-closed PII scan of the Okuvu CloudWatch log groups.",
    )
    ap.add_argument("--hours", type=float, default=24.0, help="window length in hours (default 24)")
    ap.add_argument("--start", help="ISO-8601 UTC start (overrides --hours)")
    ap.add_argument("--end", help="ISO-8601 UTC end (default now)")
    ap.add_argument("--group", action="append", dest="groups", help="log group (repeatable)")
    ap.add_argument("--files", nargs="*", help="scan local files instead of CloudWatch")
    ap.add_argument("--names", default=None, help="comma-separated person names to look for")
    ap.add_argument("--client-names", default="", help="comma-separated client names")
    ap.add_argument("--journal-canary", default="", help="free-text canary for journal bodies")
    ap.add_argument("--note-canary", default="", help="free-text canary for note bodies")
    ap.add_argument("--max-samples", type=int, default=5, help="redacted samples per pattern")
    ap.add_argument("--list-patterns", action="store_true", help="print the pattern set and exit")
    return ap.parse_args(argv)


def iso_to_ms(value: str) -> int:
    text = value.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def split_csv(value):
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def main(argv=None) -> int:
    a = parse_args(argv)

    if a.list_patterns:
        say("Pattern set (all hits are fatal):")
        for pid, rx in PATTERN_DOCS:
            say(f"  {pid:<16} {rx}")
        say(f"  {'person-name':<16} seeded therapist names + bare tokens, case-insensitive")
        say(f"  {'client-name':<16} --client-names pairs (empty by default)")
        say(f"  {'journal-text':<16} --journal-canary substrings (empty by default)")
        return 0

    names = split_csv(a.names) if a.names is not None else DEFAULT_NAMES
    client_names = split_csv(a.client_names)
    journal = split_csv(a.journal_canary)
    notes = split_csv(a.note_canary)
    patterns = compile_patterns(names, client_names, journal, notes)

    end_ms = iso_to_ms(a.end) if a.end else int(datetime.now(timezone.utc).timestamp() * 1000)
    if a.start:
        start_ms = iso_to_ms(a.start)
    else:
        start_ms = end_ms - int(a.hours * 3600 * 1000)
    if start_ms >= end_ms:
        say("ERROR: start must be before end")
        return 2

    say(f"[{ts()}] PII scan — window {datetime.fromtimestamp(start_ms/1000, timezone.utc).isoformat()}"
        f" .. {datetime.fromtimestamp(end_ms/1000, timezone.utc).isoformat()}"
        f" ({(end_ms-start_ms)/3600000:.2f}h), region {REGION}")

    # (group, event key) -> set of pattern ids, so one event counts once per pattern
    hits = {}
    scanned = {}
    samples = {}

    if a.files:
        sources = []
        for path in a.files:
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    for lineno, line in enumerate(fh, 1):
                        sources.append((path, lineno, line))
            except OSError as exc:
                say(f"ERROR: cannot read {path}: {exc}")
                return 2
        scanned["(files)"] = len(sources)
        for path, lineno, body in sources:
            for pid, rx, redactor in patterns:
                for match in rx.finditer(body):
                    key = (path, lineno, pid)
                    hits.setdefault(key, set()).add(re.sub(r"\s+", " ", match.group(0)))
                    samples.setdefault(pid, []).append(redactor(match.group(0)))
    else:
        groups = a.groups or DEFAULT_GROUPS
        for group in groups:
            try:
                events = fetch_events(group, start_ms, end_ms)
            except RuntimeError as exc:
                say(f"ERROR: {exc}")
                return 2
            scanned[group] = len(events)
            say(f"[{ts()}] {group}: {len(events)} events")
            for ev in events:
                body = ev.get("message", "")
                for pid, rx, redactor in patterns:
                    for match in rx.finditer(body):
                        key = (group, ev.get("eventId") or ev.get("timestamp"), pid)
                        hits.setdefault(key, set()).add(re.sub(r"\s+", " ", match.group(0)))
                        samples.setdefault(pid, []).append(redactor(match.group(0)))

    total_events = sum(scanned.values())
    say("")
    say(f"scanned: {total_events} events across {len(scanned)} source(s)")
    for source, count in scanned.items():
        say(f"  {source:<28} {count}")

    by_pattern = {}
    by_group = {}
    for (source, _key, pid) in hits:
        by_pattern[pid] = by_pattern.get(pid, 0) + 1
        by_group.setdefault(source, {}).setdefault(pid, 0)
        by_group[source][pid] += 1

    say("")
    say("hits:")
    if not hits:
        say("  none")
    for pid in sorted(by_pattern):
        say(f"  {pid:<16} {by_pattern[pid]} event(s)")
        seen = set()
        for sample in samples.get(pid, []):
            if sample in seen:
                continue
            seen.add(sample)
            say(f"      sample: {sample}")
            if len(seen) >= a.max_samples:
                break

    say("")
    if hits:
        say("by source:")
        for source in sorted(by_group):
            detail = ", ".join(f"{pid}={count}" for pid, count in sorted(by_group[source].items()))
            say(f"  {source:<28} {detail}")
        say("")
        say(f"[{ts()}] FAIL — {len(hits)} personal-data hit(s) in log output")
        return 1
    say(f"[{ts()}] PASS — no personal data found in {total_events} event(s)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(2)
