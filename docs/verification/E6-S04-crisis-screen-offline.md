# E6-S04 — Crisis Screen Offline Guarantee: Verification Record

**Story:** E6-S04 — Crisis screen offline bundle verification
**Feature:** Crisis support overlay with 5 offline-first crisis resources
**Status:** ✅ VERIFIED — All acceptance criteria met

**Commit:** `3cddb3a` <!-- Fill in after verifying: git rev-parse --short HEAD -->

**Date:** 2026-07-04
**Tester:** [Manual]
**Device:** realme (449082cf) — Android 14 / MIUI
**Flavor:** `beta` (`ai.evia.app.beta`)

---

## Acceptance Criteria

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| AC1 | Fresh install — crisis trigger works without prior data | ✅ PASS | `adb uninstall` + `adb install`; auth flow completed; crisis button present and functional |
| AC2 | All 5 crisis resources render in airplane mode | ✅ PASS | iCall (9152987821), Vandrevala (18602662345), NIMHANS (08046110007), Snehi (04424640050), Emergency (112) — all confirmed visible on screen |
| AC3 | No dismiss/close button on crisis screen | ✅ PASS | No "Dismiss", "Close", or equivalent affordance present |
| AC4 | System back button does not dismiss crisis | ✅ PASS | Crisis screen rendered via GoRouter `/crisis` route with `PopScope(canPop: false)` — back gesture has no effect |
| AC5 | One-tap call launches `tel:` intent | ✅ PASS | iCall → dialer with `9152987821` pre-filled; Emergency Services → dialer with `112` pre-filled |
| AC6 | Crisis operates without network dependencies | ✅ PASS | Zero `dio`/HTTP calls from `CrisisOverlay` widget; all content is hardcoded; no provider overrides needed in widget test |

---

## Verification Steps

### 1. Fresh Install

```
adb uninstall ai.evia.app.beta
adb install apps/mobile/build/app/outputs/flutter-apk/app-beta-debug.apk
```

App launched to splash screen. Auth flow completed successfully (OTP → consent → intake → home).

### 2. Crisis Trigger

Tapped **Crisis Support** button on Home Screen. App navigated to `/crisis` route. Full-screen crisis overlay rendered with all 5 resource tiles.

### 3. Airplane Mode

Airplane mode enabled via device quick settings. Crisis overlay remained fully rendered. No loading indicators, network errors, or empty states appeared.

### 4. Resource Verification

All 5 resources confirmed visible:

| Name | Phone | Verified |
|------|-------|----------|
| iCall (IIT Bombay) | 9152987821 | ✅ |
| Vandrevala Foundation | 18602662345 | ✅ |
| NIMHANS | 08046110007 | ✅ |
| Snehi | 04424640050 | ✅ |
| Emergency Services | 112 | ✅ |

### 5. One-Tap Call

- Tapped **iCall** tile → Android dialer opened with `9152987821` pre-filled
- Tapped **Emergency Services** tile → Android dialer opened with `112` pre-filled
- Remaining tiles confirmed wired to their respective `tel:` URIs

### 6. Back Button

Pressed system back gesture (MIUI gesture navigation). Crisis screen remained visible. App did not exit. Confirmed `PopScope(canPop: false)` intercepts the back event at the Navigator level.

### 7. Return to Online

Airplane mode disabled. App reconnected to network normally. No crash or state corruption after the offline period.

---

## Implementation Notes

- Crisis is shown via GoRouter navigation to `/crisis` (defined in `router.dart`).
- `CrisisScreen` wraps content in `PopScope(canPop: false)` — no route-level back navigation.
- `CrisisOverlay` uses `url_launcher` with `Uri(scheme: 'tel')` for one-tap calling.
- All resource data is hardcoded in `crisis_overlay.dart` — zero network calls.
- Stack-based overlay (`_CrisisOverlaySlot` in `app.dart`) was removed in favour of the route-based approach.

---

## Widget Tests

All 7 crisis-related widget tests pass (`test/widget_test.dart`):

| Test | Status |
|------|--------|
| Crisis overlay shows all 5 crisis resources | ✅ PASS |
| Crisis overlay has no dismiss button | ✅ PASS |
| Crisis overlay does not dismiss when tapped | ✅ PASS |
| Crisis overlay requires no network dependencies | ✅ PASS |

```
$ flutter test --flavor beta --dart-define=FLAVOR=beta
00:08 +40: All tests passed!
```

---

## Screenshots

<!-- Attach or reference screenshots from `C:\Users\TANVI KOTARI\Desktop\evia testing\` -->

| # | File | Description |
|---|------|-------------|
| 1 | `screenshot-2-home-screen.png` | Home screen after fresh install + auth |
| 2 | `screenshot-3-crisis-overlay.png` | Crisis overlay right after triggering (online) |
| 3 | `screenshot-4-airplane-mode.png` | Device with airplane mode enabled |
| 4 | `screenshot-5-all-resources.png` | All 5 resources visible in airplane mode |
| 5 | `screenshot-6-dialer-icall.png` | Dialer after tapping iCall tile |
| 6 | `screenshot-7-back-online.png` | App after returning online |

---

## Conclusion

**E6-S04 VERIFIED.** All acceptance criteria pass. The crisis screen renders all 5 resources in airplane mode, launches `tel:` intents on tap, and blocks the system back button via `PopScope(canPop: false)` on the GoRouter `/crisis` route. No application code changes remain from the back-button fix — the verification was performed against the current develop branch.

---

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-07-04 | Initial verification record | [Manual] |
