# Exercise & Worksheet Library — Command 0 repo map

Read-only survey. No source file was modified to produce this document.

**Base commit:** `fffa30f` (*fix(notifications): make the new inbox reachable and stop the name clash*),
branch `feature/exercise-library`, checked out in a git worktree at
`/opt/data/okuvu/exercise-lib-wt`.

Why that commit and not `main`: `main` (`b3b730e`) does **not** contain the client notification inbox
— the `Notification` model, `apps/api/src/routes/notifications.ts`,
`packages/shared-types/notifications.ts` and the app's inbox screen all arrive with `4f6a942`/`fffa30f`.
Command 1 onward must extend that inbox rather than build a second delivery path, so the feature branch
is based on its tip. `main` is 3 commits ahead of that tip and the branch is 2 ahead of `main`; the three
main-only commits are changelog/mobile-artifact chores. See **C7** in the conflicts section.

Repo root referenced below: `apps/` = `api` (Fastify), `worker`, `therapist-portal` (Next.js + tRPC),
`mobile` (Flutter), `test-harness` (Next.js). Shared: `packages/prisma`, `packages/shared-types`.

---

## (a) Homework data model and migrations

Schema: `packages/prisma/schema.prisma` (1144 lines).

### `model Homework` — lines 401–416

| field | type | notes |
|---|---|---|
| `id` | String @default(uuid()) | |
| `client_user_id` | String | FK → `User`, `onDelete: Cascade` |
| `therapist_id` | String | FK → `Therapist` |
| `description` | String | **always free text**, therapist-authored; not length-limited in the model |
| `tool_id` | String? | optional FK → `ToolRegistryEntry.tool_id`, `ON DELETE SET NULL` |
| `status` | `HomeworkStatus` | `active` \| `completed` \| `archived`, default `active` |
| `assigned_at` / `updated_at` | DateTime | |
| relations | `client`, `therapist`, `tool`, `reminders[]` | |

Index: `@@index([client_user_id, status, assigned_at(sort: Desc)])`.

`enum HomeworkStatus` — lines 686–690. **No completion timestamp, no client response field, no
per-item visibility field.** Completion is a status flip only.

### `model Reminder` — lines 427–442

`frequency` is a **plain string**, deliberately not an enum (`'off' | 'once_daily' | 'twice_daily' |
'thrice_daily' | 'as_needed'`), `times String[]` (≤3 `"HH:mm"`), `schedule_note String` (free text),
`active Boolean`, optional `homework_id` and `tool_id`. Index `[user_id, active]`.
The model comment states delivery (push/scheduler) is a separate, not-built workstream.

### Adjacent models this feature will touch

- `ToolRegistryEntry` — lines 705–715. `tool_id` (unique), `label`, `text` (canonical one-line copy),
  `chat_guidable`. **This is the existing catalogue of approved exercises.** Seeded rows:
  `box_breathing`, `grounding_5431`, `guided_breathing`, `physiological_sigh`, `extended_exhale`,
  `humming_breath` (6 rows).
- `UserToolPreference` — lines 724–734. `@@unique([user_id, tool_id])`, `pace_preset`
  (`slower`/`standard`/`faster`, clamped app-side).
- `JournalEntry` — lines 665–677. `emotion String?`, `intensity Int?`, `content String`,
  `created_at`. Index `[user_id, created_at desc]`. **Closest existing "client-written free text"
  store.**
- `MoodLog` — lines 595–607. `mood_value Int` (1–5), `date_ist @db.Date`, `@@unique([user_id, date_ist])`.
- `Notification` — lines 513+. `kind` (plain string), `title`/`body` authored server-side and stored,
  `homework_id` / `appointment_id` deep-link columns, `read_at`. Added by
  `20261106120000_client_notifications`.
- `UserMemory.homework_track` — `String[]`, lines 294–312. Session-tagged homework outcomes
  (`"grounding before bed — not_done, forgot [session 5]"`), written by the summary worker.
