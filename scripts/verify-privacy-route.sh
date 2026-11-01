#!/usr/bin/env bash
# E19-S2 — verify that the privacy policy is public and the portal is not.
#
# Runs the same assertions the story was evidenced with, against any base URL:
# a local production build, or the live host after deploy. Fails (exit 1) if
# /privacy is not 200 or if a protected route stops redirecting to /auth — the
# second half matters as much as the first, because the cheap way to make this
# story pass is to switch auth off.
#
# Usage:
#   scripts/verify-privacy-route.sh                      # http://localhost:3100
#   scripts/verify-privacy-route.sh https://okuvu.in     # the live apex
#   BASE_URL=https://portal.okuvu.in scripts/verify-privacy-route.sh
#
# For a local run, build and start the portal first:
#   pnpm --filter @okuvu/therapist-portal build
#   (cd apps/therapist-portal && npx next start -p 3100)
set -uo pipefail

BASE_URL="${BASE_URL:-${1:-http://localhost:3100}}"
BASE_URL="${BASE_URL%/}"

PUBLIC_PATHS=("/privacy")
PROTECTED_PATHS=("/" "/dashboard" "/clients/abc" "/schedule")

fail=0

status_of() { # path -> status code (no redirect following)
  curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$1"
}
location_of() { # path -> redirect target
  curl -s -o /dev/null -w '%{redirect_url}' "$BASE_URL$1"
}

echo "base url: $BASE_URL"
echo "utc:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

for path in "${PUBLIC_PATHS[@]}"; do
  code="$(status_of "$path")"
  if [ "$code" = "200" ]; then
    echo "PASS  $path -> $code (public)"
  else
    echo "FAIL  $path -> $code (expected 200)"
    fail=1
  fi
done

for path in "${PROTECTED_PATHS[@]}"; do
  code="$(status_of "$path")"
  loc="$(location_of "$path")"
  if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "303" ]; then
    case "$loc" in
      */auth*) echo "PASS  $path -> $code -> $loc (still protected)";;
      *)       echo "FAIL  $path -> $code -> $loc (redirects, but not to /auth)"; fail=1;;
    esac
  elif [ "$code" = "200" ]; then
    echo "FAIL  $path -> $code (PROTECTED ROUTE SERVED TO AN ANONYMOUS REQUEST)"
    fail=1
  else
    echo "WARN  $path -> $code (not a redirect; check manually)"
    fail=1
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "RESULT: PASS — /privacy public, protected routes still redirect to /auth"
else
  echo "RESULT: FAIL"
fi
exit "$fail"
