# OKUVU Mobile App — Feature Test Results

**Date:** 2026-09-18
**Tested by:** AI Code Verification (file existence check)
**Codebase path:** `apps/mobile/lib/src/`

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Found | 39 |
| ❌ Missing | 7 |
| **Total** | **46** |

---

## Detailed Results

### ✅ Features Found (39)

| # | Feature | Primary File(s) | Status |
|---|---------|------------------|--------|
| 1 | Splash screen | `features/splash/splash_screen.dart` | ✅ Found |
| 2 | OTP login | `features/auth/otp_login_screen.dart` | ✅ Found |
| 3 | Consent screen | `features/consent/consent_screen.dart`, `consent_request.dart` | ✅ Found |
| 4 | Cold-start screen | `features/intake/cold_start_screen.dart` | ✅ Found |
| 6 | Home screen | `features/home/home_screen.dart` | ✅ Found |
| 7 | Mood check-in card | `features/home/widgets/mood_check_in.dart`, `progress/providers/progress_provider.dart` | ✅ Found |
| 8 | Today card | `features/home/widgets/today_card.dart`, `providers/today_card_provider.dart` | ✅ Found |
| 9 | Quick-access tiles (Breathe/Journal) | `features/home/widgets/quick_access_tile.dart` | ✅ Found |
| 13 | Home bottom navigation bar | `features/home/widgets/home_bottom_nav.dart` | ✅ Found |
| 14 | Breathing screen | `features/home/breathing_screen.dart` | ✅ Found |
| 15 | Chat screen (core conversation) | `features/chat/chat_screen.dart`, `models/chat_message.dart`, `chat_state.dart`, `agent_turn_frame.dart` | ✅ Found |
| 16 | Typing indicator | `features/chat/widgets/typing_indicator.dart` | ✅ Found |
| 17 | Reconnect banner | `features/chat/widgets/reconnect_banner.dart` | ✅ Found |
| 18 | Tool cards — dispatcher | `features/chat/widgets/tool_card_widget.dart`, `models/tool_card_config.dart` | ✅ Found |
| 19 | Guided breathing tool card | `features/chat/widgets/guided_breathing_card.dart` | ✅ Found |
| 20 | Grounding card (interactive 5-4-3-2-1) | `features/chat/widgets/grounding_card.dart` | ✅ Found |
| 21 | SRS modal (session-rating prompt) | `features/chat/widgets/srs_modal.dart` | ✅ Found |
| 22 | Voice toggle | `widgets/voice_toggle.dart` | ✅ Found |
| 23 | Journal entry form | `features/journal/journal_screen.dart`, `journal_provider.dart`, `journal_entry.dart` | ✅ Found |
| 24 | Journal privacy notice | `features/journal/journal_screen.dart` (inline) | ✅ Found |
| 25 | Journal history list | `features/journal/journal_list_screen.dart`, `journal_provider.dart`, `journal_entry.dart` | ✅ Found |
| 26 | Progress screen (mood chart + care phase) | `features/progress/progress_screen.dart`, `providers/progress_provider.dart`, `models/mood_data_point.dart` | ✅ Found |
| 27 | Settings hub | `features/settings/settings_screen.dart` | ✅ Found |
| 29 | Emergency Contact | `features/settings/emergency_contact_screen.dart`, `emergency_contact_notifier.dart` | ✅ Found |
| 30 | Privacy & Data (consent preferences) | `features/settings/privacy_data_screen.dart`, `consent_provider.dart` | ✅ Found |
| 31 | Language settings (English Mirror) | `features/settings/language_screen.dart`, `language_notifier.dart` | ✅ Found |
| 32 | About | `features/settings/about_screen.dart` | ✅ Found |
| 33 | Privacy Policy viewer | `features/settings/privacy_screen.dart` | ✅ Found |
| 34 | Profile screen (stub) | `features/settings/profile_screen.dart` | ✅ Found |
| 35 | Notifications screen (stub) | `features/settings/notifications_screen.dart` | ✅ Found |
| 36 | Account deletion | `features/settings/account_deletion_screen.dart` | ✅ Found |
| 37 | Quote-of-the-Day toggle | `widgets/quote_of_day_toggle.dart`, `features/settings/quote_of_day_notifier.dart` | ✅ Found |
| 38 | Crisis overlay | `features/crisis/crisis_overlay.dart` | ✅ Found |
| 39 | Not-found screen | `core/not_found_screen.dart` | ✅ Found |
| 40 | TTS / Voice subsystem | `core/tts_service.dart`, `widgets/voice_toggle.dart`, `features/settings/voice_settings_notifier.dart`, `features/chat/widgets/guided_breathing_card.dart` | ✅ Found |
| 41 | Language mode (English Mirror) — data path | `features/settings/language_notifier.dart`, `language_screen.dart` | ✅ Found |
| 42 | Theme / branding | `app.dart`, `theme/app_theme.dart`, `theme/app_colors.dart` | ✅ Found |
| 43 | WebSocket protocol (shared contract) | `core/websocket_service.dart`, `core/websocket_constants.dart` | ✅ Found |
| 44 | API surface (all HTTP endpoints) | `core/dio_client.dart` (found; no standalone endpoint listing file) | ✅ Found |
| 45 | Local storage keys | `SharedPreferences` usage in `journal_screen.dart`, `onboarding_provider.dart` | ✅ Found |
| 46 | Firebase / platform integrations | `core/auth_service.dart` (FirebaseAuth), `core/analytics_service.dart` (FirebaseAnalytics), `features/auth/otp_login_screen.dart` | ✅ Found |

