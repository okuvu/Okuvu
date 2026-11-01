#!/usr/bin/env bash
# Build a release artifact and record how it was built.
#
# Why: two release bugs shipped in one day because a compile-time flag was
# missing (--dart-define=FLAVOR=prod) and because a request payload disagreed
# with the API validator. The first is invisible in the artifact — an APK built
# without the define is byte-plausible, installs fine, and dies at launch. There
# is no static check that proves a Dart `String.fromEnvironment` was supplied.
# So record it at build time and make the verifier refuse an artifact whose
# provenance is missing or does not match the bytes.
#
# Usage:
#   scripts/build-release.sh                 # APK only (fast path for the phone)
#   scripts/build-release.sh --bundle        # APK + AAB (store upload)
#   scripts/build-release.sh --bundle --apk-only
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$REPO/apps/mobile"
OUT="$MOBILE/build/release-gate"

export PATH="$HOME/.local/flutter-sdk/bin:$PATH"
export JAVA_HOME="$HOME/.local/jdk-17"
export ANDROID_HOME="$HOME/.local/android"
export ANDROID_SDK_ROOT="$HOME/.local/android"

WANT_APK=1
WANT_AAB=0
RECORD_ONLY=0
CLIENT_ID_ARG=""
for arg in "$@"; do
  case "$arg" in
    --bundle) WANT_AAB=1 ;;
    --apk-only) WANT_APK=1; WANT_AAB=0 ;;
    --record-only) RECORD_ONLY=1 ;;
    --client-id=*) CLIENT_ID_ARG="${arg#--client-id=}" ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

FLAVOR=prod

# The web OAuth client id is deliberately absent from source (see
# lib/src/config/google_config.dart — no baked-in id, no fallback). Resolve it
# from, in order: the flag, the environment, the stored secret file. Never
# grep the source for it: the file only declares a String.fromEnvironment.
CLIENT_ID="$CLIENT_ID_ARG"
[[ -z "$CLIENT_ID" ]] && CLIENT_ID="${OKUVU_GOOGLE_CLIENT_ID:-}"
for f in "$REPO/.secrets/google-server-client-id" /opt/data/okuvu/keys/google-server-client-id; do
  [[ -z "$CLIENT_ID" && -f "$f" ]] && CLIENT_ID="$(tr -d '[:space:]' < "$f")"
done
if [[ -z "$CLIENT_ID" ]]; then
  echo "FATAL: no Google web client id. Pass --client-id=..., set" >&2
  echo "       OKUVU_GOOGLE_CLIENT_ID, or write it to .secrets/google-server-client-id" >&2
  echo "       (Cloud Console -> Google Auth Platform -> Clients -> Okuvu Web)." >&2
  exit 1
fi
if ! [[ "$CLIENT_ID" =~ ^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$ ]]; then
  echo "FATAL: client id '$CLIENT_ID' is not a web OAuth client id" >&2
  exit 1
fi

VERSION_LINE="$(grep -E '^version:' "$MOBILE/pubspec.yaml" | awk '{print $2}')"
VERSION_NAME="${VERSION_LINE%%+*}"
VERSION_CODE="${VERSION_LINE##*+}"

# keystore.properties is gitignored, so a fresh worktree has none and gradle
# either fails the bundle task or (worse) emits an unsigned APK silently.
# Point it at the canonical upload key, never at a copy inside the repo.
KEYSTORE=/opt/data/okuvu/keys/okuvu-upload.p12
KEYPASS_FILE=/opt/data/okuvu/keys/keystore-password.txt
PROPS="$MOBILE/android/keystore.properties"
if [[ ! -f "$KEYSTORE" || ! -f "$KEYPASS_FILE" ]]; then
  echo "FATAL: canonical keystore or password missing:" >&2
  echo "       $KEYSTORE / $KEYPASS_FILE" >&2
  echo "       Do not generate a new key — see the keystore section in the" >&2
  echo "       flutter-mobile-verification skill." >&2
  exit 1
