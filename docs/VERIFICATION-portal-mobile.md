# Verification: therapist portal and mobile app

Executed 2026-10-27 on the build host, against `feat/agents-15` @ `4a9a7b3`
plus a clean `develop` @ `298d261`. Every number below is from a command run
in this session, not from a document.

## Therapist portal — `apps/therapist-portal`

| Check | Result |
|---|---|
| Files (excl. node_modules/.next) | 81 |
| Test files | 9 |
| `pnpm vitest run` | **86 passed, 0 failed** (3.09 s) |
| `next build` | **succeeds**, 16 routes prerendered/compiled |
| `tsc --noEmit` | clean |

Routes built: `/`, `/admin`, `/auth`, `/dashboard`, `/schedule`,
`/clients/[id]` + `homework`, `notes`, `program`, `reminders`, `report`,
`tools`, `/api/auth/[...nextauth]`, `/api/trpc/[trpc]`.

Test coverage of note: authorization.test.ts (35 tests), admin.test.ts (20),
auth.test.ts (3 — Google account alone is never sufficient), appointments,
homework, reminders, clients-chat-access, production-bypass.

Requires `DATABASE_URL`, NextAuth secret + Google OAuth client,
Firebase web config + admin SDK, `ADMIN_EMAILS`, Brevo key. See
`apps/therapist-portal/.env.example`. Deploy config present: `vercel.json`,
`firebase.json`.

**Verdict: deployable today** once the seven env values exist.

## Mobile app — `apps/mobile`

Not an "Android app" — Flutter (Dart), one codebase building Android and iOS.
The Android part is a thin shell: `MainActivity.kt`, Gradle, three flavours
(dev/beta/prod) with applicationId suffixes, `ai.okuvu.app`.

| Check | Result |
|---|---|
| Files (excl. build/.dart_tool) | 229 |
| Dart in `lib/` | 12,434 lines, 84 files |
| Dart in `test/` + `integration_test/` | 5,899 lines, 39 test files + 3 patrol e2e |
| `flutter test` | **209 passed, 2 failed** |
| `flutter analyze` | clean (1 info: `avoid_print` in a test file) |
| `flutter build apk --debug --flavor dev` | **FAILED** — see below |

Toolchain required Flutter **3.47.8** (Dart 3.13.7). Flutter 3.35.3 fails
dependency resolution: `share_plus >=13` needs Dart >=3.10.

### The two failing tests are a real defect, not flakiness

`test/config/app_config_test.dart` asserts beta/prod point at
`https://evia-500215-xxxxx-uc.a.run.app`. The code actually points at
`https://backend-971397352159.asia-south1.run.app`. Someone changed the
production backend URL and did not update the test. The test is the
documentation of intent; right now the app ships pointing at a host that
**returns 404 on every path tested** (`/health`, `/v1/health`, `/api/health`,
`/ws`). Whatever that service was, it is not serving this API today.

### Android build blockers

1. `permission_handler_android` requires `compileSdk 37`; the app resolves
   `flutter.compileSdkVersion` (36). Gradle looks for platform hash
   `android-37`, which the SDK never ships — Android 37 is only published as
   `platforms;android-37.0` / `37.1`. Worked around locally with
   `ln -s platforms/android-37.0 platforms/android-37`. Permanent fix:
   `compileSdk = 37` in `android/app/build.gradle`.
2. `google-services.json` is missing. The plugin searches six locations and
   fails. The repo ships only `google-services.json.example`, whose own
   comment says *"Get the real file from the Senior Engineer."* It is
   gitignored and cannot be reconstructed — it is per Firebase project
   (`ai.okuvu.app`, project `evia-500215`).
3. `keystore.properties` / `upload-keystore.jks` absent — release signing
   cannot be produced on this host at all.

## Backend — `apps/api`, `apps/worker`

169 TypeScript files, 54 test files, **615 tests passing**, `tsc` clean.
37 Prisma models, 42 migrations. Entry point refuses to start in production
if `LOCAL_DEV_BYPASS_AUTH` or `LOAD_TEST_MODE` is set.

## Hosting: the stack is GCP, not AWS

| Signal | Count |
|---|---|
| AWS references in code/config | **0** |
| GCP/Firebase/Vertex references | **1,269** |

`cloudbuild.yaml` builds to Artifact Registry and runs `prisma migrate deploy`
through Cloud SQL Proxy against `evia-500215:asia-south1:evia-db`.
`.env.example` names Cloud SQL, Vertex AI (`asia-south1`), Cloud KMS,
Cloud Tasks, Memorystore, Secret Manager, Firebase Auth and FCM.
`README.md` constraint 5: *"All user data stays in asia-south1 (Mumbai) —
single GCP DPA covers compute, DB, storage, auth, and LLM inference."*

Moving to AWS is not "configuring the cloud". It means replacing Firebase Auth,
Vertex AI in Mumbai (Bedrock is not available in India regions), Cloud KMS,
Cloud Tasks, Cloud SQL and the India-residency DPA — a rewrite of the identity
and deployment layer, and a regression on the DPDP position.

## What actually gates deployment

External inputs, none of which are in the repo:

1. `google-services.json` (Firebase, project `evia-500215`) — blocks APK build.
2. Release keystore + passwords — blocks signed AAB.
3. GCP IAM access to `evia-500215` (no credentials on this host).
4. `OPENROUTER_API_KEY` or Vertex AI service account — blocks every agent call.
5. `SARVAM_API_KEY` — blocks TTS.
6. Brevo API key — blocks invite emails.
7. NextAuth secret + Google OAuth client — blocks portal login.
8. Cloud SQL reachable/credentials — blocks API start (it hard-fails on
   `prisma.$connect()`).

Internal gates:

- The 15 agents are on `feat/agents-15`, **not merged** to `develop`. `main`
  auto-deploys to staging, so nothing deploys until the merge happens.
- Two red mobile tests.
- Hardcoded helpline numbers in `crisis_overlay.dart:38-58` and
  `age_blocked_screen.dart:62-68`, unsigned by clinical authority.