- `TherapistClient` — lines 330–400. `chat_access_granted`, `chat_access_requested_at`,
  `chat_access_granted_at`, `chat_access_closed_at` (the 30-day read window), `client_label`.

### Migrations (chronological, `packages/prisma/migrations/`)

| migration | what it did |
|---|---|
| `20260910130000_add_homework_reminder_language_mode_registries` | **Created `Homework`, `Reminder`, `ToolRegistryEntry`** and seeded the first tool rows; also added `language_mode` |
| `20260910120000_add_user_memory_homework_track` | added `UserMemory.homework_track` |
| `20260911170000_add_reminder_frequency_tool_link` | `Reminder.frequency` / `times` / `tool_id` |
| `20260916100000_add_breathing_tool_registry_expansion` | **added `Homework.tool_id`**, created `UserToolPreference`, seeded `physiological_sigh` + `extended_exhale` |
| `20261104000000_add_humming_breath_tool` | seeded `humming_breath`; rewrote `physiological_sigh` / `extended_exhale` copy per clinical sign-off |
| `20261106120000_client_notifications` | created `Notification` |

There is **no drift between `schema.prisma` and the migrations directory for the homework tables** as far
as this read-only pass checked (the fixtures resolve `Homework`, `Reminder`, `ToolRegistryEntry`,
`UserToolPreference`); the drift write-up in `docs/prisma-migration-drift.md` is historical and about
other tables. Command 1 should still run `prisma migrate diff` before adding a migration rather than
trust this line.

---

## (b) Where the portal assigns homework

Two halves, same write.

1. **UI** — `apps/therapist-portal/src/app/clients/[id]/homework/page.tsx`.
   Free-text `description` (required) + optional `toolId` select, both `useState`. Calls
   `trpc.homework.assign.useMutation`. The page copy tells the therapist the homework "appears in the
   client's chat context".
2. **Mutation** — `apps/therapist-portal/src/server/routers/homework.ts`.
   - `assign` (line ~16): input `{ clientUserId, description(min 1, max MAX_DESCRIPTION_LENGTH), toolId? }`;
     `assertClientAssigned(db, therapistId, clientUserId)`; verifies `toolId` exists in
     `ToolRegistryEntry`; creates the `Homework` row; then calls `notifyHomeworkAssigned(...)`
     (line 60) — **non-throwing**, so a failed notification never fails the assignment.
   - `list` (~line 69): `assertClientAssigned` + `logClinicalAccess(..., 'VIEW_HOMEWORK')`.
   - `markCompleted` (~line 106): therapist-side status flip, ownership-checked.
   - Also present: `apps/therapist-portal/src/server/routers/reminders.ts` (reminder CRUD) and
     `apps/therapist-portal/src/app/clients/[id]/reminders/page.tsx`, plus a `tools/` page
     (`clients/[id]/tools/page.tsx`) that only picks `tool_id` values from the existing six.
3. **Notification writer** — `apps/therapist-portal/src/server/notifications.ts`:
   `notifyHomeworkAssigned`, `notifyReminderSet`, `notifyAppointment*`. Writes a `Notification` row through
   the portal's own Prisma client, in the same request. Explicitly documented as *"writing the row is not
   delivery"*. Note: `userAllowsKind()` currently gates **only** appointment kinds on
   `User.appointment_reminders_enabled`; `homework_assigned` is always written.

Client side of the same data:
- `GET /users/me/homework` — `apps/api/src/routes/homework.ts` (90 lines). Returns up to 50 assignments
  (`id, description, status, tool_id, assigned_at, tool.label`) plus all active reminders
  (`schedule_note, frequency, times, homework_id, tool.label`). Read-only, own rows.
- `POST /users/me/homework/:id/complete` — `apps/api/src/routes/users.ts:281`, delegates to
  `completeHomework()` in `apps/api/src/lib/homework.ts`.

---

## (c) The app's Today card and worksheet/tool screens

