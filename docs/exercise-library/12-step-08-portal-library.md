# Step 8 — finding and assigning exercises in the portal

Branch `feature/exercise-library`, worktree `/opt/data/okuvu/exercise-lib-wt`.
Commits for this step are on that branch only; nothing merged, no APK.

Owner's instruction, 9 Nov 2026. Two parts: (a) one correction to Step 7, (b) the
therapist-facing half of the Library.

## 0. The Step 7 correction — appointment email

The one-email-a-day cap no longer covers appointment email. It now applies only to
the "Something new in OKUVU" update mail (`homework_assigned`,
`treasure_note_waiting`).

- Confirmations, reschedules and cancellations always send.
- They are also not behind the update-email preference (`update_emails_enabled`):
  that switch is what Settings shows for the generic updates, and a cancellation
  that failed it would be a client turning up for a session that is not happening.
- Their own switch (`appointment_reminders_enabled`) still gates them, at write
  time, rows and email both — unchanged from Step 7.
- `claimDailyEmail` is not called on the appointment path at all, so the day's
  slot is neither consumed nor consulted.

`apps/therapist-portal/src/server/notifications.ts`, with three tests in
`src/__tests__/client-notification-email.test.ts`.

## 1. Therapist Library

`/worksheets` is now titled **Library** and has the five filters the owner named:
Library section, therapy type, who can open it, how demanding, how long. Plus a
name search, because a list of 16 grows. Filtering is client-side over
`worksheets.list`; the catalogue is small and a round trip per keystroke would
feel broken.

Every card shows the therapist-only columns it already showed (modality, access,
load, minutes, status, validity problems) and now also the **"For therapists"
note** from the catalogue row. Preview (existing `/worksheets/[toolId]`) is
unchanged and still renders the client's own view, piece by piece.

The client never sees any of these columns; that is unchanged from Step 3 and
re-asserted in the api tests.

## 2. Assigning

`homework.assign` grew, additively. Typed homework is the same call it always was
(one test keeps it that way: no `tool_id`, no `frequency`, no `personal_note`).

| field | column | notes |
|---|---|---|
| exercise | `tool_id` | must be **approved**; placeholder and retired rows are refused |
| personal line | `personal_note` | 500 chars, shown to the client where the worksheet marks `therapistNote` |
| how often | `frequency` | same vocabulary as `Reminder.frequency`; `once` = one-off |
| due | `due_at` | date input → start of that day |
| linked goal | `therapy_goal` | **copied** from the goal row, not joined |
| private note | `therapist_private_note` | **new column**; never serialised to the client |

- Only approved exercises: checked against `ToolRegistryEntry.status` and, where
  the id is in the catalogue, against `entryById` as well, so a `placeholder`
  cannot be assigned even if its row says otherwise.
- `description` is now optional in the input. For an exercise assignment it falls
  back to the personal line, then the exercise's own label — never to the private
  note.
- A goal belonging to another therapist or another client is `NOT_FOUND`; the id
  cannot be probed.
- The private note is on the assignment and in the portal history (labelled
  "Only you"). It is not in the notification row, which is the only copy the
  client reads, and there is a test that walks the whole notification payload
  looking for it.

**Goals.** `ClientGoal` is new (id, therapist, client, text, status
active/achieved/dropped). The Clinical Reasoning note is a free-text blob, so
there was nothing to point a select at; goals are short rows, written on the
client's **Clinical notes** page ("Working goals"), and never shown to a client.

## 3. Sets

`ExerciseSet` + `ExerciseSetItem`, scoped to `therapist_id` everywhere: a set is
visible only to the therapist who made it, and it is not tied to a client — the
same set can be assigned to anyone on the roster.

- Create: name + 1–20 exercises, each validated as approved, duplicates collapsed.
- Assign: one `Homework` row per exercise, so each has its own completion, its own
  Today-card turn and its own client-facing label. One notification row per
  assignment (the client should see three things if three were assigned); email is
  at most one, because the daily cap silences the rest.
- Assign re-validates every member and **fails the whole set** if any is no longer
  approved, rather than half-assigning something the therapist cannot see the
  shape of.
- Delete is an ownership-scoped `deleteMany`.

## 4. The client's side of the personal line

`GET /library/:toolId` now returns `personalNote` — the client's own active
assignment's line, or null. The client app (`LibraryEntry.personalNote`) passes it
to the runner, which renders it only under the piece the worksheet marks
`therapistNote` (that mechanism existed; nothing read it until now).

`therapist_private_note` is **not selected** by that route, so it cannot be sent by
mistake — and the api test returns a row containing both columns and asserts the
private text is absent from the response.

## 5. Erasure

`ClientGoal` has a FK to `User`, so the existing erasure-coverage test failed the
moment the model existed — correctly. It is now erased explicitly in
`lib/account.ts` and listed in `SUBJECT_TABLES`, and the schema-derived count in
`account-delete.test.ts` went 26 → 27.

## 6. Checks run

All suites, not just touched files:

| suite | result |
|---|---|
| api | **1840 passed** in 103 files |
| therapist portal | **403 passed** in 37 files (typecheck clean) |
| shared types | 88 passed |
| worker | 95 passed |
| Flutter app | analyzer clean; full suite result recorded in the step report |

The owner's four:

1. **only approved exercises can be assigned** — draft and retired rows each
   refused, nothing written; a set cannot be built or assigned around one.
2. **the personal line appears in the right place for the client** — stored on the
   assignment, returned by `GET /library/:toolId`, rendered only under the field
   marked `therapistNote` and not carried to the next piece (Dart widget test).
3. **the private note never reaches the client** — not in the library response, not
   in the notification payload, not in any client select.
4. **a set creates each assignment correctly, with one email at most** — three
   exercises → three homework rows and three inbox rows, one per assignment; the
   email cap is proved separately in the notification tests (a second update email
   the same day sends nothing).

Plus the Step 7 correction: a cancellation still sends when the day's update email
is used and when the client paused update emails.

## 7. Still owed / carried forward

- **No database applied on this machine** (no Postgres, no Docker). The migration
  was validated (`prisma validate`) and diffed from an empty schema; every new
  table, index and foreign key in that diff matches this migration statement for
  statement. It has **not** been run against a live database. That keeps the Step
  13 gate standing: every migration, on a real Postgres, before any APK.
- The becoming spiral, old summaries, and the Step 12 write-up items are unchanged
  from earlier steps.
- Filter state is not remembered between visits; a therapist who prefers "CBT"
  picks it again each time. Not asked for, noted for later.
