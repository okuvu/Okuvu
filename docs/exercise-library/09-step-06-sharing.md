# Step 6 — privacy and sharing in the app

9 November 2026. Branch `feature/exercise-library`. Includes the owner's Step 5
corrections.

Nothing is merged; no APK.

## 1. Step 5 corrections, done first

**The Today card.** One main item again, then two quiet lines under it:

- the next due assignment, whether it is a worksheet, an exercise, or homework
  the therapist typed in their own words (`TodayNextItem.kind =
  'text_homework'`, no tool id, no minutes);
- the reminder line (up to two, smaller), which is the only way a reminder
  reaches a client until push exists;
- the quote, smaller and italic.

The card stays one item. It still has no streak, no counter, no missed-day
state and no red badge.

**Repeating assignments.** `Homework.frequency` already had the vocabulary
(`once`, `once_daily`, `twice_daily`, `thrice_daily`, `as_needed`). A repeating
assignment is now done, not closed: `last_completed_at` is set, `due_at` moves
to the next IST day at the therapist's reminder time, and the row stays
`active`. It is hidden for the rest of that IST day and returns on its due day.
A one-off closes as before. One function (`buildCompletionWrite`) makes that
decision for both the Mark done button and a finished worksheet, so the two
cannot disagree. Every completion is also a `HomeworkCompletion` row, because a
repeating assignment is done many times and a single timestamp is not a
history.

**The becoming spiral.** Not built, as instructed. It is recorded for the Step
12 write-up. The data it needs keeps being saved: every finished worksheet
stores its before/after ratings, its "This helped" answer, and its completion
time.

## 2. Privacy and sharing

### Labels

Every journal entry, worksheet answer and Treasure Box note carries exactly one
of two labels: **Private** or **Shared with my therapist**. Both the api and the
app speak from the same constants (`packages/shared-types/sharing.ts`), and a
test pins those strings to the approved document.

### Starting state

New journal entries, worksheet answers and Treasure notes are created with
`shared_with_therapist = false`. The migration adds the column to
`JournalEntry` with `DEFAULT false`, so every existing entry is Private the
moment it lands. Nothing was backfilled, and nothing starts shared.

### The switch

One route, `POST /sharing`, takes `{ kind, id, shared }` for the three
shareable kinds. It is the only write path for the flag — chat access is never
reused for it, and a shared item is visible without chat access (owner decision
6). Sharing sets `shared_at`; stopping sets `unshared_at` and the boolean false
in the same statement. 404 for a row that is not the caller's, so the route
cannot be used to probe ids.

The client sees the switch on each journal entry, on the worksheet closing
screen (as the share question), and on each Treasure Box note.

### First share

The first time a client shares anything in this install, the approved
confirmation appears with Share and Cancel, and nothing is written until Share
is tapped. After that the switch acts immediately. Stopping a share asks
nothing: consent was for sharing.

### After an assigned worksheet

"Share this with your therapist?" with **Share** and **Keep private**, the same
size, neither chosen in advance (`barrierDismissible: false`, so a tap outside
cannot decide for them). Not asked after a crisis or an unscreened save — help
comes first.

### Stopping

The portal reads `shared_with_therapist = true` in the WHERE clause on every
query. Stopping the share updates that row, so the item is absent from the
therapist's next read; there is no copy to chase. The read is also gated on a
live `TherapistClient` link, so a former therapist loses even what was shared
while they were linked, and each read writes one `ClinicalAccessLog` row that
names no text.

### The portal side

New tab **Shared with me** on the client page
(`/clients/[id]/shared`), backed by `shared.list`. It is the only place in the
portal that can read client writing; Report Card and Session Prep still read
chat only, under the client's approval and the 30-day window (Step 4). So
"anything not shared never appears in summaries, the Report Card or session
preparation" holds by construction: those surfaces never read these tables.

## 3. My toolkit and Past me

**My toolkit** (`GET /toolkit`, Toolkit tab): exercises the client marked
"This helped", grouped by worksheet, with how many times. No totals, no streak,
nothing removed if an exercise stops working.

