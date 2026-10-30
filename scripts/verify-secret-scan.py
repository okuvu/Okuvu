#!/usr/bin/env python3
"""Prove scripts/secret-scan.py bites, stays quiet on placeholders, and cannot be
switched off.

This is the inspectable proof for the E16-S8 gate. It drives the shipping
scanner — no reimplementation — through the four controls the change is judged
on, plus a per-rule matrix:

  1. clean tree            → exit 0
  2. new secret in the tree→ exit 1 (injected into this checkout, then removed,
                              so the proof is against the real repository and not
                              a fixture that cannot drift)
  3. historical secret     → exit 0, finding listed (a red build here would be a
                              build nobody can fix, and a gate that is always red
                              gets deleted)
  4. allowlist             → a justified entry suppresses a working-tree finding;
                              an entry without a real reason fails closed (2); a
                              missing allowlist fails closed (2); a [history]
                              entry cannot silence a working-tree finding (1)

Nothing real is ever printed: every finding goes through the scanner's masker
(first 6 characters), and the sample credentials are synthetic and assembled at
runtime from fragments, so this file does not trip the rule it is testing.

Usage:
    python3 scripts/verify-secret-scan.py [--keep]
Exit codes: 0 every case behaved as required, 1 at least one case did not.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCANNER = REPO_ROOT / "scripts" / "secret-scan.py"
ALLOWLIST = REPO_ROOT / "scripts" / "secret-scan-allowlist.txt"
CONTROL_FILE = REPO_ROOT / ".env.secret-scan-control"

PY = sys.executable or "python3"


def join(*parts: str) -> str:
    """Build a token from fragments so the sample never appears in a file."""
    return "".join(parts)


# Synthetic credentials, one per rule. Assembled at runtime on purpose.
SAMPLES: dict[str, str] = {
    "google_oauth_client_secret": join("GOCSPX", "-", "Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8"),
    "google_api_key": join("AIza", "Sy", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"),
    "aws_access_key_id": join("AKIA", "Q7XZ2W9PLM4NK8RT"),
    "github_token": join("ghp", "_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9"),
    "private_key_block": join("-----BEGIN ", "RSA ", "PRIVATE KEY-----"),
    "postgres_url_with_password": join(
        "postgresql://", "app_user", ":", "S3cr3tP4ssw0rd9x", "@", "db.internal", ":5432/app"
    ),
    "openai_anthropic_key": join("sk-", "ant-", "api03-Aa1Bb2Cc3Dd4Ee5Ff6Gg7"),
    "slack_token": join("xoxb", "-", "1234567890", "-", "abcdefghijklmnopqrstuvwx"),
    "high_entropy_string": join("Zx9", "Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lm"),
}

# Strings that look like the thing but are not a credential. The scanner must
# stay silent, or the gate is noise and gets disabled.
BENIGN: dict[str, list[str]] = {
    "postgres_url_with_password": [
        'DATABASE_URL="' + join("postgresql://", "app_user", ":***@", "db.internal/app") + '"',
        'DATABASE_URL="' + join("postgresql://", "[user]", ":[password]@", "[host]/evia") + '"',
        'DATABASE_URL="' + join("postgresql://", "${var.user}", ":${var.pass}@", "${host}") + '"',
    ],
    "high_entropy_string": [
        "integrity = " + join("sha512", "-", "Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2Yz3"),
        "commit = " + join("deadbeef", "c0ffee", "12345678", "9abcdef0", "11223344"),
        "id = " + join("3f2a1b4c", "-5d6e-", "4f70-", "8a9b-", "0c1d2e3f4a5b"),
        "pkg = " + join("prettier", "-plugin", "-tailwindcss"),
        "url = " + join("https", "://", "api.example.com", "/v2/things?include_markdown=true"),
    ],
}


class Case:
    def __init__(self, name: str, argv: list[str], expect: int, cwd: Path, must_contain: list[str] | None = None,
                 must_not_contain: list[str] | None = None):
        self.name = name
        self.argv = argv
        self.expect = expect
        self.cwd = cwd
        self.must_contain = must_contain or []
        self.must_not_contain = must_not_contain or []

    def run(self) -> bool:
        cmd = [PY, str(SCANNER)] + self.argv
        shown = "python3 scripts/secret-scan.py " + " ".join(self.argv)
        proc = subprocess.run(cmd, cwd=self.cwd, capture_output=True, text=True)
        out = (proc.stdout + proc.stderr).rstrip()
        ok = proc.returncode == self.expect
        for needle in self.must_contain:
            if needle not in out:
                ok = False
        for needle in self.must_not_contain:
            if needle in out:
                ok = False
        print(f"\n$ {shown}")
        for line in out.splitlines():
            print(f"    {line}")
        print(f"    -> exit {proc.returncode} (expected {self.expect})  "
              f"{'PASS' if ok else 'FAIL: ' + self.name}")
        return ok


def write(path: Path, *lines: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def allowlist_block(section: str, rule: str, path: str, reason: str) -> str:
    return "\n".join(
        [f"[[{section}]]", f"rule = {rule}", f"path = {path}", f"reason = {reason}"]
    )


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--keep", action="store_true", help="keep the temporary directories")
    args = ap.parse_args(argv[1:])

    results: list[tuple[str, bool]] = []

    def check(name: str, ok: bool) -> None:
        results.append((name, ok))

    tmp = Path(tempfile.mkdtemp(prefix="secret-scan-verify-"))
    try:
        # A leftover from a crashed run would make control 1 fail for the wrong
        # reason, so the control file is always cleared before anything runs.
        CONTROL_FILE.unlink(missing_ok=True)

        print("=" * 78)
        print("control 1 — clean working tree")
        print("=" * 78)
        ok = Case("clean tree", ["tree"], 0, REPO_ROOT, must_contain=["OK: no new secrets"]).run()
        check("1 clean tree exits 0", ok)

        print("\n" + "=" * 78)
        print("control 2 — a new secret in this checkout (the gate bites)")
        print("=" * 78)
        write(
            CONTROL_FILE,
            "# synthetic control file written by scripts/verify-secret-scan.py",
            "GOOGLE_CLIENT_SECRET=" + SAMPLES["google_oauth_client_secret"],
        )
        try:
            ok = Case(
                "injected GOCSPX", ["tree"], 1, REPO_ROOT,
                must_contain=["NEW SECRET", "google_oauth_client_secret", ".env.secret-scan-control"],
            ).run()
            check("2 injected secret exits 1", ok)
            ok2 = Case(
                "injected secret, verbose", ["tree", "-v"], 1, REPO_ROOT,
            ).run()
            check("2 injected secret exits 1 with -v", ok2)
        finally:
            CONTROL_FILE.unlink(missing_ok=True)
        print(f"\n    cleanup: {CONTROL_FILE.name} removed -> "
              f"{'absent' if not CONTROL_FILE.exists() else 'STILL PRESENT (remove it by hand)'}")
        check("2 control file removed", not CONTROL_FILE.exists())

        print("\n" + "=" * 78)
        print("control 3 — historical secrets are reported, not fatal")
        print("=" * 78)
        ok = Case(
            "history", ["history", "--limit", "10"], 0, REPO_ROOT,
            must_contain=["HISTORICAL SECRETS", "google_oauth_client_secret", "NOT build failures"],
        ).run()
        check("3 history exits 0 with findings", ok)

        print("\n" + "=" * 78)
        print("control 4 — the allowlist")
        print("=" * 78)
        work = tmp / "work"
        write(work / "config" / "app.env", "GOOGLE_CLIENT_SECRET=" + SAMPLES["google_oauth_client_secret"])

        justified = tmp / "justified.txt"
        justified.write_text(
            "# control allowlist\n"
            + allowlist_block(
                "working-tree", "google_oauth_client_secret", "config/app.env",
                "synthetic control value created by verify-secret-scan.py to prove suppression works",
            )
            + "\n",
            encoding="utf-8",
        )
        ok = Case(
            "justified allowlist", ["tree", "--root", str(work), "--allowlist", str(justified)], 0, tmp,
            must_contain=["ALLOWED", "OK: no new secrets"],
        ).run()
        check("4 justified entry suppresses and exits 0", ok)

        no_reason = tmp / "no-reason.txt"
        no_reason.write_text(
            allowlist_block("working-tree", "google_oauth_client_secret", "config/app.env", "because")
            + "\n",
            encoding="utf-8",
        )
        ok = Case(
            "short reason", ["tree", "--root", str(work), "--allowlist", str(no_reason)], 2, tmp,
            must_contain=["at least 20"],
        ).run()
        check("4 short justification exits 2", ok)

        missing = tmp / "does-not-exist.txt"
        ok = Case(
            "missing allowlist", ["tree", "--root", str(work), "--allowlist", str(missing)], 2, tmp,
            must_contain=["does not exist"],
        ).run()
        check("4 missing allowlist exits 2", ok)

        history_only = tmp / "history-only.txt"
        history_only.write_text(
            allowlist_block(
                "history", "google_oauth_client_secret", "config/app.env",
                "false positive: control entry that must NOT apply to the working tree",
            )
            + "\n",
            encoding="utf-8",
        )
        ok = Case(
            "history entry cannot silence the tree",
            ["tree", "--root", str(work), "--allowlist", str(history_only)], 1, tmp,
            must_contain=["NEW SECRET"],
        ).run()
        check("4 [history] entry does not silence the tree", ok)

        unknown_rule = tmp / "unknown-rule.txt"
        unknown_rule.write_text(
            allowlist_block(
                "working-tree", "not_a_rule", "config/app.env",
                "this entry names a rule that does not exist and must be rejected",
            )
            + "\n",
            encoding="utf-8",
        )
        ok = Case(
            "unknown rule", ["tree", "--root", str(work), "--allowlist", str(unknown_rule)], 2, tmp,
            must_contain=["unknown rule"],
        ).run()
        check("4 unknown rule name exits 2", ok)

        print("\n" + "=" * 78)
        print("matrix — every rule fires on a synthetic credential")
        print("=" * 78)
        for rule, sample in SAMPLES.items():
            case_dir = tmp / f"rule-{rule}"
            name = "app.json" if rule == "high_entropy_string" else "app.env"
            line = f"value = {sample}" if rule != "high_entropy_string" else f'{{"value": "{sample}"}}'
            write(case_dir / name, line)
            ok = Case(
                f"rule {rule}", ["tree", "--root", str(case_dir), "--allowlist", str(justified)], 1, tmp,
                must_contain=[rule],
            ).run()
            check(f"matrix: {rule} detected", ok)

        print("\n" + "=" * 78)
        print("matrix — look-alikes stay silent")
        print("=" * 78)
        for rule, lines in BENIGN.items():
            case_dir = tmp / f"benign-{rule}"
            write(case_dir / "app.env", *lines)
            ok = Case(
                f"benign {rule}", ["tree", "--root", str(case_dir), "--allowlist", str(justified)], 0, tmp,
                must_contain=["OK: no new secrets"],
            ).run()
            check(f"matrix: {rule} look-alikes ignored", ok)

        print("\n" + "=" * 78)
        passed = sum(1 for _, ok in results if ok)
        print(f"RESULT: {passed}/{len(results)} case(s) behaved as required")
        for name, ok in results:
            if not ok:
                print(f"  FAILED: {name}")
        print("=" * 78)
        return 0 if passed == len(results) else 1
    finally:
        if args.keep:
            print(f"kept {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Exception:  # noqa: BLE001 - report, never swallow
        traceback.print_exc()
        sys.exit(2)