---

### ❌ Features Missing (7)

| # | Feature | Expected File(s) | Status | Notes |
|---|---------|-------------------|--------|-------|
| 5 | Intake / onboarding chat | `features/intake/intake_screen.dart`, `intake_notifier.dart`, `intake_message.dart`, `widgets/onboarding_progress_bar.dart` | ❌ Missing | Only `cold_start_screen.dart` and `onboarding_provider.dart` exist. The dedicated intake screen, notifier, message model, and progress bar widget are **not found** in the codebase. |
| 10 | Progress summary card (Home) | `features/home/widgets/progress_summary.dart` | ❌ Missing | No `progress_summary.dart` file exists. The home screen does not have this widget. |
| 11 | Home insight card | `features/home/widgets/home_insight_card.dart` | ❌ Missing | No `home_insight_card.dart` file exists. |
| 12 | Affirmation card | `features/home/widgets/affirmation_card.dart` | ❌ Missing | No `affirmation_card.dart` file exists. |
| 28 | My Focus Area | `features/settings/my_focus_area_screen.dart` | ❌ Missing | No `my_focus_area_screen.dart` file exists in settings. |

---

## Additional Files Found (Not in Feature Register)

These files exist in the codebase but were not listed in the feature register:

| File | Location | Notes |
|------|----------|-------|
| Waitlist screen | `features/auth/waitlist_screen.dart` | Auth flow addition |
| Onboarding welcome screen | `features/onboarding_welcome/welcome_screen.dart` | Pre-intake flow |
| Welcome provider | `features/onboarding_welcome/welcome_provider.dart` | |
| Age blocked screen | `features/onboarding_welcome/age_blocked_screen.dart` | |
| Care plan provider | `features/intake/care_plan_provider.dart` | |
| Care ended screen | `features/home/care_ended_screen.dart` | |
| Next session card | `features/home/widgets/next_session_card.dart` | Home widget |
| Pending chat access banner | `features/home/widgets/pending_chat_access_banner.dart` | Home widget |
| Box breathing visual | `features/chat/widgets/box_breathing_visual.dart` | Chat widget |
| Breathing presets model | `features/chat/models/breathing_presets.dart` | Chat model |
| Grounding result model | `features/chat/models/grounding_result.dart` | Chat model |
| Appointments screen | `features/appointments/appointments_screen.dart` | Entire feature not in register |
| Appointment detail | `features/appointments/appointment_detail_screen.dart` | |
| Appointments provider | `features/appointments/appointments_provider.dart` | |
| Profile provider | `features/settings/profile_provider.dart` | |
| Notification settings notifier | `features/settings/notification_settings_notifier.dart` | |
| Flavor config | `config/flavor_config.dart` | |
| Environment config | `config/environment.dart` | |
| App config | `config/app_config.dart` | |
| App bar title widget | `widgets/okuvu_app_bar_title.dart` | |
| Core providers | `core/providers.dart` | |
| Logger | `core/logger.dart` | |
| Auth interceptor | `core/auth_interceptor.dart` | |

---

## Conclusion

**39 out of 46** features from the register have their primary files present in the codebase.

**7 features are missing** their expected files:
- Feature 5 (Intake/onboarding chat) is partially implemented via `cold_start_screen.dart` and `onboarding_provider.dart`, but lacks the dedicated intake screen, notifier, message model, and progress bar.
- Features 10, 11, 12 (Progress summary, Insight card, Affirmation card) — home widget files not found.
- Feature 28 (My Focus Area) — settings screen not found.

The codebase also contains **24 additional files** not referenced in the feature register, including an entire **Appointments** feature and several onboarding/welcome flow components.