**Past me** (`GET /past-me`): journal entries and worksheet answers in one
timeline, newest first, filterable by exercise or by journal. Each row carries
its Private / Shared label and its before/after ratings when the client gave
them. Nothing is scored and no improvement is claimed on their behalf.

## 4. Your data

Settings → Your data (`/settings/my-data`):

- **Download** — `GET /me/export` returns the client's own journal entries,
  worksheet answers and Treasure Box notes as one JSON document, handed to the
  phone's share sheet. A phone has no Downloads folder a client can find from
  inside an app, so "download" means "take a copy you can save or send".
- **Delete** — per item, from the journal list, Past me, and the Treasure Box
  note list. `DELETE /me/items/:kind/:id` deletes the client's own row. Because
  the portal reads that same row, deleting removes it everywhere at once.
  Safety flags are kept: they hold no text, and "a check fired here" is an
  incident record, not the client's writing.

The Settings row that used to say the journal is "Private (never shared)" now
says "Private, until you share", which is what the product actually does.

## 5. What was checked

Test counts, all run in this worktree on 9 November 2026:

- api: **1815 tests / 100 files**
- shared-types: **88 tests / 8 files**
- therapist-portal: **364 tests / 33 files**
- worker: **95 tests / 8 files**
- mobile: **404 tests**, `flutter analyze` clean

The four checks the owner named:

1. **Everything starts private.** Schema defaults are false on all three
   surfaces; the migration adds the journal column with `DEFAULT false`; a new
   journal entry answers `shared: false, shareLabel: 'Private'`; the journal
   list renders Private before any share.
2. **Sharing and stopping work straight away.** `sharing.test.ts` asserts the
   lookup and the single UPDATE for both directions, including that stopping
   sets the boolean false in the row the portal reads. `shared-router.test.ts`
   asserts the portal's every query carries `shared_with_therapist: true`.
3. **Deleting removes it everywhere.** `DELETE` is scoped to
   `{ id, user_id }`; someone else's id is a 404 and deletes nothing; the portal
   reads the same row, so no second cleanup exists to go stale.
4. **Nothing private reaches the portal.** The portal router puts the shared
   flag in every WHERE clause; a dead link reads nothing even when rows are
   shared; the read is access-logged without text.

Also re-verified from the earlier steps, because this work touched the same
write paths: crisis words in a worksheet answer, a journal entry or a Treasure
Box note still save the text, raise the help card, flag without content and send
the content-free therapist alert; a demanding worksheet answered 8/10 still
refuses with the approved calming-first copy; the safety plan card is absent
until a plan exists.

Step 5 corrections specifically: typed homework appears as the one card item
with no minutes; a repeating assignment returns `repeats: true` with a next due
date and stays `active`; a one-off closes; the Today card query excludes
anything completed today in IST; reminders and the quote render under the item.

## 6. Gaps and decisions carried forward

1. **The database has not been applied to a live Postgres on this machine** —
   there is no database and no Docker here. `prisma validate` accepts the
   schema, and `migrate diff --from-empty --to-schema` renders the same table,
   three indexes and two cascading foreign keys as the migration file. The
   apply-and-diff run belongs with the deploy. Recorded again for Step 13.
2. **Step 13 gate.** Before any APK, every migration from Steps 1–6 must be
   applied to a real database and checked. If that cannot be done here, Step 13
   stops and says exactly what is needed (a Postgres instance — local Docker or
   a reachable test database — plus the `DATABASE_URL` to reach it).
3. **The becoming spiral does not exist.** Not built. Data for it is saved.
   To be listed in the Step 12 write-up rather than invented here.
4. **Old summaries are untouched.** Anything written during a crisis before
   Step 4 may still sit in an old summary. This is a decision, not an omission,
   and it belongs in the Step 12 write-up.
5. **The Treasure Box is still read-only.** Notes appear with their labels and
   share switches (so Step 6's rule holds on that surface), but adding,
   collections and pinning arrive in 6A.
6. **No share email.** The approved therapist email copy exists ("You have
   [number] new shared entries or notes…") but the owner did not ask for it in
   this step, so nothing sends. Noted so it is not mistaken for missing copy.
