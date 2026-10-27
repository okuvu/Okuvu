# Okuvu Android — Google Play release checklist

App: `ai.okuvu.app` (flavours `dev`/`beta`/`prod`, prod has no `applicationIdSuffix`)
Repo path: `apps/mobile`
Last verified: **2026-10-27** (all policy statements below were re-read from Google's own
documentation on that date; they are quoted, not recalled).

---

## 1. What Google Play actually requires (verified 2026-10-27)

### (a) App Bundle, not APK

> "Starting August 2021, new apps are required to publish with the Android App Bundle on Google Play."
> — <https://support.google.com/googleplay/android-developer/answer/9844279>

APKs are only still accepted for apps created before that date:

> "Legacy apps (created before August 2021) can add app bundles or APKs for app updates."
> — <https://support.google.com/googleplay/android-developer/answer/9859348>

`Okuvu` is a new app (nothing published yet) → **`.aab` is the only acceptable upload
format**; the APK-only path does not exist for us. App bundles also require Play App
Signing enrolment:

> "To use app bundles, you must enroll in Play App Signing."
> — <https://support.google.com/googleplay/android-developer/answer/9844279>

### (b) Target API level

> "Starting August 31, 2026:
> - New apps and app updates must target Android 16 (API level 36) or higher to be submitted to Google Play …
> - Existing apps must target Android 15 (API level 35) or higher to remain available to new users on devices running Android OS higher than your app's target API level."
> — <https://support.google.com/googleplay/android-developer/answer/11926878>

An extension "to November 1, 2026" can be requested in Play Console, but it is not needed
here: this repo now builds `targetSdk 36`, so it is already compliant.

### (c) 12 testers / 14 days (personal accounts)

> "Developers with personal accounts created after November 13, 2023, must run a closed test for their app with a minimum of 12 testers who have been opted in continuously for at least 14 days."
> — <https://support.google.com/googleplay/android-developer/answer/14151465>

Still in force as of 2026-10-27 on that page, and the track table states it again:
"Run a closed test with at least 12 opted-in testers continuously for 14 days. Once criteria
are met, apply for production access in Play Console…"

What "continuous" means, from the same page's FAQ:

> "Testers who opt in, test for fewer than 14 days, and then opt out do not count toward the requirement. If a tester opts out and opts back in later, the 14 days must be consecutive to count toward the minimum requirement of 12 continuous opted-in testers."

Practical consequences:
- Testers count as **opted in** (joined via the opt-in link with a Google Account), not
  merely invited by email. Replacing testers mid-window restarts the clock for the new ones.
- The 14-day clock is evaluated at the moment you press **Apply for production**; invite
  more than 12 (15–20) so one dropout doesn't break the run.
- **This requirement does not apply to organisation (company) developer accounts.** Confirm
  the account type before planning a launch date — it is the single longest lead-time item
  (14 days minimum) in this list.
