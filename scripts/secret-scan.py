#!/usr/bin/env python3
"""Fail the build on a secret that could be committed; report, never fail, on
secrets that already are.

Two scans, two very different consequences:

  tree     — the working tree: every file git would commit (tracked, plus
             untracked files that are not ignored). A hit here is a secret on
             its way into a public repository. It FAILS the build.

  history  — every commit reachable from every ref. A hit here is a secret that
             is already world-readable, and no build can undo that. It is
             reported loudly — with the commit, path and line — and the build
             stays green. A gate that is red for a leak nobody can fix from a
             pull request is a gate that gets commented out within a week, and
             then it protects nothing (same reasoning as security-gate.py's
             CRITICAL-only policy).

Exit codes
  0  clean (or: history-only findings, which are not fatal by design)
  1  gate breached — at least one *new* secret in the working tree
  2  usage/tooling error: unreadable file, unparseable allowlist, git and the
     filesystem both unavailable, crash. Always fails the build. "Unknown" is
     not "clean".
  3  history scan could not be completed (shallow clone, git missing, timeout).
     NOT a build failure — the tree scan is the gate — but it is not a pass
     either, and it says so.

What is detected (see RULES): Google OAuth client secrets (GOCSPX-), Google API
keys (AIza), AWS access key ids (AKIA/ASIA), GitHub tokens (ghp_/gho_/ghu_/
ghs_/ghr_/github_pat_), PEM private keys, postgres:// URLs that carry a real
user:password pair, OpenAI/Anthropic keys (sk-/sk-ant-), Slack tokens
(xox[bap]-), and high-entropy strings inside config-like files (.env*, *.yaml,
*.yml, *.json, *.properties, *.tfvars).

Two deliberate precision choices, both measured against this repository:

  * a postgres URL whose password is a placeholder (`***`, `[password]`,
    `${var}`, `%s`, `<your-password>`) is NOT a finding. Five tracked files
    document the URL shape that way; without this filter the gate would fail
    every build on documentation and be turned off. Placeholder hits are counted
    and printed in --verbose so the filter is visible, never silent.
  * the entropy rule requires at least one upper-case, one lower-case and one
    digit character, plus 3.5 bits/char, and ignores hex (commit SHAs, digests),
    UUIDs, paths, URLs, Docker digests, SRI hashes and lockfiles. Lower-case
    kebab-case package names otherwise score ~3.6 bits/char and flood the
    report.

Suppression: scripts/secret-scan-allowlist.txt. Every entry needs a rule, a
path, and a `reason` of real length. Entries in the [working-tree] section only
silence working-tree findings; entries in [history] must be documented false
positives and are announced when they fire. There is no wildcard "ignore
everything" switch, and an allowlist that cannot be read or parsed fails the
build (exit 2) rather than passing it.

Usage
    scripts/secret-scan.py tree [--root DIR] [--allowlist FILE] [-v]
    scripts/secret-scan.py history [--depth N] [--limit N] [--allowlist FILE] [-v]
    scripts/secret-scan.py all [--limit N] [-v]

    --root DIR        scan DIR instead of the repository root (controls)
    --allowlist FILE  default: scripts/secret-scan-allowlist.txt next to this file
    --depth N         history: only the N most recent commits (0 = all, default)
    --limit N         history: cap the number of deduplicated findings listed
                      (default 40; the count of suppressed entries is printed)
    -v/--verbose      also print the placeholder sites ignored in the tree, and
                      per-phase timings in the history scan

No third-party dependencies. Python 3.9+.
"""

from __future__ import annotations

import argparse
import math
import os
import re
import subprocess
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ALLOWLIST = REPO_ROOT / "scripts" / "secret-scan-allowlist.txt"

# A file larger than this is not a configuration file. Scanning a 200 MB blob
# for strings costs minutes and finds nothing; skipping it silently would be a
# blind spot, so skipped files are counted and printed.
MAX_FILE_BYTES = 2 * 1024 * 1024

SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo",
    ".venv", "venv", "__pycache__", ".dart_tool", ".gradle", "Pods",
    ".terraform", "target", ".pnpm-store",
}

