# evia → okuvu Migration — ClickUp Stories

**Sprint:** Migration: evia → okuvu Rebrand
**Epic:** E99 — Rebrand evia to okuvu

---

## Story M1 — Google Play Console & Firebase Project Setup

| Field | Value |
|---|---|
| **Story ID** | M1 |
| **Story name** | Set up Play Console listing, Firebase project rename, and GitHub org rename |
| **Priority** | Urgent (1) |
| **Status** | To Do |
| **Estimate** | 1 day |
| **Depends on** | None |
| **Blocks** | M2, M3, M4 |

### Description

Set up the Play Console listing and Firebase foundation. The underlying GCP project (`evia-500215`) stays unchanged — only brand-facing registration changes.

### Tasks / Checklist

- [ ] Create new app listing in Google Play Console with package name `ai.okuvu.app`
- [ ] Rename Firebase project display name from "evia" to "okuvu" (project ID `evia-500215` stays)
- [ ] Register Android app `ai.okuvu.app` in Firebase project
- [ ] Register Android app `ai.okuvu.app.dev` (dev flavor) in Firebase project
- [ ] Register Android app `ai.okuvu.app.beta` (beta flavor) in Firebase project
- [ ] Register iOS app `ai.okuvu.app` in Firebase project
- [ ] Register iOS app `ai.okuvu.app.dev` (dev flavor) in Firebase project
- [ ] Register iOS app `ai.okuvu.app.beta` (beta flavor) in Firebase project
- [ ] Download fresh `google-services.json` for all 3 Android flavors
- [ ] Download fresh `GoogleService-Info.plist` for all 3 iOS flavors
- [ ] Verify new Firebase API keys / OAuth clients work for new package names
- [ ] Rename GitHub org from `EviaAI` to `OkuvuAI`
- [ ] Rename GitHub repo from `evia` to `okuvu`
- [ ] Update local git remote: `git remote set-url origin https://github.com/OkuvuAI/okuvu.git`

### Acceptance Criteria

- [ ] Play Console has active listing for `ai.okuvu.app`
- [ ] Firebase project has all 6 app registrations (3 Android + 3 iOS)
- [ ] Firebase config files downloaded and ready for downstream stories
- [ ] GitHub org/repo renamed, local remotes updated
- [ ] `git fetch` and `git pull` work from new URL

### AI Coding Notes

> **Common mistake:** Google Play does not allow changing applicationId. M1 is the critical path — every other story depends on it. Start this first.
>
> **Common mistake:** Firebase project ID (`evia-500215`) is globally unique and permanent. Only the display name changes. All API calls and SDK configs that use the project ID will continue to work.
>
> **GCP project `evia-500215` is NOT being replaced.** Do not create a new GCP project.

---

## Story M2 — Android Package Rename & Build Config

| Field | Value |
|---|---|
| **Story ID** | M2 |
| **Story name** | Rename Android package from ai.evia.app to ai.okuvu.app |
| **Priority** | High (2) |
| **Status** | To Do |
| **Estimate** | 2 days |
| **Depends on** | M1 |
| **Blocks** | M5 |

### Description