**There is no worksheet or exercise-library screen anywhere.** `grep -rni "worksheet"` across
`apps/api/src`, `apps/mobile/lib`, `apps/therapist-portal/src`, `apps/worker/src`, `packages` returns
**zero** hits, and there is no `exerciseLibrary` / `ExerciseEntry` identifier in the repo. This feature
starts from nothing.

What exists:

- **Today card (app)** — `apps/mobile/lib/src/features/home/widgets/today_card.dart` (`TodayCard`,
  ConsumerWidget). Renders, in order: the newest active homework line, active reminders, the quote of
  the day, a "Mark complete" action calling `homeworkCompleteProvider.markComplete(id)`, and a
  "See all homework" link to `/homework`. It shows **one** assignment by design; the comment points at
  the homework screen for the full list.
  Data: `apps/mobile/lib/src/features/home/providers/today_card_provider.dart` → `GET /users/me/today`
  (`apps/api/src/routes/users.ts:137`) → `apps/api/src/lib/today-card.ts` (`getTodayCard`), which also
  returns `toolPacePresets` and the playable tool list (`tool_id, label, text, pacePreset`).
- **Homework screen (app)** — `apps/mobile/lib/src/features/homework/homework_screen.dart`
  (+ `homework_provider.dart`, `GET /users/me/homework`). Sections: active, completed, reminders.
  `_ToolChip` (line ~236) is the one place a homework row becomes playable: `playable = toolId != null &&
  breathingTechniqueFor(toolId) != null`, tapping pushes `BreathingScreen(initialToolId: toolId)`.
  **This is the pattern a worksheet assignment should follow** — a `tool_id`-shaped link that the app
  resolves to a real screen.
- **Breathing player** — `apps/mobile/lib/src/features/home/breathing_screen.dart` +
  `breathing_content.dart`.
- **Portal tools page** — `apps/therapist-portal/src/app/clients/[id]/tools/page.tsx` (selects from the
  existing tool registry; no authoring).
- **Router** — `apps/mobile/lib/src/router/router.dart`: `/home`, `/chat`, `/journal`,
  `/journal/history`, `/history`, `/history/:id`, `/progress`, `/appointments`, `/appointments/:id`,
  `/settings`, `/onboarding/*`. No worksheet routes.
- **Bottom nav** — `apps/mobile/lib/src/features/home/widgets/home_bottom_nav.dart`: Home, Chat,
  Journal only.

---

## (d) Scheduler and current email-sending code

**There is no scheduler.** Concretely:

- No `setInterval`, no `node-cron`, no `cron(...)` in `apps/api/src`, `apps/worker/src` or
  `apps/therapist-portal/src`.
- No EventBridge rule, `aws_scheduler_schedule` or EventBridge target in `infrastructure/aws/evia-beta/*.tf`.
  (`infrastructure/aws` contains `sqs.tf` — a queue for the summary worker — and nothing time-based.)
- `Reminder` rows are **pull-only**: read by `GET /users/me/today` and `GET /users/me/homework` and drawn
  in the Today card. Nothing fires them.
- `packages/shared-types/notifications.ts` header comment: *"the reminder sweep (apps/worker) will write
  the same kinds later"* — the sweep is planned, not written.
- `Notification` rows are pull-only: `GET /users/me/notifications`, `/unread-count`,
  `POST /:id/read`, `/read-all` (`apps/api/src/routes/notifications.ts`).
- `Appointment.remind_24h` / `remind_1h` are stored and **not acted on** (schema comment lines 468–470).

**Email exists, but only transactional, never reminders.** Brevo HTTPS API
(`https://api.brevo.com/v3/smtp/email`), duplicated in two apps because they do not share code:

- `apps/therapist-portal/src/lib/email.ts` — `sendInviteEmail`, `sendClientInviteEmail`,
  `sendWaitlistNotification`, `sendAdminTesterRequestEmail`.
- `apps/api/src/lib/email.ts` — `sendInviteEmail`, `sendWaitlistConfirmationEmail`,
  `sendSafetyAlertEmail`, `sendAgeDeclinedEmail`, `formatAlertTimestamp`.