# Files whose shape is "generated" rather than "authored". A lockfile is full
# of base64 integrity hashes; every one of them is high entropy and none is a
# credential.
SKIP_NAME_RE = re.compile(
    r"(?:^|/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|.*\.lock|"
    r".*-lock\.json|pubspec\.lock|poetry\.lock|Cargo\.lock)$"
)

CONFIG_SUFFIXES = (".yaml", ".yml", ".json", ".properties", ".tfvars")
CONFIG_NAME = ".env"

ENTROPY_MIN_LEN = 20
ENTROPY_MIN_BITS = 3.5


# --------------------------------------------------------------------------
# rules
# --------------------------------------------------------------------------

def _mask_generic(value: str) -> str:
    return value[:6] + "\u2026"


def _mask_postgres(value: str) -> str:
    """Report scheme, user, the first 6 characters of the password and host.

    The user and host are not secrets and are what makes the finding
    actionable; the password is the credential and is truncated.
    """
    m = re.match(r"(?i)(postgres(?:ql)?)://([^:/@]*(?::[^@]*)?)@(.*)$", value)
    if not m:
        return _mask_generic(value)
    scheme, userinfo, host = m.groups()
    user, _, password = userinfo.partition(":")
    return f"{scheme}://{user}:{password[:6]}\u2026@{host}"


# A password is a placeholder when it is a literal marker rather than a value.
# Kept deliberately narrow: a real password that happens to contain "pass" must
# still be reported.
PLACEHOLDER_PASSWORDS = {
    "", "***", "******", "********", "xxx", "xxxx", "xxxxx", "xxxxxx",
    "password", "passwd", "pass", "secret", "changeme", "change-me", "redacted",
    "example", "placeholder", "none", "null", "undefined", "todo",
}
PLACEHOLDER_SHAPE_RE = re.compile(
    r"""^(?:
        [*xX.\u2022]+                    # all-mask
      | \[.*\]                           # [password]
      | <.*>                             # <your-password>
      | \{.*\}                           # {password}
      | \$\{.*\} | \$[A-Z_][A-Z0-9_]*    # ${var} / $VAR
      | %s | %\([^)]*\)s                 # printf placeholders
      | \{\{.*\}\}                       # template
      | .*(?:REDACTED|YOUR_|PLACEHOLDER|CHANGEME).*
    )$""",
    re.IGNORECASE | re.VERBOSE,
)


def is_placeholder_password(password: str) -> bool:
    p = password.strip()
    if len(p) < 8:
        return True
    if p.lower() in PLACEHOLDER_PASSWORDS:
        return True
    return bool(PLACEHOLDER_SHAPE_RE.match(p))


@dataclass(frozen=True)
class Rule:
    name: str
    pattern: re.Pattern
    what: str
    ere: str | None = None            # POSIX ERE prefilter for `git grep`; None = blob pass only
    config_only: bool = False
    mask: Callable[[str], str] | None = None


