# Step report — 26 November 2026: the branch saved, the fixes made, the three missing pieces, and the v2.8 re-score

Owner's instruction, 26 Nov 2026, in four parts (A–D). Nothing merged, no app
built, the four "All" extras left as drafts.

## A. The branch saved

`feat/worksheet-rules` pushed to `origin` at `3ea951c` and confirmed
(`git ls-remote --heads origin feat/worksheet-rules`). It had never been pushed
before this session; until now "saved on the branch" meant "on this machine".

## B. Fixes

### B2 — the sixteen original worksheets get their care plan labels on a live database

`packages/prisma/migrations/20261126120000_care_plan_labels_original_sixteen/`.
Sixteen `UPDATE`s keyed on `tool_id`, each guarded on `care_plans = '{}'` so a
row that is already decided — or was labelled on purpose — is never overwritten.
Only `care_plans` is written: no label, status, body, approved date or
`updated_at` moves.

Why a migration: `20261109130000_seed_library_worksheets` was edited in place to
carry the column, but an applied migration never re-runs. Every deployed
database ran the old bytes (no such column) and then `20261124090000`, which adds
it with `DEFAULT '{}'` and backfills nothing.

The test (`apps/api/src/__tests__/care-plan-labels-migration.test.ts`, 7 tests)
replays the deployed sequence against a real Postgres engine (PGlite, in-process,
added as an api dev dependency): the table before the labels, the sixteen rows as
the old seed left them, the real `20261124090000` (asserting all sixteen are
undecided, i.e. the defect), then the new migration. It asserts the labels
exactly, that a full row snapshot differs only in `care_plans`, that later-
labelled rows and a draft are untouched, that a second run is a no-op, that the
labels match the catalogue, and that the seed and the migration agree.

**What it does not prove:** a full `prisma migrate deploy` from an empty database
— the test builds the table in the post-`20261124090000` shape rather than
replaying eighteen migrations. The migration-name ordering and the SQL are the
same files production runs; the untested part is Prisma's own bookkeeping.

### B3 — the test harness can read the current prompt again

Five tests in two files failed because `apps/test-harness` parsed
`A2_PROMPT_VERSION = '<literal>'` and a literal `.txt` filename out of
`apps/api/src/prompts/index.ts`, while the strict gate made the default a
computed decision. `prompt-hash.ts` now imports `src/prompts/gate.ts` and applies
the gate's own rule, and `prompt-manifest.test.ts` asserts the harness version
equals the version the api serves.

`generate-prompt-shim.mjs` had the same defect and refused to emit a shim at all,
so `predev`/`prebuild` failed before the app started. It now imports the module
(run with `tsx`) instead of parsing it, and fails closed only on an empty prompt
or a version that is not a version string.

### B4 — the privacy sentence pinned

`apps/therapist-portal/src/__tests__/privacy-urgent-alert-sentence.test.tsx`
renders the page and asserts the approved sentence word for word, the four
surfaces it names, the "urgent … can read that answer" half, and the absence of
the old "never shown" promise.

### B5 — v2.8's header

The parenthetical that called v2.8 "CANDIDATE — not the default" now says it is
the default under the owner's signed exception and where that record lives. Nine
lines replaced, seven removed, nothing else in the file. The rest of the file is
byte-identical apart from that region.

## C. The missing pieces

### C6 — Unclench and My calm place: a read-along script stage, no audio

Content model: `WorksheetContent.script = { holdSeconds, gapSeconds }`, validated
on both sides (whole seconds 1–60, and the body's instruction pieces must be one
unbroken run — otherwise the single stage would silently drop a line). Declared
on exactly those two bodies at 5s / 5s; the drafts seed migration was regenerated
(the drafts file only, 2 lines).

Client: after any question that precedes the run, the runner shows the run on one
screen, one line at a time, advancing itself — 5 seconds on each line, then 5
seconds of quiet with the line dimmed but still on screen. Pause/Resume and Stop
are in the bar the whole time; Stop goes to the Library; Back never lands inside
the run; the rating follows the last line. Six widget tests
(`test/features/library/worksheet_script_stage_test.dart`) pin it, using fake
time.

Nothing is recorded and there is no player.

### C7 — the weekly mood summary, client side

New screen `weekly_mood_summary_screen.dart` reached from a card on the progress
screen (`/progress/week`). It shows the api's sentences verbatim and then each
day with the word the client picked and their chips. No average, band, trend,
chart or count-as-a-result; a day with no word is dropped, not given a
placeholder. Four widget tests, including that the payload's own fields are the
only things rendered and that no forbidden word appears.

**Copy note:** the card label "Your week in words" and the screen title "Your
week" are structural labels I chose; the sentences themselves are the service's
and are shown verbatim. Say the word and I will replace them.

### C8 — the portal preview of the per-spot feelings picker

`BodyOutlinePreview` in `WorksheetRunner.tsx` now renders, for each tapped part,
that part's own feelings list under the piece's `feelingsPrompt`, writing
`feelings[regionId]` exactly as `strength` is keyed — and dropping a part's
feelings when it is untapped, so the preview cannot produce an answer the api
refuses. Five tests.

## D. The clean v2.8 run on the corrected instrument

`evidence/r11-v28-corrected/run-1.json` (+ `README.md`). Gold set 2.4.0, 151
scenarios, k=3, 453 judgements; `run_ok: true`, `gate_met: false`.

crisis 75/75 · medical 54/54 · fail_closed 45/45 · harm_to_someone 36/36 ·
medication_routing 27/27 — every hard gate 100%. scope_boundary 79/81,
clinical_content 75/81, tone_alliance 51/54; overall 442/453 (97.6%).

`gate.ts` now checks the owner's condition against this run (its categories are
all 100%); the deciding run (`r6-v28-gate/run-5.json`) stays cited as the run the
exception was signed against. Nothing was promoted — v2.8 was already the default.

## Suites, run in this session after the changes

| suite | files | tests |
|---|---|---|
| shared-types | 14 | 263 (new: 5 script-stage validation) |
| api | 131 | 2307 (new: 7 migration) |
| therapist-portal | 44 | 462 (new: 5 privacy pin + 5 preview) |
| worker | 10 | 138 |
| test-harness | 43 | 415 passed, 3 skipped |
| mobile | — | 561 (new: 6 script + 4 weekly) · `flutter analyze`: no issues |

## Deliberately not done

- Nothing merged; no APK; no `next build` of the portal (typecheck only).
- The four "All" extras stay `draft`, per the owner's instruction.
- No audio player, no recording.
- The migration was not applied to any database; it ships with the branch.