- Both no-op with a `console.warn` when `BREVO_API_KEY` is unset. Callers:
  `therapist-portal/src/server/routers/clients.ts`, `routers/admin.ts`,
  `app/api/waitlist/route.ts`.

No email path mentions reminder or homework.

---

## (e) Where A1 is called on chat input

Chain, in order:

1. `apps/mobile/lib/src/features/chat/chat_screen.dart` → `core/websocket_service.dart` sends a
   `USER_TURN` frame.
2. `apps/api/src/routes/websocket.ts` — `MAX_MESSAGE_LENGTH = 4000` (line 22); validates the frame,
   checks the active session (line 185), length (line 198), rate limit (line 231) and token budget
   (line 281); then line ~306:
   `processTurn(uid, session_id, message.trim(), perceivedIntensity)`.
3. `apps/api/src/pipeline/orchestrator.ts` — `processTurn` (line 61). A1 runs inside `timedA1()`
   (line 113) via `classifySafety()` from `apps/api/src/agents/a1/agent.ts` (line 82), **started in
   parallel with A9-pre and retrieval** (`a1Promise`, line 159) and awaited with `Promise.allSettled`.
   A1's result plus the deterministic crisis screen (`hasCrisisLanguage`, `hasSelfIngestion`,
   `agents/a1/crisis-keywords.ts`) feed `routeTurn` (`agents/a8-router.ts`).
4. Ordering guarantees worth knowing: A1/A9-pre are concurrent, but **routing waits for both**; the
   deterministic floor may only *raise* the state to S4, never lower A1's answer
   (orchestrator lines 204–240); if A1 is unreachable, the turn is served as a governed static
   substitute and A2 is never called; A9-post runs on A2's draft **only** when
   `!a2Fallback && !a9PreBlocked && !a8GroundingDeterministic`, and a `BLOCKED` verdict replaces the
   text with `getSafeFallback(safetyState)` and writes a `GovernanceLog` row.
5. `apps/api/src/pipeline/v2/turn.ts` — `processTurnV2`, gated by `isAgentPipelineV2Enabled(env)`.

**Every other write path is separate from this.** The only inbound sockets that carry free text are the
WebSocket `USER_TURN` and the HTTP routes below. There is no shared middleware that sweeps arbitrary
text through A1.

---

## (f) How A2 coaching for homework is prompted

- Prompt file: `apps/api/src/prompts/a2-okuvu-v2.4.txt`, loaded by `apps/api/src/prompts/index.ts`
  (`A2_PROMPT`, `A2_PROMPT_VERSION` — version string kept in sync with the filename by hand).
- Substitution: `apps/api/src/agents/a2/prompts.ts` → `buildConversationalPrompt()` replaces
  `${homework}`, `${toolkit}`, `${care_plan_focus}`, `${therapist_name}`, `${language_mode}`,
  `${user_memory}`, `${retrieved_context}`, `${safety_state}`, `${session_history_summary}`,
  `${perceived_intensity}`.
- Value of `${homework}`: `apps/api/src/lib/agent-context.ts:146` —
  `homework: activeHomework?.description ?? null`, where `activeHomework` comes from
  `getActiveHomework()` in `apps/api/src/lib/homework.ts` = **the single most recent `active` row**,
  `description` only (`tool_id`/`label` are not passed).
- Prompt guidance: `a2-okuvu-v2.4.txt` §5 "HOMEWORK & THE THERAPIST'S PLAN" (line 176ff) — help the
  client start, break it into the next tiny piece, adapt the practice but never rewrite what the
  therapist assigned, never grade or guilt. §5 also owns the therapist-vs-AI topic split.
- Output signal: A2 returns `homework_referenced: boolean` (schema at line ~499), persisted onto the
  assistant `Turn`.
