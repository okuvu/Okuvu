# Anxiety & Worry worksheets — nine drafts, 24 November 2026

**Status: DRAFT. Nothing in this batch is approved, nothing is merged, and no app
or image was built.** Every row is `status: 'draft'`: no card in a client's
Library, no direct open (404 as an unknown id), no assignment from the portal. A
therapist can preview each one. The owner's Step 0 rules apply unchanged.

## What was built

Nine catalogue rows in `packages/shared-types/worksheets/anxiety-worry.ts`, all
labelled `anxiety_worry`, all draft:

| # | Worksheet | Mode | Load | Section | Shape |
|---|---|---|---|---|---|
| 1 | Worry time | assigned | light | untangle_thoughts | daily time, length, parked list with a per-worry review, closing reflection |
| 2 | Brain-dump | open | light | untangle_thoughts | one long answer (typed or spoken), then Save it / Let it go |
| 3 | Unhooking from a thought | assigned | light | untangle_thoughts | the thought, 0–100 belief, the read-back, 0–100 again |
| 4 | SOS calm | open | light | calm_my_body | one card: the long-out-breath exercise, then grounding |
| 5 | Sitting with not knowing | assigned | light | untangle_thoughts | what is unknown, 0–10, one small way, 0–10 again |
| 6 | Big day planner | open | light | do_what_matters | date, prep steps with dates, on-the-day list, one sentence |
| 7 | Social situation prep | assigned | light | do_what_matters | the situation, the prediction, 0–10, one small try, then the outcome |
| 8 | Pressure map | assigned | light | people_boundaries | one row per area: who expects what, 0–10, whose it is |
| 9 | Exposure ladder | **therapist-only** | demanding | do_what_matters | built in the portal; client sees unlocked steps only |

Four rows reuse an existing placeholder id rather than creating a duplicate:
`ws_unhooking`, `ws_exposure_ladder`, `ws_exam_career_pressure` (now Big day
planner) and `ws_family_expectations` (now Pressure map). The applied seed is
byte-identical; a new migration upgrades those four in place.

### The one new piece: `echo`

Unhooking needs the client's own thought shown back inside two fixed sentences
("I'm having the thought that …", "I notice I'm having the thought that …"). That
is a new piece type (`echo`) with `fromField` and `frames`, not a hard-coded
screen:

- the validator refuses a frame with no `{answer}` (it would silently drop the
  client's words), a `fromField` that is not an earlier text piece, and a
  required echo;
- the client's words are substituted verbatim. Nothing is summarised, softened
  or corrected — that is the whole exercise;
- the app renders it (Dart spec + runner), and the portal preview shows the
  frames with a gap where the words go.

### SOS calm

The breathing exercise chosen is **`extended_exhale`**: it is the one of the four
built around a lengthened out-breath, which is what the brief asks for. The four
exercises are untouched. The card opens a small screen that hands over to the
existing Breathing player (told which technique) and then the existing
`grounding_5431` screen — nothing is copied, so a change to either exercise
reaches this path too.

### Worry time: the parked list and the reminder

Beyond the body, two tables and their routes:

- `WorryTimeSetting` — `time_ist` ("HH:MM", CHECK-constrained), `minutes`
  (5–60), `active`, `last_reminded_on`.
- `WorryParked` — the client's own words, `status` in `parked | still |
  released` (CHECK), `resolved_at`.

Routes: `GET /worry-time`, `PUT /worry-time/settings`, `POST
/worry-time/parked` (screened by the shared safety check on the way in, flag
`worry_parked`, pointer only), `POST /worry-time/parked/:id/resolve`, `DELETE
/worry-time/parked/:id`. The reminder sender is `POST
/internal/worry-time/reminders`, behind the same shared secret as the push hop
and inert (503) when the secret is unset. It sends at most one email per IST day,
and only after the client's chosen time — a late sweep catches the day up rather
than skipping it.

### Exposure ladder

- `ExposureStep` (label, therapist's 0–100 difficulty, position, `unlocked_at`)
  and `ExposureStepRun` (the client's `before` / `after`, both CHECK 0–100).
- Portal router `exposure` (list / add / update / setUnlocked / remove), each
  gated by `assertClientAssigned`. This is the writer the client's read guard
  needs: without it the ladder would be empty forever.
- Client route `GET /exposure-ladder` returns **unlocked steps only**; `POST
  /exposure-ladder/:stepId/run` answers 404 for a locked or someone-else's step,
  exactly as an unknown id.
- A `before` of 80 or more returns `pause: true`, the pause line and the existing
  grounding exercise. The run is still recorded: a pause is not a refusal.

## Verification (real runs, this branch)

- `packages/shared-types`: **173 tests** pass (162 + 11 new), tsc clean.
- `apps/api`: **2142 tests** pass across 122 files; tsc clean against a client
  generated from this branch's schema, then the shared client restored and the
  trunk typechecked clean to prove the restore.
- `apps/therapist-portal`: **441 tests** pass; tsc clean.
- `apps/mobile`: **527 tests** pass; `flutter analyze` clean.
- Migrations: the new seed and table migrations were generated, and the four
  earlier migrations are byte-identical (`git diff --stat` empty). The table
  migration was **not** applied to a live Postgres — there is none in this
  session. It was checked against the schema only.

## What this step did NOT do, on purpose

- No client screen for worry time (the parked list and the review) or for the
  exposure ladder. The tables, routes and validators exist; the Flutter screens
  do not.
- No portal page or tab for building the ladder. The tRPC router exists and is
  covered by the client route's contract; the page is not built.
- Nothing calls the reminder sweep on a schedule: there is no scheduler in this
  deployment. The endpoint and sender exist, the trigger does not.
- SOS calm is not on the Home card or in the chat yet. The card is draft and
  invisible until approved, so nothing can reach the gap today.
- No Hinglish. Every row is English-only, and the translation gate stays per row
  for the owner to release.

## Known gaps / awaiting the owner

1. **Approval.** Nothing flips to `approved` until the owner says the wording is
   approved, worksheet by worksheet. The draft copy is in
   `23-draft-stress-burnout-copy.md` (regenerated to cover this batch) and in the
   chat report.
2. **Two pieces of copy written for this batch and awaiting approval:**
   - the worry-time reminder email (`lib/email.ts`, `sendWorryTimeEmail`);
   - the exposure pause line (`EXPOSURE_PAUSE_MESSAGE` in
     `packages/shared-types/safety.ts`).
3. **Pressure map is modelled as one line per area** (area, who expects what,
   0–10, whose it mostly is) rather than a checklist that expands per ticked
   area. Same clinical content, one list the client keeps. If the owner wants the
   checklist-then-expand shape, that is a new grouped piece.
4. **The exposure ladder has no therapist column.** Any therapist currently
   assigned to the client can build it, which matches the safety plan's rule;
   worth confirming.