RULES: tuple[Rule, ...] = (
    Rule(
        name="google_oauth_client_secret",
        pattern=re.compile(r"GOCSPX-[A-Za-z0-9_-]{10,}"),
        what="Google OAuth client secret",
        ere=r"GOCSPX-[A-Za-z0-9_-]{10,}",
    ),
    Rule(
        name="google_api_key",
        pattern=re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
        what="Google API key",
        ere=r"AIza[0-9A-Za-z_-]{30,}",
    ),
    Rule(
        name="aws_access_key_id",
        pattern=re.compile(r"(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])"),
        what="AWS access key id",
        ere=r"(AKIA|ASIA)[0-9A-Z]{16}",
    ),
    Rule(
        name="github_token",
        pattern=re.compile(
            r"(?<![A-Za-z0-9_])(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}"
            r"|(?<![A-Za-z0-9_])github_pat_[A-Za-z0-9_]{40,}"
        ),
        what="GitHub token",
        ere=r"(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}",
    ),
    Rule(
        name="private_key_block",
        pattern=re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY"),
        what="PEM private key",
        ere=r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY",
    ),
    Rule(
        name="postgres_url_with_password",
        pattern=re.compile(
            r"(?i)\bpostgres(?:ql)?://[^\s:/@\"'<>]+:[^\s@\"'<>]+@[^\s\"'<>]+"
        ),
        what="postgres URL carrying a user:password pair",
        ere=r"postgres(ql)?://[^[:space:]:/@]+:[^[:space:]@]+@[^[:space:]]+",
        mask=_mask_postgres,
    ),
    Rule(
        name="openai_anthropic_key",
        pattern=re.compile(r"(?<![A-Za-z0-9_-])sk-(?:ant-)?[A-Za-z0-9_-]{20,}"),
        what="OpenAI/Anthropic-style API key",
        ere=r"sk-(ant-)?[A-Za-z0-9_-]{20,}",
    ),
    Rule(
        name="slack_token",
        pattern=re.compile(r"(?<![A-Za-z0-9])xox[bap]-[A-Za-z0-9-]{10,}"),
        what="Slack token",
        ere=r"xox[bap]-[A-Za-z0-9-]{10,}",
    ),
    Rule(
        name="high_entropy_string",
        pattern=re.compile(r"[A-Za-z0-9+/=_.\-]{20,}"),
        what="high-entropy string in a config file",
        config_only=True,
    ),
)

RULE_BY_NAME = {r.name: r for r in RULES}

HEX_RE = re.compile(r"^[0-9a-fA-F]+$")
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
BENIGN_RE = re.compile(
    r"(?i)(?:"
    r"sha(?:1|256|384|512)[-:]"          # SRI / docker digests
    r"|integrity"
    r"|https?://|://"
    r"|^[\w.+-]+@[\w.-]+$"               # email
    r"|^[a-z0-9][a-z0-9._-]*/[a-z0-9@]..."  # path
    r")"
)


def shannon_bits_per_char(s: str) -> float:
    if not s:
        return 0.0
    counts: dict[str, int] = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    total = len(s)
    return -sum((n / total) * math.log2(n / total) for n in counts.values())


def classes_of(s: str) -> tuple[bool, bool, bool, bool]:
    return (
        any(c.islower() for c in s),
        any(c.isupper() for c in s),
        any(c.isdigit() for c in s),
        any(not c.isalnum() for c in s),
    )


def is_high_entropy(value: str) -> bool:
    """True only for a token that looks like a generated credential."""
    v = value.strip().strip(".,;:'\"`)]}>")
    if len(v) < ENTROPY_MIN_LEN:
        return False
    # Shape filters, all of them measured against this repository's config files
    # rather than guessed: they killed every false positive the rule produced
    # (URLs, Gradle JVM flags, `--dart-define=A=B` CLI flags, dotted property
    # keys) while leaving base64/hex credentials alone.
    if v.startswith("-") or "//" in v:
        return False
    if "=" in v[:-2]:            # '=' is only legitimate as base64 padding
        return False
    if v.count(".") > 1:         # property keys, file names, class paths
        return False
    lower, upper, digit, _symbol = classes_of(v)
    # A kebab-case package name ("prettier-plugin-tailwindcss") clears 3.5
    # bits/char with lower+digit+hyphen and is not a secret. Requiring both
    # cases AND a digit costs us a purely lower-case password, which the
    # postgres URL rule still catches by URL shape.
    if not (lower and upper and digit):
        return False
    if HEX_RE.match(v) or UUID_RE.match(v):
        return False
    if BENIGN_RE.search(v):
        return False
    return shannon_bits_per_char(v) >= ENTROPY_MIN_BITS


def is_config_like(path: str) -> bool:
    name = os.path.basename(path)
    if name.startswith(CONFIG_NAME):
        return True
    return name.endswith(CONFIG_SUFFIXES)


# --------------------------------------------------------------------------
# findings
# --------------------------------------------------------------------------

@dataclass
class Finding:
    rule: str
    path: str
    line: int
    masked: str
    length: int

    @property
    def key(self) -> tuple[str, str]:
        return (self.path, self.rule)

    def render(self) -> str:
        return (
            f"  {self.rule:<32} {self.path}:{self.line}  "
            f"value={self.masked} (len={self.length})"
        )