fi
if [[ ! -f "$PROPS" ]] || ! grep -qF "$KEYSTORE" "$PROPS" 2>/dev/null; then
  KPASS="$(cat "$KEYPASS_FILE")"
  printf 'storePassword=%s\nkeyPassword=%s\nkeyAlias=upload\nstoreFile=%s\n' \
    "$KPASS" "$KPASS" "$KEYSTORE" > "$PROPS"
  chmod 600 "$PROPS"
  echo "wrote $PROPS -> $KEYSTORE"
fi

DEFINES=(
  "--dart-define=FLAVOR=$FLAVOR"
  "--dart-define=GOOGLE_SERVER_CLIENT_ID=$CLIENT_ID"
)

cd "$MOBILE"

build_one() {
  local target="$1" out="$2"
  echo ">>> flutter build $target --release --flavor $FLAVOR ${DEFINES[*]}"
  # No pipe through tail: it buffers the whole run and the job looks hung.
  flutter build "$target" --release --flavor "$FLAVOR" "${DEFINES[@]}"
  [[ -f "$out" ]] || { echo "FATAL: expected artifact missing: $out" >&2; exit 1; }
}

APK="$MOBILE/build/app/outputs/flutter-apk/app-$FLAVOR-release.apk"
AAB="$MOBILE/build/app/outputs/bundle/${FLAVOR}Release/app-$FLAVOR-release.aab"

[[ $RECORD_ONLY -eq 0 ]] && [[ $WANT_APK -eq 1 ]] && build_one apk "$APK"
[[ $RECORD_ONLY -eq 0 ]] && [[ $WANT_AAB -eq 1 ]] && build_one appbundle "$AAB"
if [[ $RECORD_ONLY -eq 1 ]]; then
  echo ">>> recording provenance for existing artifacts (no rebuild)"
  [[ -f "$APK" ]] || { echo "FATAL: no APK to record" >&2; exit 1; }
fi

mkdir -p "$OUT"
python3 - "$OUT/provenance.json" "$FLAVOR" "$VERSION_NAME" "$VERSION_CODE" \
          "$CLIENT_ID" "${WANT_APK}" "${WANT_AAB}" "$APK" "$AAB" "$REPO" <<'PY'
import hashlib, json, os, subprocess, sys, datetime
(out, flavor, vname, vcode, cid, want_apk, want_aab, apk, aab, repo) = sys.argv[1:11]

def record(path, wanted):
    # Only record what this run actually built. A stale APK/AAB left in the
    # build dir from an earlier run otherwise lands in provenance with its old
    # mtime/hash, and the FRESHNESS gate then blocks on an artifact nobody
    # asked this build to produce.
    if not wanted or not os.path.isfile(path):
        return None
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return {'path': os.path.relpath(path, repo),
            'bytes': os.path.getsize(path),
            'sha256': h.hexdigest()}

def dirty():
    # GeneratedPluginRegistrant.java is rewritten by `flutter build` on every run.
    # Counting it as "dirty" would block every release; count real source edits only.
    out = git('status', '--porcelain', '--untracked-files=no', '--',
              '.', ':(exclude)apps/mobile/android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java')
    return bool(out)

def git(*args):
    try:
        return subprocess.run(['git', '-C', repo, *args], capture_output=True,
                              text=True, check=True).stdout.strip()
    except subprocess.CalledProcessError:
        return None

doc = {
    'built_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'flavor': flavor,
    'dart_defines': {
        'FLAVOR': flavor,
        'GOOGLE_SERVER_CLIENT_ID': cid,
    },
    'forbidden_defines': ['LOCAL_DEV_BYPASS_AUTH', 'LOGIN_DIAG'],
    'version_name': vname,
    'version_code': int(vcode),
    'git_commit': git('rev-parse', 'HEAD'),
    'git_branch': git('rev-parse', '--abbrev-ref', 'HEAD'),
    'git_dirty': dirty(),
    'artifacts': {k: v for k, v in
                  (('apk', record(apk, want_apk == '1')),
                   ('aab', record(aab, want_aab == '1'))) if v},
}
with open(out, 'w') as f:
    json.dump(doc, f, indent=2)
print(f"provenance -> {out}")
PY

echo
echo "built $VERSION_NAME+$VERSION_CODE (flavor $FLAVOR)"
ls -l "$OUT/provenance.json"
echo "verify: python3 $REPO/scripts/verify-mobile-release.py"
