# Crash Reporting & Production Observability (BUG-18)

**Story:** BUG-18
**ClickUp task:** https://app.clickup.com/t/86d3rpu1e
**Date:** 2026-07-21

## Problem

The app has zero production visibility into crashes or errors:

- No `firebase_crashlytics` or any crash reporting dependency
- `AnalyticsService.logEvent()` is a stub — only `debugPrint` under `kDebugMode`, a no-op in release
- `runZonedGuarded` handler in `main.dart` only `debugPrint`s — errors silently swallowed in release
- `FlutterError.onError` and `PlatformDispatcher.instance.onError` are never configured

## Solution

Use **Firebase Crashlytics** for crash reporting and **Firebase Analytics** for event analytics, keeping everything in the existing Firebase ecosystem.

## Files changed

| File | Change |
|---|---|
| `apps/mobile/pubspec.yaml` | Add `firebase_crashlytics` + `firebase_analytics` |
| `apps/mobile/android/build.gradle` | Add Crashlytics Gradle plugin classpath |
| `apps/mobile/android/app/build.gradle` | Add Crashlytics plugin + NDK dependency |
| `apps/mobile/lib/main.dart` | Wire error handlers to Crashlytics |
| `apps/mobile/lib/src/core/analytics_service.dart` | Rewrite to wrap Firebase Analytics |

## Dependencies

### pubspec.yaml
```yaml
firebase_crashlytics: ^4.5.0
firebase_analytics: ^11.5.0
```

### android/build.gradle (root — buildscript.dependencies)
```groovy
classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.3'
```

### android/app/build.gradle
- Plugin: `id "com.google.firebase.crashlytics"`
- Dependency: `implementation 'com.google.firebase:firebase-crashlytics'`

Versions managed by existing Firebase BOM (`33.12.0`).

## Error handlers (main.dart)

Three points, all after `Firebase.initializeApp()` succeeds:

1. **FlutterError.onError** → `FirebaseCrashlytics.instance.recordFlutterFatalError`
2. **PlatformDispatcher.instance.onError** → `FirebaseCrashlytics.instance.recordError`
3. **runZonedGuarded callback** → forward to `FirebaseCrashlytics.instance.recordError`

`debugPrint` calls retained as local-development side channel.

## AnalyticsService

Rewrite to use `FirebaseAnalytics.instance.logEvent()`. Method signature stays `logEvent(String name, {Map<String, dynamic>? properties})` returning `Future<void>`. Existing `kDebugMode` debugPrint kept for local dev.

## What stays the same

- `providers.dart` — `analyticsServiceProvider` unchanged
- All existing `AnalyticsService.logEvent()` callers — signature-compatible
- No flavor-specific config — single Firebase project for all flavors
- iOS deferred — no Podfile / `GoogleService-Info.plist` exists yet

## Implementation order

1. Add dependencies (pubspec + Gradle)
2. Add error handlers in main.dart
3. Rewrite AnalyticsService
4. Verify with `flutter pub get` + `flutter build apk --debug`
