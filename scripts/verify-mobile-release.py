#!/usr/bin/env python3
"""Pre-release gate for the Okuvu mobile app.

Run this before every build handed to a phone or uploaded to Play. It answers
one question: is this artifact what we think it is, and does it agree with the
server it will talk to?

Six gates, each PASS/FAIL, exit 1 if any fails:

  PROVENANCE  the artifact was built by build-release.sh, and the recorded
              dart-defines/hash still describe the bytes on disk
  ARTIFACT    package, versionCode, versionName, SDK levels, signer cert, and
              the compiled-in client id, read out of the binary itself
  FRESHNESS   the AAB was built after the last change to lib/ (a stale bundle
              is how a fixed app ships a bug that was already fixed)
  SOURCE      flutter analyze clean, full widget/unit suite green
  CONTRACT    every field the API validator requires is present in the Dart
              request payload (two release bugs shipped from this gap)
  LIVE        the deployed API answers as this build expects

Every gate here exists because of a specific bug that reached the user:

  * FLAVOR dart-define missing  -> purple "app failed to start" screen on the
    handset; undetectable in the artifact, hence the provenance record.
  * consent screen posting two of four required booleans -> 400 on every
    onboarding, while the widget test stayed green against a stub adapter.
  * wrong upload key / wrong OAuth fingerprint -> silent no-op on sign-in,
    which looks like a dead button; hence the cert and client-id checks.

Usage:
    python3 scripts/verify-mobile-release.py
    python3 scripts/verify-mobile-release.py --skip-source   # artifact-only (fast)
    python3 scripts/verify-mobile-release.py --api https://beta.api.okuvu.in
    python3 scripts/verify-mobile-release.py --json          # machine-readable

The script never modifies anything and never prints a secret. It writes no
files except an optional JSON report you name yourself.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOBILE = os.path.join(REPO, "apps", "mobile")
PROVENANCE = os.path.join(MOBILE, "build", "release-gate", "provenance.json")

# The one upload identity. Any other certificate is a split identity, which
# Play and the Android OAuth client each reject in their own way.
CANONICAL_SHA1 = "CC:B4:CA:39:59:AC:87:D1:38:E8:26:80:1D:AF:54:67:84:69:FF:96"
CANONICAL_SHA256 = ("54:54:26:D0:68:26:8C:98:3F:D0:E6:E6:29:21:31:5A:CF:"
                    "B4:BD:AA:18:EE:38:E7:94:DA:41:DF:E7:8E:1A:39")

GOOD_CLIENT_ID = re.compile(r"^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$")

# route -> (server file holding the validator, Dart file holding the payload)
CONTRACTS = [
    ("POST /users/me/consent",
     "apps/api/src/routes/users.ts",
     "apps/mobile/lib/src/features/consent/consent_request.dart"),
]

results = []


def record(gate, name, ok, detail):
    results.append({"gate": gate, "check": name, "ok": bool(ok), "detail": detail})
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}")
    return ok


def sh(cmd, cwd=None, timeout=900):
    p = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str),
                       capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr


def android_tool(name):
    root = os.environ.get("ANDROID_HOME", os.path.expanduser("~/.local/android"))
    bt = os.path.join(root, "build-tools")
    if not os.path.isdir(bt):
        return None
    versions = sorted(os.listdir(bt))
    if not versions:
        return None
    path = os.path.join(bt, versions[-1], name)
    return path if os.path.isfile(path) else None


# ---------------------------------------------------------------- provenance
def gate_provenance(prov_path):
    print("\nPROVENANCE")
    if not os.path.isfile(prov_path):
        return record("provenance", "record exists", False,
                      f"no {os.path.relpath(prov_path, REPO)} — build with "
                      "scripts/build-release.sh, never `flutter build` directly")
    with open(prov_path) as f:
        prov = json.load(f)

    record("provenance", "record exists", True,
           f"built {prov.get('built_at', '?')} at {prov.get('git_commit', '?')[:12]}"
           f" ({prov.get('git_branch', '?')})")

    defines = prov.get("dart_defines", {})
    record("provenance", "FLAVOR define", defines.get("FLAVOR") == "prod",
           f"FLAVOR={defines.get('FLAVOR')!r} (must be 'prod'; absent = purple crash screen)")

    cid = defines.get("GOOGLE_SERVER_CLIENT_ID", "")
    record("provenance", "client id define", bool(GOOD_CLIENT_ID.match(cid or "")),
           f"GOOGLE_SERVER_CLIENT_ID={cid or '<missing>'}")

    forbidden = prov.get("forbidden_defines", [])
    present = [d for d in forbidden if d in defines and defines[d]]
    record("provenance", "no debug defines", not present,
           "none of " + ", ".join(forbidden) if not present
           else f"present and non-empty: {', '.join(present)}")

    if prov.get("git_dirty"):
        record("provenance", "clean tree", False,
               "artifact built from a worktree with modified tracked files — commit "
               "before shipping so the artifact maps to a commit")

    return prov


def artifact_hash_matches(prov, key):
    entry = (prov.get("artifacts") or {}).get(key)
    if not entry:
        return None, "not built in this run"
    path = os.path.join(REPO, entry["path"])
    if not os.path.isfile(path):
        return False, f"{entry['path']} no longer on disk"
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    same = h.hexdigest() == entry["sha256"]
    return same, (f"{entry['sha256'][:16]}… matches" if same
                  else f"on-disk {h.hexdigest()[:16]}… != recorded {entry['sha256'][:16]}…")


# ------------------------------------------------------------------ artifact
def gate_artifact(prov):
    print("\nARTIFACT")
    arts = (prov.get("artifacts") or {})
    apk = os.path.join(REPO, arts["apk"]["path"]) if "apk" in arts else None
    aab = os.path.join(REPO, arts["aab"]["path"]) if "aab" in arts else None

    if not apk and not aab:
        return record("artifact", "any artifact", False, "provenance lists none")

    for key, path in (("apk", apk), ("aab", aab)):
        if not path:
            continue
        same, detail = artifact_hash_matches(prov, key)
        record("artifact", f"{key} hash", same, detail)

    if apk and os.path.isfile(apk):
        aapt2 = android_tool("aapt2")
        badging = ""
        if aapt2:
            _, badging = sh([aapt2, "dump", "badging", apk])
        m = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
        if m:
            pkg, vcode, vname = m.group(1), int(m.group(2)), m.group(3)
            record("artifact", "package", pkg == "ai.okuvu.app",
                   f"{pkg} (prod must be exactly ai.okuvu.app; beta/dev carry a suffix)")
            record("artifact", "versionCode", vcode == int(prov.get("version_code", -1)),
                   f"{vcode} == pubspec {prov.get('version_code')}")
            record("artifact", "versionName", vname == prov.get("version_name"),
                   f"{vname} == pubspec {prov.get('version_name')}")
        else:
            record("artifact", "badging", False, "aapt2 produced no package line")

        m = re.search(r"sdkVersion:'(\d+)'", badging)
        t = re.search(r"targetSdkVersion:'(\d+)'", badging)
        if m:
            record("artifact", "minSdk", int(m.group(1)) >= 24, f"minSdk {m.group(1)}")
        if t:
            record("artifact", "targetSdk", int(t.group(1)) >= 35,
                   f"targetSdk {t.group(1)} (Play requires 35+)")

        signer = android_tool("apksigner")
        if signer:
            _, out = sh([signer, "verify", "--print-certs", apk])
            s1 = re.search(r"certificate SHA-1 digest: ([0-9a-f:]+)", out, re.I)
            s256 = re.search(r"certificate SHA-256 digest: ([0-9a-f:]+)", out, re.I)
            # apksigner prints digests without colons; the canonical constants are
            # colon-separated. Normalise before comparing or every build "fails".
            norm = lambda s: (s or "").replace(":", "").upper()
            got1 = (s1.group(1).upper() if s1 else "<none>")
            got256 = (s256.group(1).upper() if s256 else "<none>")
            record("artifact", "signer = upload key", norm(got1) == norm(CANONICAL_SHA1),
                   got1 if norm(got1) == norm(CANONICAL_SHA1)
                   else f"{got1} != canonical {CANONICAL_SHA1}")
            record("artifact", "signer SHA-256", norm(got256) == norm(CANONICAL_SHA256),
                   got256[:29] + "…")
        else:
            record("artifact", "signer", False, "apksigner not found")

        # Compiled defines: the only evidence a dart-define reached the AOT build.
        cid = prov.get("dart_defines", {}).get("GOOGLE_SERVER_CLIENT_ID", "")
        try:
            with zipfile.ZipFile(apk) as z:
                libs = [n for n in z.namelist() if n.endswith("libapp.so")]
                found = {n: cid.encode() in z.read(n) for n in libs}
        except Exception as e:  # noqa: BLE001
            record("artifact", "compiled client id", False, f"cannot read APK: {e}")
        else:
            ok = bool(found) and all(found.values())
            record("artifact", "compiled client id", ok,
                   f"present in {sum(found.values())}/{len(found)} ABIs")

            # Provenance says which defines were passed; only the binary proves
            # it. `--record-only` can write a record without rebuilding, so the
            # diagnostic copy must be shown absent from the artifact itself.
            try:
                with zipfile.ZipFile(apk) as z:
                    names = [n for n in z.namelist() if n.endswith("libapp.so")]
                    diag_lits = [b"DIAG  clientId=", b"DIAG clientId="]
                    leaked = {n: any(l in z.read(n) for l in diag_lits) for n in names}
            except Exception as e:  # noqa: BLE001
                record("artifact", "no diag copy", False, f"cannot read APK: {e}")
            else:
                clean = bool(leaked) and not any(leaked.values())
                record("artifact", "no diag copy", clean,
                       "diagnostic strings absent from all ABIs"
                       if clean else f"diagnostic copy present in {sum(leaked.values())} ABI(s)")

    if aab and os.path.isfile(aab):
        _, out = sh(["keytool", "-printcert", "-jarfile", aab],
                    timeout=120) if _have("keytool") else (1, "")
        m = re.search(r"SHA1: ([0-9A-F:]+)", out)
        if m:
            record("artifact", "aab signer", m.group(1) == CANONICAL_SHA1.upper(),
                   m.group(1) if m.group(1) == CANONICAL_SHA1.upper()
                   else f"{m.group(1)} != canonical")
        else:
            record("artifact", "aab signer", False, "keytool produced no certificate")
    return apk, aab


def _have(binary):
    return subprocess.run(["which", binary], capture_output=True).returncode == 0


# ----------------------------------------------------------------- freshness
def gate_freshness(aab, apk):
    print("\nFRESHNESS")
    for label, path in (("apk", apk), ("aab", aab)):
        if not path or not os.path.isfile(path):
            continue
        rc, out = sh(["git", "-C", REPO, "log", "-1", "--format=%ct", "--", "apps/mobile/lib"])
        if rc != 0:
            record("freshness", f"{label} newer than lib/", False, "git log failed")
            continue
        last_lib_change = int(out.strip() or 0)
        mtime = int(os.path.getmtime(path))
        ok = mtime >= last_lib_change
        delta = (mtime - last_lib_change) // 60
        record("freshness", f"{label} newer than lib/", ok,
               f"built {abs(delta)} min "
               f"{'after' if ok else 'BEFORE'} the last change under apps/mobile/lib")


# -------------------------------------------------------------------- source
def gate_source():
    print("\nSOURCE")
    env = dict(os.environ)
    env["PATH"] = os.path.expanduser("~/.local/flutter-sdk/bin") + ":" + env.get("PATH", "")
    env.setdefault("JAVA_HOME", os.path.expanduser("~/.local/jdk-17"))
    env.setdefault("ANDROID_HOME", os.path.expanduser("~/.local/android"))
    env.setdefault("ANDROID_SDK_ROOT", env["ANDROID_HOME"])

    p = subprocess.run(["flutter", "analyze"], cwd=MOBILE, env=env,
                       capture_output=True, text=True, timeout=900)
    out = p.stdout + p.stderr
    clean = "No issues found" in out and p.returncode == 0
    record("source", "flutter analyze", clean,
           "No issues found!" if clean else out.strip().splitlines()[-1][:160])

    start = time.time()
    p = subprocess.run(["flutter", "test"], cwd=MOBILE, env=env,
                       capture_output=True, text=True, timeout=1800)
    out = p.stdout + p.stderr
    m = re.search(r"All tests passed!?|(\d+) tests? passed", out)
    passed = p.returncode == 0 and bool(m)
    count = re.search(r"\+(\d+)", out[-4000:])
    record("source", "flutter test", passed,
           f"{count.group(1)} tests passed in {int(time.time() - start)}s"
           if passed else out.strip().splitlines()[-1][:200])


# ------------------------------------------------------------------ contract
def gate_contract():
    print("\nCONTRACT")
    for route, server_rel, dart_rel in CONTRACTS:
        server = os.path.join(REPO, server_rel)
        dart = os.path.join(REPO, dart_rel)
        if not (os.path.isfile(server) and os.path.isfile(dart)):
            record("contract", route, False, "source file missing")
            continue
        s = open(server).read()
        d = open(dart).read()

        # Scope to this route's handler. Users.ts holds many routes; reading
        # `body.X` across the whole file picks up every neighbour's fields and
        # reports a payload "missing" things the route never asked for.
        path = route.split(" ", 1)[1]
        start = s.find(f"'{path}'")
        if start == -1:
            record("contract", route, False, f"route literal '{path}' not found in {server_rel}")
            continue
        nxt = re.search(r"\n\s*app\.(post|get|put|patch|delete)<?", s[start + 1:])
        block = s[start:start + 1 + nxt.start()] if nxt else s[start:]

        # Fields the validator actually reads off the body.
        required = set(re.findall(r"body\.([a-z_]{3,})", block))
        # Fields the Dart payload actually sends.
        sent = set()
        for jblock in re.findall(r"toJson\(\)\s*=>\s*\{(.*?)\}", d, re.S):
            sent |= set(re.findall(r"'([a-z_]{3,})'\s*:", jblock))
        missing = sorted(required - sent)
        extra = sorted(sent - required)
        record("contract", f"{route} payload", not missing,
               f"sends all {len(required)} required fields"
               if not missing else f"missing {missing} — server returns 400")
        if extra:
            record("contract", f"{route} extra fields", True,
                   f"client also sends {extra} (tolerated, but check they are intended)")

        # A nullable/defaulted payload field cannot be required by the server.
        optional = [f for f in required
                    if re.search(rf"final bool\? {f}", d) or
                    re.search(rf"this\.{f}\s*=\s*(true|false)", d)]
        record("contract", f"{route} fields required", not optional,
               "all payload fields are `required`"
               if not optional else f"defaulted/optional: {optional} — a caller can omit them")


# ---------------------------------------------------------------------- live
def gate_live(base):
    print(f"\nLIVE  ({base})")

    def call(method, path, body=None, timeout=15):
        req = urllib.request.Request(base.rstrip("/") + path, method=method)
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            req.add_header("content-type", "application/json")
        try:
            with urllib.request.urlopen(req, data, timeout=timeout) as r:
                return r.status, r.read().decode(errors="replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode(errors="replace")
        except Exception as e:  # noqa: BLE001
            return 0, str(e)

    code, body = call("GET", "/health")
    ok = code == 200 and '"status":"ok"' in body.replace(" ", "")
    commit = ""
    try:
        commit = json.loads(body).get("commit", "")
    except Exception:  # noqa: BLE001
        pass
    record("live", "/health", ok, f"{code} commit {commit[:12] or '?'}" if ok else f"{code} {body[:120]}")

    # The sign-in endpoint must reject junk rather than 404: a 404 here means
    # the Google-auth commit was never deployed and the app cannot log in.
    code, body = call("POST", "/auth/google", {})
    record("live", "/auth/google exists", code == 400,
           f"{code} (400 = route deployed and validating)" if code == 400
           else f"{code} {body[:120]} — route missing or misconfigured")

    code, body = call("POST", "/auth/google", {"id_token": "not-a-jwt"})
    rec = ""
    try:
        rec = json.loads(body).get("error", {}).get("code", "")
    except Exception:  # noqa: BLE001
        pass
    record("live", "/auth/google verifier", code == 401,
           f"{code} {rec} (401 = verifier running with a client id)")

    for path in ("/users/me/today", "/users/me/consent"):
        code, _ = call("POST" if "consent" in path else "GET", path, {})
        record("live", f"{path} requires auth", code == 401, f"{code}")


# ---------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="https://api.okuvu.in")
    ap.add_argument("--skip-source", action="store_true")
    ap.add_argument("--skip-live", action="store_true")
    ap.add_argument("--provenance", default=PROVENANCE)
    ap.add_argument("--json", metavar="PATH")
    args = ap.parse_args()

    print(f"Okuvu release gate — {REPO}")
    prov = gate_provenance(args.provenance)
    apk = aab = None
    if prov:
        apk, aab = gate_artifact(prov)
        gate_freshness(aab, apk)
    if not args.skip_source:
        gate_source()
    gate_contract()
    if not args.skip_live:
        gate_live(args.api)

    failed = [r for r in results if not r["ok"]]
    print("\n" + "=" * 62)
    if failed:
        print(f"BLOCKED — {len(failed)} of {len(results)} checks failed:")
        for r in failed:
            print(f"  {r['gate']}.{r['check']}: {r['detail']}")
    else:
        print(f"RELEASE OK — all {len(results)} checks passed")
    print("=" * 62)

    if args.json:
        with open(args.json, "w") as f:
            json.dump({"ok": not failed, "results": results}, f, indent=2)
        print(f"report -> {args.json}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