Rename the Android application package from `ai.evia.app` to `ai.okuvu.app` across all build configurations, manifests, and Kotlin source. Replace `google-services.json` with the Firebase-regenerated version from M1.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/android/app/build.gradle` | `namespace "ai.evia.app"` → `"ai.okuvu.app"`, `applicationId "ai.evia.app"` → `"ai.okuvu.app"` (all 3 flavor dimensions: dev, beta, prod) |
| `apps/mobile/android/app/src/main/kotlin/ai/evia/app/MainActivity.kt` | Package declaration: `package ai.evia.app` → `package ai.okuvu.app` |
| Directory rename | `kotlin/ai/evia/app/` → `kotlin/ai/okuvu/app/` |
| `apps/mobile/android/app/src/dev/AndroidManifest.xml` | `android:label="Evia Dev"` → `"Okuvu Dev"` |
| `apps/mobile/android/app/src/beta/AndroidManifest.xml` | `android:label="Evia Beta"` → `"Okuvu Beta"` |
| `apps/mobile/android/app/src/prod/AndroidManifest.xml` | `android:label="Evia"` → `"Okuvu"` |
| `apps/mobile/android/app/google-services.json` | Replace with Firebase-regenerated version from M1 |

### Acceptance Criteria

- [ ] `namespace` and `applicationId` updated to `ai.okuvu.app` for all 3 flavors
- [ ] `MainActivity.kt` package declaration updated and file moved to correct directory
- [ ] 3 AndroidManifest.xml display labels updated (Evia Dev → Okuvu Dev, etc.)
- [ ] Fresh `google-services.json` placed in `android/app/`
- [ ] `flutter build apk --flavor dev` succeeds
- [ ] `flutter build apk --flavor beta` succeeds
- [ ] `flutter build apk --flavor prod` succeeds
- [ ] App installs and launches on device/emulator

### AI Coding Notes

> **Common mistake:** Both `namespace` (build.gradle line ~32) AND `applicationId` (build.gradle line ~50) must be updated. `namespace` affects R class and resource resolution; `applicationId` affects Play Store identity.
>
> **Common mistake:** The `MainActivity.kt` directory structure must physically move to match the new package path. Just changing the package declaration without moving the file will cause build failures.
>
> **Common mistake:** `google-services.json` contains the old package name fingerprints. The old file will cause Firebase auth failures. Must be replaced with the version from M1.

---

## Story M3 — Firebase Config Files & Environment Variables

| Field | Value |
|---|---|
| **Story ID** | M3 |
| **Story name** | Update Firebase environment variables and config files |
| **Priority** | High (2) |
| **Status** | To Do |
| **Estimate** | 0.5 day |
| **Depends on** | M1 |
| **Blocks** | Nothing (can run parallel with M2, M4) |

### Description

Update all Firebase-related environment variables and configuration files. Since the Firebase project ID (`evia-500215`) stays the same, most values remain unchanged — but verify and document.

### Files to modify

| File | Change |
|---|---|
| `.env` / `.env.example` | Verify `FIREBASE_PROJECT_ID=evia-500215` — stays correct |
| `apps/therapist-portal/.env` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` — verify correct for renamed Firebase project |
| `apps/therapist-portal/.env.example` | Same |
| `apps/therapist-portal/firebase.json` | Firebase emulator config — verify no domain changes needed |
| `apps/api/src/lib/firebase-auth.ts` | Verify FIREBASE_PROJECT_ID env var usage — no code change expected |

### Acceptance Criteria

- [ ] Firebase env vars verified/updated in root .env and .env.example
- [ ] Firebase env vars verified/updated in therapist-portal .env and .env.example
- [ ] Firebase emulator config reviewed
- [ ] `pnpm dev` for therapist-portal starts without Firebase auth errors

### AI Coding Notes

> **Common mistake:** Firebase Auth SDK uses `authDomain` which is `{project_id}.firebaseapp.com`. If the project ID stays `evia-500215`, the auth domain stays `evia-500215.firebaseapp.com`. Do not change it to `okuvu`.
>
> **Common mistake:** `firebase.json` is for local emulator config, not production. Only update if the emulator project name changed.

---

## Story M4 — iOS Bundle Identifier Rename

| Field | Value |
|---|---|
| **Story ID** | M4 |
| **Story name** | Rename iOS bundle identifier from ai.evia.app to ai.okuvu.app |
| **Priority** | High (2) |
| **Status** | To Do |
| **Estimate** | 1 day |
| **Depends on** | M1 |
| **Blocks** | M5 |

### Description

