#!/usr/bin/env python3
"""Fail the build on a relative import Node's ESM loader cannot resolve.

Why this exists: `apps/api` and `apps/worker` are compiled by `tsc` and run by
plain `node` as ESM. TypeScript and Vitest both resolve extensionless
specifiers, so `import { x } from './log-identity'` typechecks and passes the
whole test suite — and then the container dies on boot with:

    Error [ERR_MODULE_NOT_FOUND]: Cannot find module
    '/app/apps/api/dist/lib/log-identity' imported from .../email.js

That is exactly how a wave once "deployed" an api that crash-looped until the
ECS circuit breaker rolled it back. The failure is invisible to every gate
except a real container run, so it gets its own check, ahead of the docker
build.

Rule: in the ESM-run apps, every relative import/export must carry an explicit
extension (.js for TS sources, .json/.node where applicable). Type-only imports
are exempt because `tsc` erases them and they never reach the loader.

Usage:
    check-esm-imports.py [app-dir ...]      # defaults to apps/api apps/worker
Exit codes: 0 clean, 1 violations found.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DEFAULT_APPS = ("apps/api", "apps/worker")

# Packages whose *.ts SOURCE is loaded by the container at runtime (their
# package.json `exports` point at .ts, so Node strips types on the fly). The
# `.js` rule above does not apply here: there is no compiled .js to point at, so
# the only specifier Node can resolve is a package subpath through the exports
# map. A relative import without an extension typechecks, passes vitest, passes
# this script's app scan — and then crash-loops the api with
# `Cannot find module '/app/packages/shared-types/worksheets'`.
RUNTIME_PACKAGES = ("packages/shared-types",)

# import ... from './x' | export ... from '../y' | import './side-effect'
IMPORT_RE = re.compile(
    r"""(?<![A-Za-z0-9_$])(?:import|export)\s
        (?:[^'"]*?\sfrom\s)?          # optional "..." from clause
        ['"](\.[^'"]*)['"]            # the relative specifier
    """,
    re.VERBOSE,
)
# `import type { X } from './x'` never reaches the runtime loader.
TYPE_ONLY_RE = re.compile(r"(?<![A-Za-z0-9_$])import\s+type\s")
VALID_SUFFIXES = (".js", ".json", ".node")


def violations_in(path: Path) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    text = path.read_text(encoding="utf-8", errors="replace")
    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        if TYPE_ONLY_RE.search(line):
            continue
        for match in IMPORT_RE.finditer(line):
            spec = match.group(1)
            if not spec.endswith(VALID_SUFFIXES):
                out.append((lineno, spec))
    return out


def main(argv: list[str]) -> int:
    apps = argv[1:] or list(DEFAULT_APPS)
    total = 0
    checked = 0
    for app in apps:
        root = Path(app) / "src"
        if not root.is_dir():
            print(f"skip {app}: no src directory")
            continue
        for ts in sorted(root.rglob("*.ts")):
            if ts.name.endswith(".d.ts"):
                continue
            checked += 1
            for lineno, spec in violations_in(ts):
                total += 1
                print(f"{ts}:{lineno}: extensionless relative import {spec!r}")
    for pkg in RUNTIME_PACKAGES:
        root = Path(pkg)
        if not root.is_dir():
            continue
        for ts in sorted(root.rglob("*.ts")):
            if ts.name.endswith(".d.ts") or "__tests__" in ts.parts:
                continue
            checked += 1
            for lineno, spec in violations_in(ts):
                total += 1
                print(
                    f"{ts}:{lineno}: relative import {spec!r} in a runtime-loaded "
                    "package (use a package subpath, e.g. "
                    "'@okuvu/shared-types/worksheets/types')"
                )
    print(f"checked {checked} files; {total} extensionless relative import(s)")
    if total:
        print(
            "FAIL: these compile and pass tests, then crash the container at boot "
            "with ERR_MODULE_NOT_FOUND. Add the .js extension (apps), or import "
            "the package subpath (runtime-loaded packages)."
        )
        return 1
    print("OK: every relative import resolves under Node ESM")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
