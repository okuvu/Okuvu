# Step — the Low Mood batch (9 worksheets), 24 November 2026

**Status: built, all nine `draft`. Nothing approved, nothing switched on, nothing deployed.**

Branch `feat/worksheet-rules`. The owner's step rules of 24 Nov 2026 apply unchanged:
a new worksheet starts switched off, its wording is drafted in plain language and sent
to him for review, and it is switched on only when he says the wording is approved.

## What the owner asked for

Nine worksheets, labelled Low Mood, following the Step 0 rules. `S` = the client can
open it themselves (`access_mode: 'open'`), `A` = therapist-assigned
(`access_mode: 'assigned'`). Low load unless stated.

| # | Worksheet | Mode | Load | Minutes |
|---|---|---|---|---|
| 1 | One small thing | S | light | 3 |
| 2 | Mood and activity log | S | light | 5 |
| 3 | Strengths spotting | S | light | 5 |
| 4 | Things I might enjoy | S | light | 5 |
| 5 | Tiny steps ladder | A | light | 10 |
| 6 | Meet the inner critic | A | demanding | 15 |
| 7 | Reconnect planner | A | light | 10 |
| 8 | Comparison check | A | demanding | 10 |
| 9 | The morning after a miracle | A | light | 10 |

## The safe properties, and where each is enforced

- **Switched off.** Every row is `status: 'draft'` in the catalogue and in the generated
  migration. A draft is excluded from the client Library, answers 404 on a direct open,
  and is refused on assign — the same answer as an unknown id, so a guessed URL learns
  nothing. Pinned by `the Low Mood batch of 24 November 2026 > keeps every one switched
  off for clients` and by the migration test.
- **Safety screening.** Every written and spoken answer on all nine goes through the
  same check the journal uses, with the same response. The deeper screen (skipped meals,
  restricted food, making yourself sick, punishing exercise, hating the body, days
  without sleep, wanting not to wake up, wanting to hurt someone, self-harm) is carried
  by the two the owner named for it: **Meet the inner critic** and the **Comparison
  check**. Pinned by `gives the deeper screen to exactly the two the owner named for it`.
- **No forbidden asks.** No row asks for weight, body measurements, calories, food
  amounts or medicines, in any prompt, helper, example, option label, column heading or
  closing line. Pinned by the batch-wide scan, and by the wider catalogue scan which now
  also covers drafts.
- **No scores.** No aggregate piece exists, none of the batch's copy promises a score or
  a level (the copy guard now runs over drafts as well as approved rows), and the two
  sliders return the number the client chose and nothing else.
- **Private by default.** Nothing here changes the sharing model: per-entry sharing, off
  unless the client shares that entry.

## Five rows reuse placeholder ids

Strengths spotting (`ws_strengths`), Tiny steps ladder (`ws_tiny_steps`), Meet the inner
critic (`ws_inner_critic`), Comparison check (`ws_comparison_check`) and The morning after
a miracle (`ws_miracle_question`) were already in the applied seed as placeholders. They
keep their ids, are renamed by the drafts migration through `ON CONFLICT`, and are
removed from `placeholders.ts` in the same change. The applied seed stays **byte
identical** — verified by `git diff --stat` on `20261109130000_seed_library_worksheets`
printing nothing — with the historical placeholder rows frozen in `emit-sql.ts`.

## Two capabilities this batch needed

Both are content-declared, so no screen hard-codes a worksheet id or a field id.

### `closing.handOff` — carrying picks into another worksheet

"Things I might enjoy" is a menu; the Small things planner is where a chosen item becomes
a plan. The body declares where the picks go:

```json
"handOff": {
  "toolId": "ws_small_things",
  "field": "ideas",
  "label": "Take these to my Small things planner",
  "targetField": "plan",
  "targetColumn": "what"
}
```

On the closing screen the app seeds the **target's own local draft** with the labels the
client actually saw, then opens the planner prefilled. It does not save on the client's
behalf, does not replace a row they already wrote (it appends, and skips a label that is
already there), and does not change the planner — the owner was explicit that the planner
itself must not change. Draft seeding means an abandoned hand-off leaves nothing behind.

Proved at three levels: the body validator (the field must be an earlier checklist, the
label and both target keys are required), `handOffProblems()` across the catalogue (the
target exists, is one a client may open, has the named row list, and that list has the
named text column), and a widget test that taps the button and reads the seeded draft
back.

### `review` — the weekly view in words

The owner asked for "a simple weekly view in words showing which activities came with
better feelings, with no score". What the app must not do is decide which feeling is
"better": that means inventing an ordering of feelings and labelling the client with it,
which is the thing rule 5 forbids. So the body declares:

```json
"review": { "withinDays": 7, "activityField": "doing", "feelingsField": "feelings" }
```

and `GET /worksheets/:toolId/review` groups the client's own last seven days by the
activity words **they** wrote, listing the feeling labels they picked each time. Grouping
is case-insensitive, and the heading always shows their own spelling rather than a tidied
one. No total, no average, no ranking, no "best activity" — the pattern is theirs to read.

The route fails closed on every other case: a draft, an unknown id, a therapist-only row,
an `in_session` row, a worksheet that declares no review, an invalid body, and an assigned
worksheet with neither an assignment nor any entries all answer 404 identically.

## Verification that actually ran

- `packages/shared-types`: **212 passed** (21 files). Includes the new batch properties,
  the two capability suites, the draft-body validation gap closed below, and the
  regenerated migration and review documents.
- `apps/api`: **2201 passed** across **126 files**, exit 0. Includes the new
  `worksheet-review.test.ts` (9 tests).
- `apps/therapist-portal`: **450 passed** across 42 files.
- `apps/mobile`: **546 passed**, exit 0; `flutter analyze` clean.
- `apps/api` `tsc -p tsconfig.json --noEmit` clean, against a Prisma client generated from
  this branch's schema.
- The generated migration was regenerated and the pre-existing migrations did not move.

## A gap closed while doing this

`catalogueProblems()` only ever validated **listable** rows. A draft body that fails its
own rules therefore shipped to the database and only failed when someone opened it — in a
therapist's preview, mid-session. There is now a test that validates every draft row too.

## What this step did not do, on purpose

- Nothing is approved. Approval is a separate migration, generated only when the owner
  says the wording is approved, worksheet by worksheet.
- No Hinglish. Translations are approved separately, so all nine rows carry an empty
  `content_hi`; the release switch is unchanged.
- No new app, no merge, no APK, no deploy.
- The hand-off seeds a **draft**, so "sent to the planner" means the client opens the
  planner with the picks already in the list and saves it. It does not write to the
  planner on their behalf — that would be writing a worksheet answer the client did not
  compose, and it could not be done without changing the planner.

## Known gap

The two capability tests cover the app and the api. There is **no portal preview** of
either mechanism beyond the generated review document: the portal's static preview draws
the body's pieces and shows the hand-off and review lines as text in the review document,
not as a rendered button or read-back. A therapist previewing "Things I might enjoy" sees
the checklist; the button only exists in the app.