Rename the iOS bundle identifier from `ai.evia.app` to `ai.okuvu.app` across all build configurations. Replace `GoogleService-Info.plist` with Firebase-regenerated version from M1.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/ios/Flutter/Dev.xcconfig` | `PRODUCT_BUNDLE_IDENTIFIER=ai.evia.app.dev` → `ai.okuvu.app.dev`, `APP_DISPLAY_NAME="Evia Dev"` → `"Okuvu Dev"` |
| `apps/mobile/ios/Flutter/Beta.xcconfig` | `PRODUCT_BUNDLE_IDENTIFIER=ai.evia.app.beta` → `ai.okuvu.app.beta`, `APP_DISPLAY_NAME="Evia Beta"` → `"Okuvu Beta"` |
| `apps/mobile/ios/Flutter/Prod.xcconfig` | `PRODUCT_BUNDLE_IDENTIFIER=ai.evia.app` → `ai.okuvu.app`, `APP_DISPLAY_NAME="Evia"` → `"Okuvu"` |
| `apps/mobile/ios/Runner/Info.plist` | `CFBundleName` "evia" → "okuvu" |
| `GoogleService-Info.plist` | Replace with Firebase-regenerated version from M1 |

### Acceptance Criteria

- [ ] All 3 xcconfig files updated with new bundle IDs and display names
- [ ] Info.plist CFBundleName updated
- [ ] Fresh GoogleService-Info.plist in place
- [ ] `flutter build ios --flavor dev --no-codesign` succeeds (macOS only)

### AI Coding Notes

> **Common mistake:** xcconfig files use `PRODUCT_BUNDLE_IDENTIFIER` (singular, no underscore between BUNDLE and IDENTIFIER). Check exact casing.
>
> **Common mistake:** Xcode caches derived data. After changing bundle IDs, run `flutter clean` before building to avoid stale cache issues.

---

## Story M5 — Flutter Package Name & Display Strings

| Field | Value |
|---|---|
| **Story ID** | M5 |
| **Story name** | Update Flutter package name and app display strings |
| **Priority** | High (2) |
| **Status** | To Do |
| **Estimate** | 1 day |
| **Depends on** | M2, M4 |
| **Blocks** | M6 |

### Description

Update the Flutter package name in `pubspec.yaml` (which controls `package:evia/...` import paths) and all display strings in the Dart codebase.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/pubspec.yaml` | `name: evia` → `name: okuvu`, `description: "Evia — ..."` → `"Okuvu — ..."`, `package_name: ai.evia.app` → `ai.okuvu.app` |
| `apps/mobile/lib/main.dart` | 3x `'Evia'` string literals (lines 51, 59, 85) → `'Okuvu'` |
| `apps/mobile/test/home_screen_test.dart` | `'renders from evia label'` string |

### Test files requiring import path updates (~22 files)

All `import 'package:evia/...'` will auto-resolve when `pubspec.yaml` name changes and `flutter pub get` runs. But each should be verified:

- `test/widget_test.dart`
- `test/home_screen_test.dart`
- `test/home_insight_card_test.dart`
- `test/consent_screen_test.dart`
- `test/auth_interceptor_test.dart`
- `test/config/app_config_test.dart`
- `test/crisis/crisis_overlay_test.dart`
- `test/features/journal/journal_screen_test.dart`
- `test/features/journal/journal_list_screen_test.dart`
- `test/features/journal/journal_provider_test.dart`
- `test/features/home/quick_access_tile_test.dart`
- `test/features/chat/widgets/grounding_card_test.dart`
- `test/features/chat/chat_screen_test.dart`
- `test/features/settings/settings_screen_test.dart`
- `test/features/settings/privacy_screen_test.dart`
- `test/features/settings/privacy_data_screen_test.dart`
- `test/features/settings/about_screen_test.dart`
- `test/features/progress/progress_screen_test.dart`
- `test/features/intake/intake_screen_test.dart`

### Acceptance Criteria

