# Step 16 — the Stress & Burnout worksheets, as drafts

Status: **built and verified, nothing approved or switched on.** Branch
`feat/worksheet-rules`, nothing merged, no APK, no deploy.

The owner's brief of 24 November 2026 (second message): ten worksheets labelled
Stress & Burnout, following the Step 0 rules — hidden until approved, safety
screening on, draft wording sent for review, S for self-serve and A for
therapist-assigned, low load unless stated.

Copy for review is `23-draft-stress-burnout-copy.md`, generated from the
catalogue so it cannot drift from what the app would show.

## The ten rows

| # | Worksheet | `tool_id` | Opens | Load | Minutes | Deeper screen |
|---|---|---|---|---|---|---|
| 1 | What's on my plate | `ws_whats_on_my_plate` | S | light | 5 | no |
| 2 | Basics check | `ws_basics_check` | S | light | 3 | no |
| 3 | Rest break | `ws_rest_break` | S | light | 5 | no |
| 4 | Boundary planner | `ws_boundary_planner` | A | light | 10 | no |
| 5 | Priority sorter | `ws_priority_sorter` | A | light | 5 | no |
| 6 | Doomscroll log | `ws_scrolling_log` | S | light | 3 | **yes** |
| 7 | Weekly load check | `ws_weekly_load_check` | A | light | 5 | no |
| 8 | Unsent letter | `ws_unsent_letter` | A | **demanding** | 15 | **yes** |
| 9 | Weighing it up | `ws_pros_cons_change` | A | light | 10 | no |
| 10 | Caring load check | `ws_caring_load_check` | A | light | 5 | no |

Four of them were already placeholders in the applied seed, so they keep their
ids and the row is upgraded in place rather than renamed later: Boundary
planner (`ws_boundary_planner`), Unsent letter (`ws_unsent_letter`), Scrolling
log → **Doomscroll log** (`ws_scrolling_log`), Pros and cons of change →
**Weighing it up** (`ws_pros_cons_change`). The other six are new ids.

All ten carry the `stress_burnout` care-plan label. None carries Hinglish: the
English is not approved yet, so there is nothing to translate.

## Rule 2 — switched off, by construction

- Every row is `status: 'draft'`, written explicitly in the seed SQL rather than
  left to a column default.
- A draft is not in the client Library (the query filters `status = 'approved'`),
  cannot be opened (`GET /library/:id` and `POST /worksheets/:id` both answer
  `404`, exactly as an unknown id does), and cannot be assigned
  (`loadAssignableTool` refuses anything not approved, at the API, not just in
  the picker).
- A therapist can preview one in the portal, which is how the wording gets
  reviewed.
- Tests: shared-types `rule 2` block, `worksheets.test.ts` draft block, and two
  new api tests in `worksheets-safety.test.ts` (draft answers 404 and stores
  nothing).

## Where the copy lives, and how it is seeded

`packages/shared-types/worksheets/stress-and-burnout.ts` is the one definition.
The api, the portal preview and the tests all read it.

Seeding is split in two, because the original seed migration may already have
run in production and must not be rewritten:

- `20261109130000_seed_library_worksheets` — unchanged, byte for byte. A test
  asserts it, and the four reused ids are frozen as placeholders inside
  `emit-sql.ts` so regeneration reproduces the historical file exactly.
- `20261124140000_seed_stress_burnout_drafts` — new, carries the ten draft
  rows. The four reused ids are upgraded in place by `ON CONFLICT (tool_id)`.

**One thing to know for later:** approving a worksheet changes its status cell
in the drafts migration. While that migration is unapplied that is harmless;
once it has been applied, an approval needs its own new migration rather than a
regeneration. Recorded here so it is a decision, not an accident.

## Two capabilities added, both content-driven

**A choice column in an add-your-own-rows list.** The priority sorter needs one
list with a label per line, and the row list only had text / 0–10 / date
columns. A `choice` column carries its own options, is validated (at least two,
unique values, no options on any other column type), rendered as chips in the
app and a select in the portal preview, and stored as the option value — never a
rank, never a number.

**`closing.discardWhen`.** The unsent letter ends with "Keep it privately /
Delete it". The body declares which answer means discard
(`{ field: 'keep', in: ['delete'] }`), the validator checks that the field is an
earlier choice and the value is one of its options, and the app deletes the
saved entry with the same endpoint Past me uses. The safety flag survives
(content-free, as with any delete), the share prompt is skipped, and a failed
delete says so instead of pretending. No screen hard-codes a field id, and a
worksheet without the rule behaves exactly as before.

## Rule 3 — the safety check

Nothing new was needed for "every answer goes through the journal's check": one
write path does that for every worksheet. What the batch adds is the deeper
screen on the two the owner named — the Doomscroll log and the Unsent letter
carry `sensitive_check: true`, which the route reads off the row. A test posts
"I've been skipping meals all week" into the doomscroll log and asserts the
flagged path fires (S3, help card, therapist alert).

No body asks for weight, body measurements, calories, food amounts or medicines;
the request-pattern check runs over drafts too, not only approved rows.

## Rule 5 — no scores

No aggregate piece, no summing, one integer per slider. A test greps every draft
body for "total", "overall", "your score", "stress level" and "burnout level".

## Verification (actual runs)

- `packages/shared-types`: **139 tests pass**, `tsc --noEmit` clean.
- `apps/api`: **2056 tests pass** across 116 files (2054 before this batch + 2
  new), `tsc --noEmit` clean.
- `apps/therapist-portal`: **430 tests pass**, `tsc --noEmit` clean.
- `apps/mobile`: **514 tests pass** (510 before + 4 new: choice column in the
  runner and in the parser, discard rule, plus the retitled spec cases),
  `flutter analyze` clean.

Typecheck note: the shared Prisma client had to be regenerated from this
branch's schema to include `care_plans` / `sensitive_check`, then restored so the
other checkout still typechecks — the same caveat recorded in
`20-step-14-rules-report.md`.

## What is still owed

1. **Your approval, worksheet by worksheet.** Nothing flips to `approved` until
   you say so; the switch is a status change plus a new migration.
2. **The weekly load check's past weeks.** Past me already lists every saved
   entry by date under a filter for that worksheet, with no graph and no score.
   The saved load number is stored with each entry but the list shows the
   demands, not the number. If you want "7/10" beside each date, that is a small
   change to the Past me row — say the word.
3. **Hinglish**, after the English is approved.