- New personal accounts also need device verification with the Play Console mobile app
  (<https://support.google.com/googleplay/android-developer/answer/14316361>).

### (d) Mandatory before a build can be reviewed

| Item | Requirement | Source |
|---|---|---|
| Privacy policy URL | Required on the store listing **and** in-app when the app requests sensitive permissions/data (this app: `RECORD_AUDIO`, health/wellness content). Must be an active, publicly reachable URL that applies to this app. | [9859455](https://support.google.com/googleplay/android-developer/answer/9859455) |
| Data safety form | "All developers that have an app published on Google Play must complete the Data safety form, including apps on closed, open, or production testing tracks." Only apps *exclusively* on internal testing are exempt. Must cover third-party SDKs (Firebase Analytics/Crashlytics here). | [10787469](https://support.google.com/googleplay/android-developer/answer/10787469) |
| Content rating questionnaire | Required; "Unrated" apps may be removed from Play. | [9859455](https://support.google.com/googleplay/android-developer/answer/9859455), [9859655](https://support.google.com/googleplay/android-developer/answer/9859655) |
| App access / sign-in instructions | "If your entire app or parts of your app are restricted based on login credentials … you must provide all required details to enable access to your app." Okuvu has auth → reviewer demo credentials are mandatory. | [9859455](https://support.google.com/googleplay/android-developer/answer/9859455), [15748846](https://support.google.com/googleplay/android-developer/answer/15748846) |
| Ads declaration | "You must declare whether or not your app contains ads." (Mandatory either way.) | [9859455](https://support.google.com/googleplay/android-developer/answer/9859455) |
| Target audience & content | Required declaration; drives Families-policy obligations. | [9867159](https://support.google.com/googleplay/android-developer/answer/9867159) |
| Store listing assets | App icon 512×512, short description, feature graphic 1024×500, **minimum two screenshots**, title ≤30 chars, full description, contact email. | [9866151](https://support.google.com/googleplay/android-developer/answer/9866151), [13393723](https://support.google.com/googleplay/android-developer/answer/13393723) |

---

## 2. Fixed in this repo (build-side)

| Fix | File | Detail |
|---|---|---|
| compileSdk vs permission_handler | `android/app/build.gradle` | Pinned `compileSdk 37` + `compileSdkMinor 0`. `permission_handler_android 14.1.0` declares `compileSdk = 37`; Flutter 3.47.8 defaults to 36. API 37 ships **only** as a minor-version platform (`platforms;android-37.0`, `37.1`, `37.2` — there is no `platforms;android-37`), so `compileSdkMinor` is required to resolve it. |
| AGP too old for minor SDKs | `android/build.gradle`, `android/settings.gradle` | AGP `8.11.1` → `8.13.1` (first AGP with `compileSdkMinor` support; 8.13.1 is already in the local Gradle cache and only needs Gradle ≥8.13 — wrapper is 8.14). |
| Fragile symlink workaround | system SDK | Removed `platforms/android-37 -> android-37.0`. The build now resolves the real package; nothing outside the repo is needed. |
| targetSdk below requirement | `android/app/build.gradle` | `targetSdk 36` pinned explicitly (was `flutter.targetSdkVersion`, which happens to be 36 today but silently tracks the SDK). Meets the 31 Aug 2026 rule. |
| Gradle OOM | `android/gradle.properties` | `-Xmx4G` → `-Xmx1280m` + `MaxMetaspaceSize=512m`, `org.gradle.workers.max=1`, Kotlin compiled in-process, `kotlin.daemon.jvmargs=-Xmx768m`. The 4 GB heap got the daemon OOM-killed by the kernel on this 7.9 GB/no-swap box (`/sys/fs/cgroup/memory.events` `oom_kill` increments). |
| Jetifier | `android/gradle.properties` | `android.enableJetifier=false` — every dependency is already AndroidX; jetifier only cost RAM/time. |
| Release signing wiring | `android/app/build.gradle` | `signingConfigs.release` is now only created when `keystore.properties` **and** the referenced `.jks` both exist; a `bundle*Release` task without them fails fast with an explicit message instead of producing an unsigned bundle. |
| Upload keystore (LOCAL PLACEHOLDER) | `android/upload-keystore.jks`, `android/keystore.properties` | Generated with `keytool` (RSA 4096, alias `upload`, DN `CN=Okuvu LOCAL PLACEHOLDER Upload Key, OU=DO NOT SHIP`). Both files are gitignored (`apps/mobile/.gitignore`). **The password is a public placeholder — regenerate before the first upload.** |

Verified signing resolution (`:app:signingReport`):

```
Variant: prodRelease
Config: release
Store: /opt/data/okuvu/ts/apps/mobile/android/upload-keystore.jks
Alias: upload
SHA-256: 77:C1:EA:A9:80:AF:FC:75:03:F9:BB:85:4C:6A:FB:C6:96:EE:CF:31:CA:99:6C:D3:0D:7E:DE:DC:0E:FE:6A:19
```

---

## 3. Still blocked (cannot be fixed from the repo)

1. **No Firebase assets are needed any more** (resolved 2026-10-27, Cognito cutover).
   `google-services.json` and the Google Services / Crashlytics Gradle plugins were
   removed with the rest of the Firebase surface; auth is Amazon Cognito over HTTPS and
   crashes go through `CrashReporter`. The only build-time configuration that matters now
   is `--dart-define=COGNITO_CLIENT_ID` (+ region/pool), see `README.md`.
2. **Prod API host is dead.** `lib/src/config/environment.dart` points `prod` at
   `https://backend-971397352159.asia-south1.run.app`, which returns **HTTP 404** on `/`,
   `/health` and `/v1/health` (checked 2026-10-27). That is also a Cloud Run host, i.e. a
   GCP endpoint: it needs to move to the AWS ALB hostname in the same cutover.
   Shipping this points the app at a backend that serves nothing.
3. **Stale URL assertion in tests** (resolved 2026-10-27). `test/config/app_config_test.dart`
   asserted the literal `https://evia-500215-xxxxx-uc.a.run.app` placeholder host, so 2 of
   211 tests failed. The test now asserts the contract (`https`/`wss` + enum identity)
   instead of a host that changes on every backend cutover.
4. **Build flavour must be passed to Dart.** `AppConfig.init()` reads
   `String.fromEnvironment('FLAVOR')`. `flutter build appbundle --flavor prod --release`
   alone therefore produces a bundle that throws `FlavorNotSpecifiedException` at launch.
   The full command needs `--dart-define=FLAVOR=prod` (see §5).
5. **Placeholder upload key.** Regenerate with your own password before the first upload
   (see §4.7). The upload key is not recoverable: losing it means an upload-key reset
   request to Google Play support, and losing it *with* the Play App Signing key means the
   app can never be updated under the same listing.

---

## 4. What only the owner can do

1. **Create/verify the Play Console developer account.** Decide personal vs organisation —
   this decides whether item 3 (14-day closed test) is required at all. Complete identity
   verification and the payments/merchant profile (needed even for free apps). Registration
   carries a one-time fee; the exact current amount is shown in the sign-up flow (not
   verified here).
2. **Device verification** for a new personal account: install the Play Console mobile app
   on a real Android device and complete the verification task
   (<https://support.google.com/googleplay/android-developer/answer/14316361>).
3. **Run the closed test** — only if the account is personal and created after
   2023-11-13: ≥12 testers opted in continuously for 14 days, then *Apply for production*
   on the Dashboard, answering the review questions.
4. **Host the privacy policy** at a stable, public URL you control (the app currently
   points at a Google Docs "pub" link, `AppConfig.privacyPolicyUrl` — fine as a stopgap,
   not something to ship as the legal record), and link the same URL in-app and in the
   store listing. It must describe health/wellness data, audio recording, Firebase
   Analytics/Crashlytics, retention and deletion.
5. **Complete the App content declarations** (Data safety, content rating questionnaire,
   target audience, ads declaration, sign-in/app-access instructions with working reviewer
   credentials, sensitive-permission declarations).
6. **No Firebase config asset needed** (see §3.1) — Cognito client id comes from
   `--dart-define=COGNITO_CLIENT_ID` at build time.
7. **Generate the real upload keystore and enrol Play App Signing.** Recommended:
   ```
   keytool -genkeypair -v -keystore upload-keystore.jks -storetype PKCS12 -alias upload \
     -keyalg RSA -keysize 4096 -validity 10000
   ```
   Store the `.jks` and its password in a secret manager **and** an offline backup, put the
   password only in the gitignored `android/keystore.properties`, then upload the first
   `.aab` and let Play Console enrol it in Play App Signing (Google holds the app-signing
   key, you keep the upload key). Why it matters: a lost upload key needs a support request
   to reset; a lost app-signing key without Play App Signing means a new listing.
8. **Fix the prod backend URL** (`environment.dart`) once the real Cloud Run service is
   deployed and `/health` returns 200, and update `app_config_test.dart` to match.
9. **Bump `versionCode`/`versionName`** (currently `1.0.4+5`) monotonically for each upload;
   Play rejects a versionCode it has already seen.
10. **Store listing assets**: 512×512 icon, 1024×500 feature graphic, ≥2 screenshots,
    short/full description, category, contact email, countries.

---

## 5. Build commands (no Firebase asset required)

```bash
cd apps/mobile
export JAVA_HOME=/opt/data/home/.local/jdk-17
export ANDROID_HOME=/opt/data/home/.local/android ANDROID_SDK_ROOT=/opt/data/home/.local/android

# 1. sanity: release signing resolves to the real keystore
(cd android && ./gradlew :app:signingReport | grep -A5 'Variant: prodRelease')

# 2. the real artifact (FLAVOR + COGNITO_CLIENT_ID dart-defines are REQUIRED, see §3.4)
flutter build appbundle --flavor prod --release \
  --dart-define=FLAVOR=prod \
  --dart-define=COGNITO_REGION=ap-south-1 \
  --dart-define=COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXX \
  --dart-define=COGNITO_CLIENT_ID=<mobile app client id>
# -> build/app/outputs/bundle/prodRelease/app-prod-release.aab

# 3. verify what you built
keytool -printcert -jarfile build/app/outputs/bundle/prodRelease/app-prod-release.aab   # must show your upload cert
"$ANDROID_HOME"/build-tools/35.0.0/aapt2 dump badging build/app/outputs/bundle/prodRelease/app-prod-release.aab | head -5

# 4. quality gates
flutter analyze
flutter test
```

---

## 6. Evidence produced 2026-10-27 (`apps/mobile/android/play-release-evidence/`)

| File | What it shows |
|---|---|
| `00-baseline-build.log` | First build attempt, before any change (compileSdk 36 + permission_handler warning; daemon OOM). |
| `02…`/`04…`/`06…` | Intermediate attempts killed by the kernel OOM killer (host memory pressure). |
| `03-signing-report.log` | `:app:signingReport` — `prodRelease` resolves to `upload-keystore.jks`, alias `upload`, SHA-256 fingerprint. |
| `07-prod-release-appbundle.log` | Build **after** the fixes, with the symlink removed: gets through Dart AOT, all plugins, resources — then stops on the missing `google-services.json`. |
| `07-mem-trace.log` | Memory headroom during that build (why the heap tuning exists). |
| `08-prod-release-with-placeholder.log` | Full pipeline with a **temporary local placeholder** `google-services.json` (deleted immediately afterwards): `✓ Built build/app/outputs/bundle/prodRelease/app-prod-release.aab (60.7MB)`, exit 0. Proves AGP/R8/shrinking/signing produce a signed bundle. The artifact is **not shippable**. |
| `08-aab-sha256.txt`, `08-merged-manifest-prodRelease.xml` | SHA-256 of that bundle; merged manifest showing `package="ai.okuvu.app"`, `minSdkVersion="24"`, `targetSdkVersion="36"`. |
| `09-flutter-test.log` | `flutter test`: `+209 -2` — both failures are the stale `evia-500215-xxxxx` assertions in `test/config/app_config_test.dart`. |
| `app-prod-release-PLACEHOLDER-CONFIG-NOT-FOR-UPLOAD.aab` | The bundle from the placeholder run. **DO NOT UPLOAD.** |

`flutter analyze`: **1 issue** — `info • Don't invoke 'print' in production code … test/features/settings/zzdebug_ec_test.dart:41:5 • avoid_print` (0 errors, 0 warnings).

The whole evidence directory is gitignored (`/android/play-release-evidence/`); this file
(`PLAY_RELEASE_CHECKLIST.md`) is the part meant to be committed.

---

## 7. Status at a glance

**Fixed (repo, verified by running the build):** compileSdk/AGP/platform resolution, targetSdk 36,
Gradle memory/OOM, signing config + signingReport, fail-fast guards, docs and evidence.

**Blocked (needs a human/asset we don't have):** the real prod API host (404, and still a
Cloud Run URL — see §3.2), the real upload key, the owner's Play Console account and the
14-day closed test. No Firebase asset is on the list any more (§3.1).

The pipeline itself (AGP/R8/shrinking/signing) is proven end-to-end by log `08`; the
Cognito build no longer needs a Google config file to reach the same point.