- [ ] pubspec.yaml `name:` and `package_name:` updated
- [ ] `flutter pub get` succeeds
- [ ] All `package:evia/...` references in test files resolve to `package:okuvu/...`
- [ ] Display strings in `main.dart` updated
- [ ] `flutter analyze` passes with no errors
- [ ] `flutter test` passes (all existing tests)
- [ ] App launches on device and shows "Okuvu" branding

### AI Coding Notes

> **Common mistake:** Changing `pubspec.yaml` `name:` changes the Dart package name, which controls the `package:evia/` import prefix. Test files use `import 'package:evia/...'` which will break until `flutter pub get` regenerates the package mapping.
>
> **Common mistake:** `flutter pub get` must be run after the pubspec.yaml change. The `.dart_tool/package_config.json` is what maps `package:okuvu/` to the actual lib/ directory.
>
> **Common mistake:** Do not manually edit `package:evia/` → `package:okuvu/` in test files. Change pubspec.yaml `name:` first, run `flutter pub get`, then let the tooling handle resolution. Only fix files that the linter flags after.

---

## Story M6 — Workspace Package Rename (@evia/* → @okuvu/*)

| Field | Value |
|---|---|
| **Story ID** | M6 |
| **Story name** | Rename pnpm workspace packages from @evia to @okuvu scope |
| **Priority** | High (2) |
| **Status** | To Do |
| **Estimate** | 3 days |
| **Depends on** | M5 |
| **Blocks** | M7, M8 |

### Description

Rename all pnpm workspace packages from the `@evia/*` scope to `@okuvu/*`. This affects 6 package.json files, Dockerfiles, ~25+ TypeScript source files with `@evia/*` imports, and the lockfile.

### Files to modify

**Package definitions (6 files):**

| File | Change |
|---|---|
| `package.json` (root) | `"name": "evia"` → `"okuvu"` |
| `packages/prisma/package.json` | `"name": "@evia/prisma"` → `"@okuvu/prisma"` |
| `packages/shared-types/package.json` | `"name": "@evia/shared-types"` → `"@okuvu/shared-types"` |
| `apps/api/package.json` | `"name": "@evia/api"` → `"@okuvu/api"`, deps: `"@evia/prisma"` → `"@okuvu/prisma"`, `"@evia/shared-types"` → `"@okuvu/shared-types"` |
| `apps/therapist-portal/package.json` | `"name": "@evia/therapist-portal"` → `"@okuvu/therapist-portal"`, same dep updates |
| `apps/worker/package.json` | `"name": "@evia/worker"` → `"@okuvu/worker"`, same dep updates |

**Dockerfiles (2 files):**
- `apps/api/Dockerfile` — `--filter @evia/prisma` → `@okuvu/prisma`, `--filter @evia/api` → `@okuvu/api`
- `apps/worker/Dockerfile` — same

**Build config:**
- `apps/therapist-portal/next.config.ts` — `transpilePackages: ['@evia/prisma', '@evia/shared-types']` → `'@okuvu/...'`

**TypeScript imports (~25+ files) — search and replace `@evia/` → `@okuvu/`:**

| File | Import |
|---|---|
| `apps/api/src/routes/websocket.ts` | `@evia/shared-types` |
| `apps/api/src/routes/journal.ts` | `@evia/shared-types` |
| `apps/api/src/routes/users.ts` | `@evia/shared-types` |
| `apps/api/src/pipeline/types.ts` | `@evia/shared-types` |
| `apps/api/src/pipeline/orchestrator.ts` | `@evia/shared-types` |
| `apps/api/src/lib/tool-result-store.ts` | `@evia/shared-types` |
| `apps/api/src/lib/tool-card.ts` | `@evia/shared-types` |
| `apps/api/src/lib/session-handler.ts` | `@evia/shared-types` |
| `apps/api/src/lib/session-close.ts` | `@evia/shared-types` |
| `apps/api/src/lib/agent-context.ts` | `@evia/shared-types` |
| `apps/api/src/lib/session-limits.ts` | `@evia/shared-types` |
| `apps/api/src/agents/a8-router.ts` | `@evia/shared-types` |
| `apps/api/src/agents/a1/types.ts` | `@evia/shared-types` |
| `apps/api/src/agents/a1/agent.ts` | `@evia/shared-types` |
| `apps/api/src/__tests__/a8-router.test.ts` | `@evia/shared-types` |
| `apps/therapist-portal/src/server/routers/clients.ts` | `@evia/prisma` |
| `apps/therapist-portal/src/lib/prisma.ts` | `@evia/prisma` |
| `apps/therapist-portal/src/scripts/seed-therapist.ts` | `@evia/prisma` |
| `apps/therapist-portal/src/scripts/seed-therapists-batch.ts` | `@evia/prisma` |
| `apps/worker/src/routes/cleanup.ts` | `@evia/shared-types` |
| `apps/worker/src/__tests__/cleanup.test.ts` | `@evia/shared-types` |