- A2's prompt is not itself safety-reviewed at build time; A9-post reviews its output per turn.
- `${toolkit}` is **always `[]`** in production (orchestrator comment, ~line 700): "tools this therapist
  selected for this client" has no data source yet.

---

## (g) Where care plans CP1/CP2/CP3 appear in client-facing UI

- `enum CarePlan { CP1 CP2 CP3 }` — `schema.prisma:645`.
- Client-facing label map: `apps/mobile/lib/src/features/intake/care_plan_provider.dart` —
  `_focusAreaNameForId`: `CP1 → 'Anxiety & Worry'`, `CP2 → 'Low Mood'`, `CP3 → 'Stress & Burnout'`,
  default `'General Support'`. Consumed by `apps/mobile/lib/src/features/intake/cold_start_screen.dart`;
  exposed as `userCarePlanProvider` via `core/providers.dart`.
- Source: `GET /users/me/context` (`apps/api/src/routes/users.ts:125`) returns
  `care_plan: { care_plan_id, assignment_state }` + `engagement` (streaks).
- Also client-facing but not labelled by CP: the quote of the day is chosen **per care plan** —
  `apps/api/src/lib/quote-of-day.ts` has a `CP1`/`CP2`/`CP3` list.
- Server-side use: `orchestrator.ts` passes `carePlan` to `handleTurn`/A2 and A9-post;
  `ClinicalConfig.care_plan_focus` is a free-text focus string (separate from the enum).
- Portal-only (not client-facing): `apps/therapist-portal/src/app/clients/[id]/page.tsx`
  `CARE_PLAN_NAMES` = `CP1 'Anxiety & Worry'`, **`CP2 'Low Mood & Depression'`**, `CP3 'Stress & Burnout'`.

---

## (h) The client chat-access consent flow

Two-sided, per therapist–client relationship, stored on `TherapistClient`.

1. **Therapist asks** — `apps/therapist-portal/src/server/routers/clients.ts:662` `requestChatAccess`:
   sets `chat_access_requested_at` (idempotent, 30-day cap on repeat asks), writes
   `logClinicalAccess(..., 'REQUEST_CHAT_ACCESS')`. Tests:
   `server/__tests__/clients-chat-access.test.ts`, `authorization.test.ts`.
2. **Client answers** — `apps/mobile/lib/src/features/home/widgets/pending_chat_access_banner.dart`
   (shown on Home while a request is unanswered) → `chatAccessRequestProvider` →
   `PATCH /users/me/chat-access`, `apps/api/src/routes/users.ts:207`.
   Body `{ therapist_id: string, granted: boolean }`. Requires a real `TherapistClient` row (404
   otherwise). On grant: `chat_access_granted = true`, `chat_access_requested_at = null`,
   `chat_access_granted_at = now`, `chat_access_closed_at = null`. On deny/revoke:
   `chat_access_granted = false`, `chat_access_requested_at = null`, `chat_access_closed_at = now`.
3. **What it unlocks** — the **30-day read window measured from `chat_access_granted_at`**
   (`clients.ts#chatAccessWindow`), half-open `[granted_at, min(granted_at+30d, closed_at))`. Enforced
   on the Report Card, Session Prep, `clients.detail`'s `careReviewFlagged`, and the read-only
   conversation view (`/clients/[id]/conversation`). The link on the client page is "a doorway, not a
   permission" — the page re-checks server-side.
4. **Defaults / gaps** — `chat_access_granted` defaults **false** (opt-in). `admin.assignClient`'s
   Add-Client flow can still set it as a therapist attestation of out-of-band consent. There is a
   separate, unrelated onboarding consent screen (`POST /users/me/consent`, `users.ts:25`) writing
   `EngagementProfile.consent_1..4` (safety monitoring, mood inference, assessment, emergency contact)
   — `consent_1` must be `true`.

This is the **only** per-item-ish sharing gate in the product, and it is per-relationship, not per-item.
Nothing today lets a client share one specific row.

---

## (i) Existing app features and how each stores data

### The four breathing exercises