@dataclass
class ScanStats:
    files: int = 0
    skipped_binary: int = 0
    skipped_large: int = 0
    placeholders: int = 0
    placeholder_sites: list[str] = field(default_factory=list)


def scan_text(path: str, text: str, stats: ScanStats) -> list[Finding]:
    """Apply every rule to one file's text. Returns masked findings only.

    The raw match never leaves this function: `masked` is at most 6 characters
    of the value, so a finding can be pasted into a public issue.

    A specific rule always wins over the entropy rule: `GOCSPX-…` in a .env is
    one finding ("Google OAuth client secret"), not two ("…and a high-entropy
    string"). Reporting the same value twice trains people to skim the list.
    """
    findings: list[Finding] = []
    config_like = is_config_like(path)
    specific = [r for r in RULES if not r.config_only]
    entropy_rule = RULE_BY_NAME["high_entropy_string"]

    for lineno, line in enumerate(text.splitlines(), 1):
        claimed: list[tuple[int, int]] = []
        for rule in specific:
            for match in rule.pattern.finditer(line):
                value = match.group(0)
                if rule.name == "postgres_url_with_password":
                    password = value.rsplit("://", 1)[-1].split("@", 1)[0].split(":", 1)
                    if len(password) == 2 and is_placeholder_password(password[1]):
                        stats.placeholders += 1
                        stats.placeholder_sites.append(f"{path}:{lineno}")
                        continue
                claimed.append(match.span())
                masked = (rule.mask or _mask_generic)(value)
                findings.append(Finding(rule.name, path, lineno, masked, len(value)))

        if not config_like:
            continue
        for match in entropy_rule.pattern.finditer(line):
            start, end = match.span()
            if any(start < c_end and c_start < end for c_start, c_end in claimed):
                continue
            if not is_high_entropy(match.group(0)):
                continue
            findings.append(
                Finding(entropy_rule.name, path, lineno, _mask_generic(match.group(0)), len(match.group(0)))
            )
    return findings


# --------------------------------------------------------------------------
# allowlist
# --------------------------------------------------------------------------

@dataclass
class AllowEntry:
    section: str
    rule: str
    path: str
    reason: str
    lineno: int


MIN_REASON_LEN = 20
_SECTION_RE = re.compile(r"^\[\[(working-tree|history)\]\]\s*$")
_KV_RE = re.compile(r"^([a-z_]+)\s*=\s*(.*)$")


