# Okuvu — Google Play store listing copy (E19-S3)

Single source of truth for every text field in **Play Console → Grow → Store presence →
Main store listing**. Character counts are measured, not eyeballed: run
`python3 docs/store/verify-listing.py` from the repo root and it re-reads this file and
prints the count for each field against its Play limit.

Rules this copy follows:

- **No clinical claims.** Okuvu is not described as therapy, treatment, a medical device,
  clinically reviewed, or clinically validated. Those claims require the clinical
  authority's written approval (E17-S7 / E20-S3) and are absent by design.
- **Consistent with the live privacy policy** at <https://okuvu.in/privacy> (v1.0 beta,
  last updated 2026-10-28): audio never reaches Okuvu, storage is AWS Mumbai, no
  third-party analytics/crash SDK, in-app account deletion, 18+ only, no compliance
  certifications claimed.
- **Matches the shipped app.** Every feature named below has a screen in
  `apps/mobile/lib/src/features/` (see the mapping table at the end).

---

## App name (Play limit: 30 characters)

```text title
Okuvu: AI Mental Wellbeing
```

## Short description (Play limit: 80 characters)

```text short
AI wellbeing companion: chat, journal, and stay close to your therapist.
```

## Full description (Play limit: 4000 characters)

```text full
Okuvu is an AI wellbeing companion for adults, and a way to keep your therapist in the loop between appointments.

WHAT YOU CAN DO

Chat any time. Talk through your day with an AI companion that carries context forward from your recent conversations, so you are not starting from scratch every time.

Check in with your mood. A quick daily check-in builds a trend you can look back on, and that your therapist can see if you have agreed to share it.

Journal privately. Write down what you are carrying. Journal entries are yours: they are not shown to your therapist.

Practise between sessions. Guided breathing and grounding exercises are built in, alongside whatever your therapist has set for you to work on.

Keep your therapist in the loop. If you are working with a therapist on Okuvu, they see AI-written summaries of your sessions so the work continues between appointments. They see your raw chat only if you switch that on, and you can switch it off again at any time.

Stay on top of what is coming. See your upcoming appointments, and the homework and reminders your therapist has set for you.

YOUR VOICE STAYS ON YOUR PHONE

You can dictate instead of typing. Your phone's own speech recognition turns speech into text, and Okuvu never receives or stores the audio. There is no recording feature, and no audio is uploaded to our servers.

WHAT OKUVU IS NOT

Okuvu is not a therapist and is not a replacement for professional diagnosis, treatment or emergency care. It is support alongside care, not instead of it.

If you are in immediate danger or thinking about harming yourself, contact your local emergency number or a crisis line now. Okuvu cannot send help to you.

Okuvu is for adults aged 18 and over.

WHO CAN USE IT

Okuvu accounts are created through a therapist. If you sign in with a number that is not connected to a therapist yet, you can join the waitlist and we will be in touch.

YOUR DATA

- Your account, conversations, mood check-ins and journal entries are stored in AWS Mumbai (ap-south-1), India.
- No third-party analytics or crash-reporting SDK is bundled in the app.
- You can delete your account and your data from inside the app: Settings, then Privacy & Data, then Delete Account.
- Privacy policy: https://okuvu.in/privacy

Questions, problems or a data request: admin@okuvu.in
```

## Contact email (Play Console → Store settings → Contact details → Email)

```text email
admin@okuvu.in
```

`admin@okuvu.in` is the address the live privacy policy publishes for privacy questions,
data requests and grievances (§15), with a stated 7-day acknowledgement. It is the only
public-facing Okuvu mailbox that exists today; no `support@okuvu.in` is referenced anywhere
in the repo or on the site, so none is claimed here.

---

## Feature-to-screen mapping (why the copy is allowed to say it)

| Claim in the copy | Where it exists |
|---|---|
| AI chat with carried-over context | `lib/src/features/chat/chat_screen.dart`, session summaries in §2 of the privacy policy |
| Daily mood check-in + trend | `features/home/widgets/mood_check_in.dart`, `features/progress/progress_screen.dart` ("Your Progress", mood trend, care journey) |
| Private journal | `features/journal/journal_screen.dart`, `journal_list_screen.dart`; privacy §2/§6 ("Journal entries are not shared with your therapist") |
| Breathing and grounding exercises | `features/home/breathing_screen.dart`, `features/chat/widgets/guided_breathing_card.dart`, `box_breathing_visual.dart`, `grounding_card.dart`; the **Breathe** tile on Home |
| Therapist sees summaries, raw chat only on consent | privacy §6 ("Your therapist sees summaries by default — not your raw chat"), `features/home/widgets/pending_chat_access_banner.dart` |
| Appointments, homework, reminders | `features/appointments/appointments_screen.dart`, `appointment_detail_screen.dart`, `features/home/widgets/today_card.dart` (homework + active reminders), `next_session_card.dart` |
| Dictation via the phone's recogniser, no audio received | `core/speech_service.dart`; privacy §3 ("no audio file is ever sent to or stored on our servers") |
| In-app account deletion | `features/settings/privacy_data_screen.dart`, `account_deletion_screen.dart`; privacy §10 |
| 18+ only | `features/onboarding_welcome/age_blocked_screen.dart`, privacy §13 |
| Waitlist for un-invited numbers | `features/auth/waitlist_screen.dart`, `NO_ACCOUNT` branch in `otp_login_screen.dart` |
| Crisis / emergency signposting | `features/crisis/crisis_overlay.dart`, `features/settings/emergency_contact_screen.dart` |
