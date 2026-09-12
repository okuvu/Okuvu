# User App Spec v0.3 → v0.4 — delta doc

**Written** 12 Sep 2026 · resolves `00-doc-map-and-parity-resolutions.md` §B.1 (`okuvu-remaining-changes.md` §F.1). A delta from v0.3, not a full spec rewrite — each item below quotes the original §B.1 instruction, then states what's actually true in code today.

## 1. §8 Chat — continuous chat, no session rituals

**Original instruction:** delete "~20 turns per session with taper… SD 1/day TL 2/day guardrail." Replace: continuous chat; no caps/counter; user starts new thread or continues; OKUVU closes at natural resting points (taper), never mid-moment; silent server-side runaway bound (invisible).

**Status: done.** `CAP_TURN_LIMIT`, the turn-8/9/10 closure scripting, `IDLE_TIMEOUT_MS` auto-close-to-user, and the daily-slot `SessionLimit`/`Tier` machinery are all retired (`okuvu-remaining-changes.md` §B.2, commit `1152f98`; daily slots retired earlier, commit `9668b5d`). `SESSION_OPEN_REJECTED` now fires only for `USER_NOT_FOUND`/`INTERNAL_ERROR` — never a turn or daily-count reason (`apps/api/src/lib/session-handler.ts`). Taper itself is a real signal (`taper_state: 'none' | 'solution_reached' | 'pacifying' | 'nowhere'` on A2's S-07 output, persisted on `Turn`) — A2 decides when a conversation is at a natural resting point, not a counter. Verified via a real, non-mocked DB test (`apps/test-harness/src/__tests__/thread-model.test.ts`) that a single thread survives well past the old 10-turn cap with no rejection.

## 2. Settings — language mode

**Original instruction:** add Settings item, English only | Mirror, default English until Hinglish gate passes (O1). Stored on profile, drives `${language_mode}`.

**Status: done.** `User.language_mode` enum (`english | mirror`), `GET/PATCH /settings/language`, mobile `language_notifier.dart` + Settings screen (commit `1ea803a`). Default is `english` (schema default), matching O1's "English until gate passes" — **O1 itself (when/whether the Hinglish gate has passed) remains an open product decision**, not resolved by this doc.

## 3. Reminders — core, not "not in current build"

**Original instruction:** promote reminders from "not in current build" to core (locked 06 Sep); reference the scheduler + push workstream.

**Status: partial, by deliberate scope.** Reminders are real: `Reminder.frequency`/`times`/`tool_id` (linked to `ToolRegistryEntry`), a therapist-portal scheduling page (`/clients/[id]/reminders`), and a **pull-based** `GET /users/me/today` + mobile Today-card widget (`okuvu-remaining-changes.md` §D, commit `d283ee0`). **Push/FCM delivery is explicitly not built** — no `firebase_messaging` dependency, no device-token storage, no Cloud Scheduler job exist anywhere. A client only sees a reminder when they open the app; nothing is pushed to them. This is a deliberate this-pass scope decision, not an oversight — building only the pull half was chosen over stubbing a "send" step with no real Firebase credentials to send through.

## 4. Journal handoff

**Original instruction:** add journal handoff — chat-suggested journal prompt mechanism (S-07 field or light API), mark as being wired.

**Status: done.** A2's S-07 signal gained `journal_prompt_suggested: string | null` (`apps/api/src/agents/a2/types.ts`, prompt §10 in `a2-okuvu-v2.0.txt`). It's transient — forwarded to the client over the websocket (`AgentTurnFrame.payload.journal_prompt_suggested`) but never persisted onto `Turn`, unlike the other S-07 fields, since it's user-facing suggested content rather than a state flag. The chat screen renders a "Save to journal" affordance when present; tapping it prefills the Journal composer via `journalEntryFormProvider.setContent()` and navigates to `/journal` — the user still must pick an emotion chip and tap Save themselves, same as any other entry. Worker 05/06 still never read journal content — that privacy boundary is unchanged and unaffected by this feature (it's one-directional: chat → journal draft only).

## 5. Homework / Today card

**Original instruction:** add Homework (new section or under Today); appears on Today card; completion is user-confirmed + chat-reported; feeds Report Card (therapist-only).

**Status: done,** per the same §D work as reminders above. `GET /users/me/today` surfaces the client's active homework text; `POST /users/me/homework/:id/complete` is the user-confirmed half (distinct from the therapist's own `markCompleted` mutation); the chat-reported half comes from Worker 05's `homework_progress`, which now also has a real Report Card reading it (`apps/therapist-portal/src/server/routers/report-card.ts`).

## 6. Home screen — placeholder removal, real mood meter

**Original instruction:** remove any residual placeholder (streak/counters) — confirm none ship; mood meter → real MoodLog write.

**Status: done, both halves confirmed directly against the code, not just inherited from an earlier note.** `apps/mobile/lib/src/features/progress/progress_screen.dart` has zero streak/milestone code left. The Home mood meter posts to `POST /progress/mood/checkin` (`MoodCheckinNotifier`, commit `ee9ed24`) and now also feeds the therapist-portal's Report Card as a permission-gated mood trend (commit `d283ee0`).

## 7. Voice naming

**Original instruction:** keep "OKUVU" (§8) — matches prompts.

**Status: done.** Confirmed zero residual "Evia" strings in `apps/mobile/lib` (rebrand commit `1ea803a`) and in `apps/api`'s A2 onboarding-adjacent prompt text (onboarding machinery itself was deleted entirely, commit `1a30ce5`, so there's no "Evia" persona text left to say the wrong name).

## Not covered by this delta (open, tracked elsewhere)

- Push/FCM delivery (§3 above) — deferred, no infra/credentials.
- Quote-of-day content source — still undecided, needs an owner (O6).
- Canonical helpline reconciliation between the mobile app's 5-number `crisis_overlay.dart` and the schema's `CrisisResource` table (seeded with only the 2 numbers already treated as canonical) — O7, clinically owned.
- Crisis-response script content — clinically owned, no text exists anywhere yet.
