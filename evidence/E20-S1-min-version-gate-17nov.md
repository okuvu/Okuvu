# E20-S1 — minimum-version gate and in-app update (1.0.21+22)

**Shipped:** 17 Nov 2026 · commit `fe9a595bd48b51fcca223c8c602a7760fe5b994a`
**Branch:** `release/mobile-1.0.21` · **Rollout:** api:84 worker:82 portal:84

## Why

Android has no force-update switch and Play reviews on Google's clock, so a
build carrying a fix can sit on a handset for days after the server has moved
on. The launch build (1.0.13 / versionCode 14) was still what a fresh install
received on 16 Nov, with `develop` three releases ahead of it — that gap is the
defect this closes.

## What shipped

**Server — `GET /app/version`** (`apps/api/src/routes/app-version.ts`)

Public, no `verifyCognitoJWT`: the first launch after an install calls it before
any token exists, and a 401 there would read to the client as "Okuvu is broken".
Returns the floor (`minimumSupportedVersionCode`), the newest build
(`latestVersionCode`, `latestVersionName`) and the store URL.

Both numbers are read from the environment **per request**, so raising the floor
is a rolling restart, not an app release:

| var | shipped default |
|---|---|
| `OKUVU_MIN_VERSION_CODE` | 14 (the launch build — nothing below it ever shipped) |
| `OKUVU_LATEST_VERSION_CODE` | 22 |
| `OKUVU_LATEST_VERSION_NAME` | 1.0.21 |
| `OKUVU_STORE_URL` | Play listing for `ai.okuvu.app` |

Two guards, both tested: a malformed value falls back to the shipped default
rather than locking the fleet out, and a floor above the newest build is clamped
— otherwise a typo would block the build that had just shipped.

**App — `AppUpdateGate`** (`apps/mobile/lib/src/core/app_update/`)

- Below the floor: full-screen block, one button, **no dismiss control**. The
  point is that a build carrying a fix cannot be sat on.
- Below the newest build: an offer, once per release. The dismissal is stored in
  SharedPreferences keyed on `latestVersionCode`, so it does not nag on every
  launch but does return for the next release.
- The button calls Play's in-app update (`in_app_update`), which downloads over
  whatever connection the phone has — **mobile data included** — and falls back
  to the store page when Play services cannot update in place, so a sideloaded
  build is not a dead end.
- **Fails open.** If the policy read or the installed-build read fails, the app
  renders normally. A config endpoint that is down must never lock a client out
  of their own companion; the safety copy that matters is server-served and
  reaches every build regardless.
- Placed *inside* the `Stack` in `app.dart`, so the crisis overlay and the
  care-ended notice still render above it — a client mid-emergency is never
  replaced by an update screen.

**Version label.** Settings and About printed a hardcoded `Version 1.0.0`, which
no build ever matched. Both now read `PackageInfo`: `Version 1.0.21 (22)`.

## Evidence

Gate (`scripts/verify-mobile-release.py`): **RELEASE OK — all 26 checks passed.**

- artifact hash `e28a4ac7…` matches provenance; versionCode 22, versionName
  1.0.21, package `ai.okuvu.app`, targetSdk 36
- signer `CC:…:96` (upload key); compiled client id present in 3/3 ABIs
- `flutter analyze` clean; `flutter test` 430 passed
- POST_BUILD: `release-gates: recorded ecr-image-scan (6/6 gates)`,
  `DEPLOY_DECISION=deploy`, `OK api:84 / worker:82 / portal:84`, no rollback

Live after the rollout:

```
GET https://api.okuvu.in/app/version
{"minimumSupportedVersionCode":14,"latestVersionCode":22,
 "latestVersionName":"1.0.21","storeUrl":"…ai.okuvu.app"}
GET https://api.okuvu.in/app/versionX   -> 404   (negative control)
GET https://api.okuvu.in/health         -> commit fe9a595bd48b
```

Play (`play-upload-bundle.py`, `play-production-release.py`):

- upload 200, Google's sha256 `e28a4ac7…` **identical** to the local file
- bundles on app: `[14, 21, 22]`
- production: `name=1.0.21 vc=['22'] status=completed`, committed 200

Api tests: `apps/api/src/__tests__/app-version.test.ts` — 5 pass (no-session
answer, shipped defaults, env override, floor clamp, malformed fallback).

App tests: `apps/mobile/test/core/app_update_gate_test.dart` — 8 tests (block,
at-floor, offer, accept, dismiss, dismiss persisted, store failure, fail-open).

## Limit of the proof

Every phone still on 1.0.13 lacks this code, so the gate protects releases from
1.0.21 onward and nothing before it. `OKUVU_MIN_VERSION_CODE` remains 14 — inert
until deliberately raised; the natural moment is once the notification build is
out, when older builds genuinely must move.

No device here has installed 1.0.21. The artifact is correct and the API agrees;
the on-device pass is the owner's.
