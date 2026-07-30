# Migration: evia → okuvu — Rename Design & Sprint Plan

**Date:** 2026-07-30
**Status:** Design Approved

## Overview

Rename the entire project from "evia" to "okuvu" across codebase, brand-facing assets, and platform configurations. The GCP project (`evia-500215`) and all GCP resource names stay unchanged.

## Scope

### Must change
1. **Android** — `applicationId` / namespace: `ai.evia.app` → `ai.okuvu.app` (build.gradle, MainActivity.kt, file tree)
2. **iOS** — `PRODUCT_BUNDLE_IDENTIFIER`: `ai.evia.app` → `ai.okuvu.app` (xcconfigs, Info.plist)
3. **Firebase** — Rename Firebase project, re-register Android/iOS apps under new package names
4. **Flutter pubspec.yaml** — `name: evia` → `name: okuvu`, `package_name`
5. **Workspace packages** — 5x package.json: `@evia/*` → `@okuvu/*`
6. **TypeScript imports** — ~25+ files: `@evia/*` → `@okuvu/*`
7. **Dockerfiles** — `--filter @evia/*` → `--filter @okuvu/*`
8. **next.config.ts** — `transpilePackages`
9. **Display strings** — Flutter main.dart, Android manifest labels, xcconfig display names
10. **Dart test imports** — ~22 files: `package:evia/...` → `package:okuvu/...`
11. **Domain/email** — `evia.ai` → `okuvu.in`, `noreply@evia.ai` → `noreply@okuvu.in`
12. **GitHub** — `EviaAI/evia` → `OkuvuAI/okuvu`, clone URLs in README/CONTRIBUTING
13. **Code defaults** — Vertex AI default project, JWT audience/issuer, SendGrid from name
14. **Firebase re-registration** — Download new google-services.json & GoogleService-Info.plist

### Keep as-is
- GCP project ID `evia-500215` and all GCP resource names (Cloud SQL, buckets, queues, KMS keys, service accounts, Cloud Run services)
- `cloudbuild.yaml`, deployment scripts, terraform infrastructure files
- Internal documentation (architecture docs, testing docs, ADRs, design docs — low priority)

## Implementation Plan

The work is organized into 8 stories across a single migration sprint. Stories are ordered by dependency — Play Console and Firebase changes block all other work.

### Story Dependencies
```
M1 (Play Console + Firebase) ─┬─ M2 (Android changes)
                               ├─ M4 (iOS changes)
                               └─ M3 (Firebase configs → M5 Flutter pubspec → M6 Workspace packages)
                                                                                    └─ M7 (Domain/email/docs)
                                                                                    └─ M8 (Code defaults)
```