### Acceptance Criteria

- [ ] All 6 package.json name fields updated
- [ ] All workspace dependency references updated in app package.json files
- [ ] next.config.ts transpilePackages updated
- [ ] All TypeScript imports of `@evia/*` changed to `@okuvu/*`
- [ ] Both Dockerfiles updated
- [ ] `pnpm install` succeeds
- [ ] `pnpm build` (or equivalent) succeeds for all packages: api, therapist-portal, worker
- [ ] All tests pass: `pnpm test` for api, worker, shared-types, prisma

### AI Coding Notes

> **Common mistake:** `pnpm-lock.yaml` must be regenerated. After updating all package.json files, run `pnpm install` from root. The lockfile will auto-update. Do NOT manually edit the lockfile.
>
> **Common mistake:** `next.config.ts` `transpilePackages` must be updated for the therapist portal to find the renamed monorepo packages. If this is missed, the portal will fail with module-not-found errors at build time.
>
> **Common mistake:** Search for `@evia/` (with the slash) not just `evia` to avoid matching unrelated strings. Also search for `from '@evia/` and `require('@evia/` patterns.

---

## Story M7 — Domain, Email & Documentation Updates

| Field | Value |
|---|---|
| **Story ID** | M7 |
| **Story name** | Update domain references, email sender, and high-priority docs |
| **Priority** | Medium (3) |
| **Status** | To Do |
| **Estimate** | 1 day |
| **Depends on** | M6 |
| **Blocks** | Nothing |

### Description

Update all brand-facing references from `evia.ai` to `okuvu.in`, update SendGrid sender info, JWT defaults, and high-priority documentation.

### Files to modify

**Environment configs:**
| File | Change |
|---|---|
| `.env` / `.env.example` | `SENDGRID_FROM_EMAIL=noreply@evia.ai` → `noreply@okuvu.in` |
| `.env` / `.env.example` | `SENDGRID_FROM_NAME=Evia` → `Okuvu` |
| `.env` / `.env.example` | `JWT_AUDIENCE=evia-api` → `okuvu-api` |
| `.env` / `.env.example` | `JWT_ISSUER=https://securetoken.google.com/evia-dev` → `securetoken.google.com/okuvu-dev` (if Firebase project ID changed; otherwise keep) |

**Documentation:**
| File | Change |
|---|---|
| `README.md` | Title, description, repo structure table, environment variables table — all `Evia` → `Okuvu`, `evia` → `okuvu` |
| `CONTRIBUTING.md` | Clone URLs, cd commands, project references |
| `docs/adr/002-websocket-auth.md` | `wss://api.evia.ai/ws` → `wss://api.okuvu.in/ws` |

**CI / templates:**
| File | Change |
|---|---|
| `.github/PULL_REQUEST_TEMPLATE.md` | "EVIA project" reference → "Okuvu project" |
| `.github/workflows/pr-review.yml` | "EVIA project" → "Okuvu project" |

### Acceptance Criteria