`apps/mobile/lib/src/features/home/breathing_content.dart` — `BreathingTechnique` (line 47) with
`toolId`; four instances:

| toolId | line |
|---|---|
| `box_breathing` | 88 |
| `physiological_sigh` | 122 |
| `extended_exhale` | 160 |
| `humming_breath` | 192 |

(`guided_breathing` and `grounding_5431` exist as `ToolRegistryEntry` rows but are not breathing
techniques in this file; `guided_breathing` was retired as "essentially the same exercise"). Lookup:
`breathingTechniqueFor(String toolId)` (line 227). Player: `breathing_screen.dart`; visuals in
`features/chat/widgets/breathing_visuals.dart`; pace clamping in
`features/chat/models/breathing_presets.dart`.

**Storage:** the only durable state is the client's pace preset —
`PATCH`-style write into `UserToolPreference` (`pace_preset`) with `@@unique([user_id, tool_id])`,
read back through `GET /users/me/today`'s `toolPacePresets`. **No session is logged**: no start/end row,
no count, no duration. Breathing practice is invisible to the therapist and to analytics.

### The journal

Screens: `features/journal/journal_screen.dart` (compose), `journal_list_screen.dart` (history),
`journal_entry.dart` (model), `journal_provider.dart` (state), `journal_prompt_service.dart` (J2 prompt).
Router paths `/journal`, `/journal/history`.

**Storage:** server-side only, `JournalEntry` table. `POST /journal` (`apps/api/src/routes/journal.ts:21`)
validates and writes; `GET /journal` (line 112) reads; `GET /journal/prompts` (line 167) returns the
curated library; `POST /journal/prompt` (line 200) generates one AI prompt via
`agents/journal-prompt/agent.ts` (`generateJournalPrompt`, fails closed to a static prompt).
Limits: `content ≤ 10000` chars, `emotion` one of 8 fixed strings, `intensity` 1–5, intensity requires
an emotion, emotion/intensity optional. **No local persistence of entry content** — no `sqflite`,
`drift`, `hive` or `isar` in `pubspec.yaml`; the only `SharedPreferences` key on this screen is
`journal_privacy_notice_dismissed` (a boolean). So a write that fails to reach the API is lost.

Privacy copy precedent (relevant to rule 4): the compose screen shows a one-time notice —
**"Your journal is private. OKUVU doesn't read it and your therapist can't see it."**
(`journal_screen.dart:263`, dismissed via that boolean). That is the established promise language for a
private client-written surface, and the natural template for the worksheet entry notice — but see C3 for
the tension it creates.

### The mood check-in

Widget: `apps/mobile/lib/src/features/home/widgets/mood_check_in.dart` (five faces; mood ≥ 4 opens
support copy). Tail: `moodCheckinProvider.checkIn(mood)`.

**Storage:** `MoodLog` via `POST /progress/mood/checkin` (`apps/api/src/routes/progress.ts:22`,
`mood_value` integer 1–5) → `lib/progress.ts#recordMoodCheckin`; history from `GET /progress/mood?days=`
(default 14). One row per IST calendar date: `@@unique([user_id, date_ist])`, `date_ist @db.Date`,
`source` default `'user_input'`. Free text: none.

### The chat

Screen: `features/chat/chat_screen.dart`; transport `core/websocket_service.dart`; frames modelled in
`features/chat/models/agent_turn_frame.dart`, `chat_state.dart`, `chat_message.dart`.

**Storage:** server-side only. `SessionLog` + `Turn` rows written by `processTurn`
(`orchestrator.ts` — user turn and assistant turn created in one `$transaction`; assistant turn carries
`is_a9_fallback`, `fallback_source`, `model_version`, `prompt_version`, `taper_state`,
`closure_offered`, `frustration_event`, `homework_referenced`, `therapist_referral`).
Session count / summaries via `SessionSummary` (written by `apps/worker`), rolling memory via
`UserMemory` (memory-extraction worker), retrieval via `SessionSummary` embeddings. The app keeps
**no local transcript database** — reopening a session re-fetches (`/history`, `/history/:id`).
`MAX_MESSAGE_LENGTH` 4000 both sides.