def parse_allowlist(path: Path) -> list[AllowEntry]:
    """Parse the allowlist. Any structural problem raises AllowlistError.

    A suppression file that cannot be understood must never be read as "nothing
    is suppressed" or as "everything is": both fail open. It fails the build.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise AllowlistError(f"cannot read allowlist {path}: {exc}") from exc

    entries: list[AllowEntry] = []
    current: dict[str, object] | None = None
    start_line = 0

    def flush(lineno_end: int) -> None:
        nonlocal current, start_line
        if current is None:
            return
        rule = str(current.get("rule", "")).strip()
        fpath = str(current.get("path", "")).strip()
        reason = " ".join(str(current.get("reason", "")).split())
        section = str(current["section"])
        if not rule or not fpath or not reason:
            raise AllowlistError(
                f"{path}:{start_line}: entry in [[{section}]] needs rule, path and reason"
            )
        if rule not in RULE_BY_NAME:
            raise AllowlistError(
                f"{path}:{start_line}: unknown rule {rule!r} "
                f"(known: {', '.join(sorted(RULE_BY_NAME))})"
            )
        if len(reason) < MIN_REASON_LEN:
            raise AllowlistError(
                f"{path}:{start_line}: reason for {rule} on {fpath} is {len(reason)} "
                f"characters; a justification of at least {MIN_REASON_LEN} is required"
            )
        entries.append(AllowEntry(section, rule, fpath, reason, start_line))
        current = None

    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = _SECTION_RE.match(line)
        if m:
            flush(lineno)
            current = {"section": m.group(1)}
            start_line = lineno
            continue
        m = _KV_RE.match(line)
        if not m:
            raise AllowlistError(f"{path}:{lineno}: expected '[[section]]' or 'key = value', got {line!r}")
        if current is None:
            raise AllowlistError(f"{path}:{lineno}: key outside a [[working-tree]] or [[history]] section")
        key, value = m.group(1), m.group(2).strip()
        if key not in ("rule", "path", "reason"):
            raise AllowlistError(f"{path}:{lineno}: unknown key {key!r}")
        if key in current:
            raise AllowlistError(f"{path}:{lineno}: duplicate key {key!r} in one entry")
        current[key] = value
    flush(len(text.splitlines()) + 1)
    return entries


class AllowlistError(Exception):
    pass


def apply_allowlist(
    findings: list[Finding], entries: list[AllowEntry], section: str
) -> tuple[list[Finding], list[tuple[Finding, AllowEntry]]]:
    allowed: list[tuple[Finding, AllowEntry]] = []
    kept: list[Finding] = []
    for f in findings:
        hit = next(
            (
                e
                for e in entries
                if e.section == section and e.rule == f.rule and e.path == f.path
            ),
            None,
        )
        if hit is None:
            kept.append(f)
        else:
            allowed.append((f, hit))
    return kept, allowed


# --------------------------------------------------------------------------
# tree scan
# --------------------------------------------------------------------------

def enumerate_tree(root: Path) -> tuple[list[str], bool]:
    """Return (relative paths, used_git).

    Uses git so the scan covers exactly what a commit could contain: tracked
    files plus untracked files that are not ignored. If git is unavailable the
    filesystem is walked instead, which is a superset (it includes ignored
    files) — fail-closed, never fail-open.
    """
    proc = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        capture_output=True,
    )
    if proc.returncode == 0 and proc.stdout is not None:
        paths = [p for p in proc.stdout.decode("utf-8", "replace").split("\0") if p]
        return sorted(set(paths)), True

    if not root.is_dir():
        raise ScanError(f"cannot enumerate {root}: {proc.stderr.decode('utf-8', 'replace').strip()[:200]}")

    walked: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            full = Path(dirpath) / name
            walked.append(str(full.relative_to(root)))
    return walked, False


class ScanError(Exception):
    pass


def scan_tree(root: Path, stats: ScanStats) -> list[Finding]:
    paths, used_git = enumerate_tree(root)
    findings: list[Finding] = []
    for rel in paths:
        if SKIP_NAME_RE.search(rel):
            continue
        full = root / rel
        try:
            size = full.stat().st_size
        except OSError as exc:
            raise ScanError(f"cannot stat {rel}: {exc}") from exc
        if size > MAX_FILE_BYTES:
            stats.skipped_large += 1
            continue
        try:
            data = full.read_bytes()
        except OSError as exc:
            # An unreadable file could hold the secret we are looking for.
            # Fail closed rather than skipping it.
            raise ScanError(f"cannot read {rel}: {exc}") from exc
        if b"\0" in data[:8192]:
            stats.skipped_binary += 1
            continue
        stats.files += 1
        findings.extend(scan_text(rel, data.decode("utf-8", "replace"), stats))
    print(
        f"scanned {stats.files} file(s) "
        f"({'git ls-files' if used_git else 'filesystem walk'}), "
        f"skipped {stats.skipped_binary} binary, {stats.skipped_large} oversized"
    )
    if stats.placeholders:
        print(
            f"ignored {stats.placeholders} placeholder credential(s) "
            f"('***', '[password]', '${{var}}', '%s') — URL shape, not a value"
        )
    return findings


def cmd_tree(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve() if args.root else REPO_ROOT
    stats = ScanStats()
    entries, allowlist_path = load_allowlist(args)
    findings = scan_tree(root, stats)
    if args.verbose:
        for site in stats.placeholder_sites:
            print(f"  placeholder at {site} — URL shape, not a value")
    kept, allowed = apply_allowlist(findings, entries, "working-tree")
    for f, e in allowed:
        print(
            f"ALLOWED  {f.rule} {f.path}:{f.line}  reason: {e.reason}  "
            f"({allowlist_path.name}:{e.lineno})"
        )

    if not kept:
        print("OK: no new secrets in the working tree")
        return 0

    print(f"\n{len(kept)} NEW SECRET(S) IN THE WORKING TREE:", file=sys.stderr)
    for f in kept:
        print(f.render(), file=sys.stderr)
    print(
        "\nSECRET SCAN FAILED: a credential in the working tree would be committed. "
        "Remove it, read it from Secrets Manager / SSM at runtime, and rotate it if it "
        "was ever a real value. See docs/SECRET-REMEDIATION.md.",
        file=sys.stderr,
    )
    return 1


def load_allowlist(args: argparse.Namespace) -> tuple[list[AllowEntry], Path]:
    path = Path(args.allowlist) if args.allowlist else DEFAULT_ALLOWLIST
    if not path.is_file():
        raise AllowlistError(
            f"allowlist {path} does not exist — a missing allowlist must not read as "
            "'nothing suppressed' nor as 'everything suppressed'"
        )
    return parse_allowlist(path), path


# --------------------------------------------------------------------------
# history scan
# --------------------------------------------------------------------------

def _git(args: list[str], cwd: Path, check: bool = True) -> str:
    proc = subprocess.run(["git", "-C", str(cwd)] + args, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise ScanError(f"git {' '.join(args[:3])} failed: {proc.stderr.strip()[:300]}")
    return proc.stdout


def _rev_list(root: Path, depth: int) -> list[str]:
    args = ["rev-list", "--all"]
    if depth:
        args += [f"--max-count={depth}"]
    commits = [c for c in _git(args, root).split() if c]
    if not commits:
        raise ScanError("git rev-list --all returned no commits")
    return commits


def _config_blob_index(root: Path, commits: list[str]) -> tuple[dict[str, set[str]], dict[str, list[str]]]:
    """One `git ls-tree -r` per commit → (blob -> paths, blob -> commits).

    556 commits takes about 4 s here, far cheaper than reading every blob, and
    it keeps a blob's identity separate from the (path, commit) pairs that
    reference it: an unchanged config file is scanned once, not once per commit.
    """
    blobs: dict[str, set[str]] = {}
    blob_commits: dict[str, list[str]] = {}
    for sha in commits:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-tree", "-r", "-z", sha],
            capture_output=True,
        )
        if out.returncode != 0:
            raise ScanError(f"git ls-tree {sha[:12]} failed")
        for entry in out.stdout.split(b"\0"):
            if not entry or b"\t" not in entry:
                continue
            meta, path = entry.split(b"\t", 1)
            fields = meta.split()
            if len(fields) != 3 or fields[1] != b"blob":
                continue
            rel = path.decode("utf-8", "replace")
            if not is_config_like(rel) or SKIP_NAME_RE.search(rel):
                continue
            blob = fields[2].decode()
            blobs.setdefault(blob, set()).add(rel)
            blob_commits.setdefault(blob, []).append(sha)
    return blobs, blob_commits


def _read_blobs(root: Path, shas: list[str]) -> dict[str, bytes]:
    """Read many blobs through one `git cat-file --batch` process."""
    if not shas:
        return {}
    proc = subprocess.Popen(
        ["git", "-C", str(root), "cat-file", "--batch"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert proc.stdin and proc.stdout
    out: dict[str, bytes] = {}
    try:
        proc.stdin.write("\n".join(shas).encode() + b"\n")
        proc.stdin.flush()
        for sha in shas:
            header = proc.stdout.readline()
            if not header:
                raise ScanError("git cat-file --batch ended early")
            parts = header.split()
            if len(parts) < 3 or parts[1] == b"missing":
                continue
            size = int(parts[2])
            payload = proc.stdout.read(size)
            proc.stdout.read(1)  # trailing newline
            out[sha] = payload
    finally:
        try:
            proc.stdin.close()
        except OSError:
            pass
        proc.wait(timeout=30)
    return out


@dataclass
class HistoryAggregate:
    rule: str
    path: str
    commits: list[str] = field(default_factory=list)
    last_seen: str = ""
    masked: str = ""
    length: int = 0
    values: set[str] = field(default_factory=set)

    def add(self, commit: str, masked: str, length: int) -> None:
        self.commits.append(commit)
        self.values.add(masked)
        if not self.last_seen:
            self.last_seen, self.masked, self.length = commit, masked, length


def _history_regex_pass(root: Path, commits: list[str]) -> list[tuple[str, str, int, str]]:
    """One `git grep` over every commit: (commit, path, line, text).

    The prefilter is a POSIX ERE and deliberately looser than the Python rules
    (no word boundaries); classification happens in Python on the matched
    lines, so the ERE cannot decide what counts as a finding.
    """
    ere = "|".join(r.ere for r in RULES if r.ere)
    proc = subprocess.run(
        ["git", "-C", str(root), "grep", "-E", "-n", "-I", "-e", ere] + commits,
        capture_output=True, text=True,
    )
    # 1 = no matches, which is a legitimate empty result; anything else is fatal.
    if proc.returncode not in (0, 1):
        raise ScanError(f"git grep failed: {proc.stderr.strip()[:300]}")
    rows: list[tuple[str, str, int, str]] = []
    for line in proc.stdout.splitlines():
        m = re.match(r"^([0-9a-f]{40}):(.*?):(\d+):(.*)$", line)
        if not m:
            continue
        rows.append((m.group(1), m.group(2), int(m.group(3)), m.group(4)))
    return rows


def scan_history(root: Path, depth: int, verbose: bool) -> tuple[list[HistoryAggregate], dict[str, int]]:
    t0 = time.time()
    commits = _rev_list(root, depth)
    meta = {"commits": len(commits)}
    print(f"history: {len(commits)} commit(s) reachable from all refs")

    agg: dict[tuple[str, str], HistoryAggregate] = {}

    def record(commit: str, path: str, finding: Finding) -> None:
        key = (finding.rule, path)
        a = agg.get(key)
        if a is None:
            a = agg[key] = HistoryAggregate(finding.rule, path)
        a.add(commit, finding.masked, finding.length)

    stats = ScanStats()
    rows = _history_regex_pass(root, commits)
    print(f"history: regex pass matched {len(rows)} line(s) in {time.time() - t0:.1f}s")
    for commit, path, _lineno, text in rows:
        for finding in scan_text(path, text, stats):
            record(commit, path, finding)

    # High-entropy values need the file contents, not a pattern, so they get a
    # blob pass restricted to config-like paths.
    t1 = time.time()
    blobs, blob_commits = _config_blob_index(root, commits)
    meta["config_blobs"] = len(blobs)
    print(f"history: {len(blobs)} distinct config-like blob(s) in {time.time() - t1:.1f}s")
    t2 = time.time()
    contents = _read_blobs(root, sorted(blobs))
    print(f"history: read {len(contents)} blob(s) in {time.time() - t2:.1f}s")

    for sha, payload in contents.items():
        if b"\0" in payload[:8192]:
            stats.skipped_binary += 1
            continue
        text = payload.decode("utf-8", "replace")
        for path in sorted(blobs[sha]):
            entropy = [f for f in scan_text(path, text, stats) if f.rule == "high_entropy_string"]
            for finding in entropy:
                for commit in blob_commits.get(sha, []):
                    record(commit, path, finding)

    meta["seconds"] = int(time.time() - t0)
    meta["placeholders"] = stats.placeholders
    if verbose:
        print(f"history: placeholders ignored={stats.placeholders}, binary blobs skipped={stats.skipped_binary}")
    return sorted(agg.values(), key=lambda a: (a.rule, a.path)), meta


def cmd_history(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve() if args.root else REPO_ROOT
    shallow = _git(["rev-parse", "--is-shallow-repository"], root, check=False).strip()
    entries, _path = load_allowlist(args)
    findings, meta = scan_history(root, args.depth, args.verbose)

    kept, allowed = apply_allowlist(
        [Finding(a.rule, a.path, 0, a.masked, a.length) for a in findings], entries, "history"
    )
    allowed_keys = {(f.rule, f.path) for f, _ in allowed}
    for f, e in allowed:
        print(f"HISTORY-ALLOWED (documented false positive)  {f.rule} {f.path}  reason: {e.reason}")

    shown = [a for a in findings if (a.rule, a.path) not in allowed_keys]
    print()
    if not shown:
        print(f"HISTORY: no historical findings ({meta['commits']} commits scanned)")
    else:
        print("=" * 78)
        print(f"HISTORICAL SECRETS — {len(shown)} distinct path+type, already in git history.")
        print("These are NOT build failures: the leak predates this gate and no")
        print("pull request can remove a value from a commit that is already published.")
        print("=" * 78)
        for a in shown[: args.limit]:
            extra = f", +{len(a.values) - 1} other value(s)" if len(a.values) > 1 else ""
            print(
                f"  {a.rule:<32} {a.path}\n"
                f"  {'':<32} last_seen={a.last_seen[:12]} "
                f"commits={len(set(a.commits))} value={a.masked} (len={a.length}){extra}"
            )
        if len(shown) > args.limit:
            print(f"  ... and {len(shown) - args.limit} more (capped at --limit {args.limit})")
        print(
            "\nRotation is an owner action: docs/SECRET-REMEDIATION.md. Making the "
            "repository private does not un-publish what has already been cloned."
        )

    if shallow == "true":
        print(
            "\nHISTORY SCAN INCOMPLETE: this is a shallow clone, so 'no findings' "
            "would be a false negative. Use a full clone (depth 0).",
            file=sys.stderr,
        )
        return 3
    return 0


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Fail on new secrets in the working tree; report historical ones.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "exit codes: 0 clean, 1 new secret in the working tree, "
            "2 unreadable state or bad allowlist, 3 history scan incomplete\n\n"
            "controls (from the repository root):\n"
            "  write a file whose GOOGLE_CLIENT_SECRET value is the literal\n"
            "  'GOCSPX-' followed by 24 characters into /tmp/control.env, then\n"
            "      scripts/secret-scan.py tree --root /tmp   # exit 1\n"
            "      scripts/secret-scan.py tree               # exit 0 on a clean tree\n"
            "      scripts/secret-scan.py history            # exit 0, findings listed\n"
            "The example value is described rather than written so that this\n"
            "file does not trip its own rule."
        ),
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("tree", help="scan the working tree (fatal on a hit)")
    t.add_argument("--root", default=None, help="scan this directory instead of the repository root")
    t.add_argument("--allowlist", default=None, help="default: scripts/secret-scan-allowlist.txt")

    h = sub.add_parser("history", help="scan every commit (never fatal)")
    h.add_argument("--root", default=None)
    h.add_argument("--allowlist", default=None)
    h.add_argument("--depth", type=int, default=0, help="scan only the N most recent commits (0 = all)")
    h.add_argument("--limit", type=int, default=40, help="cap listed findings (default 40)")

    a = sub.add_parser("all", help="tree then history; the tree's exit code decides")
    a.add_argument("--root", default=None)
    a.add_argument("--allowlist", default=None)
    a.add_argument("--depth", type=int, default=0)
    a.add_argument("--limit", type=int, default=40)

    for sp in (t, h, a):
        sp.add_argument("-v", "--verbose", action="store_true")
    return p


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    if args.cmd == "tree":
        return cmd_tree(args)

    if args.cmd == "history":
        return cmd_history(args)

    # all: the tree gate is authoritative; a history that could not be read is
    # reported through the exit code but never turns a clean tree into a red
    # build, because there is nothing a commit can do about it.
    tree_rc = cmd_tree(args)
    print()
    hist_rc = cmd_history(args)
    if tree_rc != 0:
        return tree_rc
    return 3 if hist_rc == 3 else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (ScanError, AllowlistError) as exc:
        # A gate that cannot run must not pass.
        print(f"SECRET SCAN ERROR: {exc}", file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        print("SECRET SCAN INTERRUPTED", file=sys.stderr)
        sys.exit(2)
    except Exception as exc:  # noqa: BLE001 - a crashed gate must not pass
        print(f"SECRET SCAN CRASHED: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(2)