- [ ] SendGrid from email and name updated to `okuvu.in`
- [ ] JWT audience/issuer defaults updated to reflect new project name
- [ ] README.md fully updated (title, description, structure, env table)
- [ ] CONTRIBUTING.md clone URLs updated
- [ ] `.env.example` reflects all okuvu defaults
- [ ] PR template and CI workflow comments updated
- [ ] `docs/adr/002-websocket-auth.md` domain reference updated
- [ ] Quick scan for any other `evia.ai` references in docs

### AI Coding Notes

> **Common mistake:** The `.env.example` is tracked in git; `.env` is not. Both must be updated so new developers get correct defaults. Do not skip `.env.example`.
>
> **Common mistake:** Search for `evia.ai` (with domain TLD) separately from `evia-500215` (GCP project ID) to avoid changing GCP resource references.

---

## Story M8 — Code Defaults Update

| Field | Value |
|---|---|
| **Story ID** | M8 |
| **Story name** | Update Vertex AI and other code defaults from evia-dev to okuvu-dev |
| **Priority** | Medium (3) |
| **Status** | To Do |
| **Estimate** | 0.5 day |
| **Depends on** | M6 |
| **Blocks** | Nothing |

### Description

Update default GCP-related string constants in source code. Actual GCP resource names (`evia-500215`, `evia-db`, service accounts, etc.) stay unchanged — this only changes fallback defaults used when environment variables are not set.

### Files to modify

| File | Line | Change |
|---|---|---|
| `apps/api/src/lib/vertex-ai.ts` | 21 | `process.env.VERTEX_AI_PROJECT_ID ?? 'evia-dev'` → `'okuvu-dev'` |
| `apps/api/src/crypto/emergency-contact-encryption.ts` | 9 | `process.env.VERTEX_AI_PROJECT_ID ?? 'evia-dev'` → `'okuvu-dev'` |
| `apps/worker/src/lib/vertex-ai.ts` | 19 | `process.env.VERTEX_AI_PROJECT_ID ?? 'evia-dev'` → `'okuvu-dev'` |
| `apps/worker/src/lib/embedding.ts` | 16 | `process.env.VERTEX_AI_PROJECT_ID ?? 'evia-dev'` → `'okuvu-dev'` |
| `apps/therapist-portal/src/server/trpc.ts` | 7 | `bypass@evia.dev` → `bypass@okuvu.dev` |
| `apps/api/src/__tests__/vertex-ai.test.ts` | 125, 137 | Verify if test assertions reference `evia-500215` or `evia-dev`; update if needed |

### Acceptance Criteria

- [ ] All 4 source files with `?? 'evia-dev'` default updated to `okuvu-dev`
- [ ] trpc.ts bypass email updated
- [ ] Vertex AI test assertions updated if they reference old project name
- [ ] `pnpm test` passes for api and worker packages

### AI Coding Notes

> **Common mistake:** These are fallback defaults only — they apply when `VERTEX_AI_PROJECT_ID` env var is not set. The actual GCP project ID (`evia-500215`) is set via environment variables in production, not hardcoded. Do NOT change the production GCP project ID.
>
> **Common mistake:** Do not change any `evia-500215` string — these are the real GCP project IDs and must stay unchanged. Only change `evia-dev` default values.

---

## Sprint Summary

| Story | ID | Estimate | Depends on | Description |
|---|---|---|---|---|
| Play Console & Firebase | M1 | 1d | — | **CRITICAL PATH** |
| Android package rename | M2 | 2d | M1 | |
| Firebase env vars | M3 | 0.5d | M1 | Parallel with M2, M4 |
| iOS bundle ID rename | M4 | 1d | M1 | |
| Flutter package + strings | M5 | 1d | M2, M4 | |
| Workspace packages @evia→@okuvu | M6 | 3d | M5 | **LARGEST** |
| Domain/email/docs | M7 | 1d | M6 | |
| Code defaults | M8 | 0.5d | M6 | |

**Total estimate:** 10 days
**Dependency chain:** M1 → (M2 + M4) → M5 → M6 → (M7 + M8)