### Anything else a worksheet entry might be confused with

- `apps/therapist-portal/src/app/clients/[id]/notes/page.tsx` + `routers/notes.ts` — therapist notes
  (`TherapistNote`), therapist → client direction.
- `routers/report-card.ts` — homework progress per session, derived from `SessionSummary.summary_text`
  JSON (`homework_progress`), plus `homeworkCounts` and `UserMemory.homework_track`. Gated on the
  chat-access window.

---

## Conflicts and gaps against the standing rules

**C1 — Rule 2 names a "scheduler and email reminders" that does not exist.**
There is no cron/EventBridge/worker sweep and no reminder email (§d). `Reminder` rows are stored and
pulled, never fired. Consequence: a worksheet reminder cannot "reuse the scheduler" because there is
nothing to reuse — either the reminder sweep gets built as part of this work (and then it should serve
homework, breathing and worksheet reminders from the same `Reminder` table, not a worksheet-specific
timer), or worksheet reminders ship as inbox rows with no delivery, like homework today. **Decision
needed before Command 6-ish; I will default to "no new delivery mechanism" unless told otherwise.**

**C2 — Rule 2 names "Worker 05 homework_progress" as a separate component; it is not one.**
There is no Worker 05 service. The `homework_progress` block is part of the session-summary prompt in
`apps/worker/src/lib/summary.ts` (lines 52, 99–106, 175), consumed by
`therapist-portal/src/server/routers/report-card.ts:173`. It *reports* what the client said about
homework; it does not track assignments. Reusing it means extending that summary schema block, not
calling a service.

**C3 — Rule 3 is already violated by the journal, and the worksheet must not copy it.**
`POST /journal` (`routes/journal.ts:21`) validates shape and writes `JournalEntry` — **no A1, no
A9-pre, nothing.** Journal text is the single largest body of user-written free text in the product and
it never reaches the safety pipeline. `/journal/prompt`'s output (`generateJournalPrompt`) is
model-generated client-facing copy that is **not** A9-post reviewed either; it fails closed to a static
prompt but is otherwise ungoverned.
Also: therapist-authored text that reaches the client unreviewed — `Homework.description` is rendered
verbatim in the app and injected into A2's `${homework}` (§b, §f) with no A1/A9 pass. That is a
prompt-injection surface and, if the therapist writes something clinical or diagnostic, a rule-5
surface too.
**Implication for this feature:** worksheet definitions and client answers must call A1 → A9-pre
directly (as `processTurn` does), and any AI-generated worksheet prompt/reflection must go through
A9-post. There is no ready-made "review this blob" helper — `processTurn` owns that logic inline, so
either a small shared `reviewClientText()` seam is extracted (preferred, and it would let the journal
adopt it later) or the worksheet route re-implements the sequence (worse, and exactly the parallel
implementation rule 1 forbids). Flagging as the first design decision after Command 0.

There is a second-order tension here worth naming, because rule 4 and rule 3 pull in opposite directions
on the same screen. The journal tells the client *"OKUVU doesn't read it and your therapist can't see
it."* If a worksheet entry is scanned by A1, "we don't read it" needs to mean "no human reads it and no
model keeps it", not "no safety check runs" — the honest formulation is that the text is screened
automatically for the client's own safety and shown to nobody. That wording decision belongs with the
same clinical sign-off that governs S3/S4 copy, not to the build.

