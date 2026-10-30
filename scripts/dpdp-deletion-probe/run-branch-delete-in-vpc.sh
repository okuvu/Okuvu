#!/usr/bin/env bash
# E16-S10 — exercise the branch's apps/api/src/lib/account.ts against the beta
# database *before* the branch is deployed.
#
# Why this exists: the deployed image (evia-beta/api) is built from develop, so
# it still carries the pre-fix dist/lib/account.js and POST /account/delete
# still leaks. This ships the working tree's account.ts (gzip+base64, ~4 KB)
# into the container's dist/lib/ and runs THAT FILE with node's type stripping,
# against the real beta database with the image's own Prisma client. The code
# executed is byte-for-byte the file in the branch; the only difference from the
# deployed route is the transport (no HTTP, no ALB).
#
# Once the branch is deployed, use the plain HTTP sequence in README.md instead
# and ignore this script.
#
# Usage:
#   scripts/dpdp-deletion-probe/run-branch-delete-in-vpc.sh <cognito-sub>
#   scripts/dpdp-deletion-probe/run-branch-delete-in-vpc.sh <cognito-sub> --check-only
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

SUB="${1:?usage: $0 <cognito-sub> [--check-only]}"
MODE="${2:-run}"

B64="$(gzip -c "$REPO/apps/api/src/lib/account.ts" | base64 -w0)"

READY="printf '%s' '$B64' | base64 -d | gunzip > /app/apps/api/dist/lib/account.e16s10.ts && wc -c /app/apps/api/dist/lib/account.e16s10.ts"

if [ "$MODE" = "--check-only" ]; then
  # Loads the module and prints how many subject tables it knows about.
  CALL="node --experimental-strip-types --input-type=module -e \"const m = await import('/app/apps/api/dist/lib/account.e16s10.ts'); console.log('module_ok', typeof m.deleteAccount, m.SUBJECT_TABLES.length);\""
else
  # Runs the real erasure path and prints its per-table erased counts.
  CALL="node --experimental-strip-types --input-type=module -e \"const m = await import('/app/apps/api/dist/lib/account.e16s10.ts'); const r = await m.deleteAccount('$SUB', { info: (o, msg) => console.log(msg, JSON.stringify(o)) }); console.log('result', JSON.stringify(r));\""
fi

exec bash "$REPO/scripts/in-vpc-db-task.sh" -- "$READY && $CALL"