**C4 — Rule 4 has no existing per-item sharing primitive.**
The only sharing control is `TherapistClient.chat_access_granted` + the 30-day window, which is
per-relationship and time-boxed (§h). `Homework` has no visibility column. A worksheet entry therefore
needs a new per-entry share state (owner-approved, revocable, item-scoped) — genuinely new columns, not
a parallel table. It must also be enforced on **every** therapist read path that could surface it:
report card, session prep, `clients.detail`, conversation view, and any future export. Two specific
traps: (i) `reportCard` returns early with `{ granted: false }` unless `chat_access_granted` — so an
entry shared *without* chat access must not be routed through that gate, and chat access must not imply
worksheet visibility; (ii) `isBypassEnabled()` (`server/trpc.ts:7`, keyed on
`LOCAL_DEV_BYPASS_AUTH === 'true'`) short-circuits `reportCard` with `granted: true` and empty arrays
today — if the local bypass is ever pointed at real data it becomes a sharing bypass.

**C5 — Rule 1 vs. `ToolRegistryEntry`: risk of a second exercise catalogue.**
Nothing named worksheet/exercise-library exists, so the entries are new. But `ToolRegistryEntry` is
already "the canonical list of approved exercises, with canonical one-line copy, addressable by
`tool_id`, assignable via `Homework.tool_id`, playable via `breathingTechniqueFor()`". A worksheet
library that defines its own exercise rows would be a second catalogue with its own copy, diverging from
clinical sign-off. **Proposal to confirm at Command 1:** worksheets are a *new* content type (client
writes answers) but must reference `ToolRegistryEntry.tool_id` rather than restate exercise copy, and
the Today-card/homework integration must reuse `Homework.tool_id` semantics — no new
`WorksheetAssignment` table duplicating `Homework`.

**C6 — Rule 5: "no diagnosis language in client-facing copy" is currently clean, but one label is adjacent.**
No PHQ-9 / GAD-7 / PSS / standardised measure exists anywhere in `apps` or `packages`. Client-facing
care-plan labels are `Anxiety & Worry`, `Low Mood`, `Stress & Burnout` — acceptable. The **portal-only**
map at `clients/[id]/page.tsx` renders CP2 as `Low Mood & Depression`; it is not client-facing, but any
copy lifted from the portal into the app would cross the line. A2's prompt already carries the right
precedent (line ~520: `primary_emotion` "Never a clinical label").

**C7 — Branch/process note.** Rule 7 assumes a single working checkout. In practice
`/opt/data/okuvu/ts` is on `feat/client-inbox` with ~45 modified and untracked files of unrelated
in-progress work (A2 prompt v2.4, campaign harness, today-card WIP, portal `clients.ts`). Checking out
`feature/exercise-library` there would have refused (two dirty files overlap). So the feature branch
lives in a worktree at `/opt/data/okuvu/exercise-lib-wt` with `node_modules` symlinked to the primary
checkout; that tree is untouched. **Two consequences to accept explicitly:** (i) the base is
`fffa30f`, not `main` — deliberate, see the header; (ii) the disk is at 99% (≈1 GB free), so no second
`pnpm install` and no Gradle/Android build from this worktree without freeing space first.

**C8 — Scope conflict to keep visible.** Rule 2 says reuse the Today card, and the Today card today
renders exactly one active homework line. Adding a second "worksheet" slot must not turn the card into
a list, and must not duplicate the homework row when a worksheet *is* a homework assignment.

---

## Quick reference: files this feature will almost certainly touch

```
packages/prisma/schema.prisma                                 new worksheet entry model + share column
packages/prisma/migrations/<ts>_exercise_library/             migration
packages/shared-types/                                        DTOs + notification copy (notifications.ts)
apps/api/src/routes/                                          new worksheet route(s); register in index.ts
apps/api/src/pipeline/orchestrator.ts                         extract/govern the text-review seam (C3)
apps/api/src/lib/today-card.ts                                worksheet slot (C8)
apps/api/src/lib/agent-context.ts                             ${homework}/worksheet context for A2
apps/mobile/lib/src/features/homework/                        entry point, mirrors _ToolChip pattern
apps/mobile/lib/src/features/                                 new worksheet screens; router.dart
apps/therapist-portal/src/server/routers/                     shared-entry visibility (C4)
apps/therapist-portal/src/server/routers/report-card.ts       must respect per-entry sharing
```
