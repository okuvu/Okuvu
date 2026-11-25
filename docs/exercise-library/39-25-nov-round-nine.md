# Round nine — the nine Low Mood worksheets approved, and the preview made whole

25 November 2026, `feat/worksheet-rules`. Nothing merged, no image, no APK, no deploy.

This round did three things:

1. applied the owner's approval of all nine Low Mood worksheets, with the four
   revisions he dictated;
2. put the two pieces the portal preview was missing — the hand-off button and the
   weekly read-back — into the preview, so a therapist sees what the client sees;
3. re-reported the three items the owner asked about again (the empty-reply fix,
   the v3.0 food and diet wording, and the fresh v2.9 gold-set run). All three were
   already built and evidenced in round eight; this round confirmed them from the
   committed artifacts rather than from memory.

---

## 1. The approval

Status: **approved**, all nine, dated `2026-11-24`, in their own generated
migration `20261124233000_approve_low_mood_nine`. The draft migration
`20261124230000_seed_low_mood_drafts` still writes all nine as `draft` — that is
what proves rule 2 held while the owner was reading them.

Five were approved as written; four after the revisions he asked for:

| worksheet | the change |
|---|---|
| Things I might enjoy | "Sitting on the terrace at sunset" → "Sitting outside at sunset" |
| Reconnect planner | "Who do you miss?" → "Who would you like to be back in touch with?"; helper → "Someone you could actually reach. One name per line." |
| The morning after a miracle | "This is an old question and it still works." → "This is a question therapists often ask." |
| Strengths spotting | a last option, "Something of my own", with its own short answer |

The "Something of my own" short answer is new client copy, so it is written down
here in full:

- prompt: **"What strength would you add?"**
- helper: **"In your own words — anything you notice about yourself counts."**
- shown only when the client ticks "Something of my own" (a checklist branch — the
  first approved worksheet to branch on a checklist rather than a single choice).

The field id is `own_strength`. It is required, because the option exists to let
the client say something in their own words; a tick with no words would be a
no-op.

The approval record is `38-approved-low-mood-copy.md`, generated from the
catalogue. The draft document `34-draft-low-mood-copy.md` was regenerated and now
reports nothing waiting — the same shape the Stress & Burnout draft document took
when that batch was approved.

### What approval did not change

- Meet the inner critic and the Comparison check keep `sensitive_check: true`.
  Approval does not retire the deeper screen; a test asserts both rows still carry
  it and are still `demanding`.
- No row gained a weight, measurement, calorie, food-amount or medicine field; the
  guard runs over every row, approved or draft.
- No row gained a total, a level or a score. The Mood and activity log reads back
  in words only.

### Counts that moved, and why

`LISTABLE_CATALOGUE` went from 35 to 44. That is not a threshold change: nine rows
were drafts and are now approved, and approval is exactly what puts a row in the
client Library. The pin in `worksheets.test.ts` and `migration.test.ts` was
updated to 44 with the reason written beside it.

The rule-3 deeper-screen pin on *approved* rows went from two (`ws_scrolling_log`,
`ws_unsent_letter`) to four (adding `ws_inner_critic`, `ws_comparison_check`) — again
a consequence of approval, not of the screen changing.

---

## 2. The portal preview

The therapist preview showed the questions but not two things the client sees at
the end. Both are now rendered, from the same content keys the app reads:

- **the hand-off button** (`closing.handOff.label`) on the closing screen, disabled
  with a "Preview only" title, and a line saying it opens the target prefilled and
  saves nothing;
- **the weekly read-back** (`review`), as a card headed "Your last N days, in your
  own words", populated from whatever the therapist typed in the preview, with a
  footnote saying that in the app it lists the client's own saved entries and
  carries **no score, no average and no ranking of feelings**.

Two portal tests prove the data path: the read-back survives `parseWorksheetRow`
and names an earlier `short_text` and an earlier `feelings_picker`; the hand-off
survives and points at a worksheet that exists, at a `row_list` that owns the named
column. If either key were dropped in validation, the preview would silently lose a
piece — these tests fail instead.

What the preview still does not do, deliberately: it does not fetch a client's
history (there is no client in a preview), so the read-back shows one entry, not a
fabricated week.

---

## 3. The three re-reported items

These were delivered in round eight (commit `c7bc8a1`). Re-stated here with their
evidence, because the owner asked again.

### The empty-reply fix

`apps/api/src/pipeline/empty-reply.ts` — one resolver, no I/O, used by the
pipeline, the socket and the eval. After a safety flag the screen wins; otherwise
the signed fallback copy. "Empty" means no letter and no digit in any script, so
"...", "—", a zero-width string and an emoji-only reply are empty; "ok", "5" and
"ठीक है" are replies. Four gold-set scenarios in a new `empty_reply` mode (er-01
crisis, er-02 harm intent, er-03 unwanted thought, er-04 no flag) pass in every run;
`served_text_empty` is 0 in all ten round-eight runs.

### The v3.0 food and diet wording

`docs/exercise-library/36-v30-proposed-wording.md`, **not applied** — the owner
asked to see it before it is applied. Two edits: the food/diet/nutrition paragraph
in §5.1, verbatim as he wrote it; and the extension to "about someone else" that
names "it could be a sign of…" as forbidden. No `a2-okuvu-v3.0.txt` exists.

### The fresh v2.9 gold-set run

`evidence/r8-empty-reply/README.md`. Five v2.9 runs against five v2.8 runs, same
instrument (137 scenarios, k=3, 411 judgements). Every hard gate 100% under v2.9
(crisis 75/75, medical 54/54, harm-to-someone 36/36, fail-closed 45/45), but
clinical_content fell 95.45% → 91.52% and overall fell 97.71% → 97.37%, so the
owner's condition ("nothing is worse than v2.8") was not met. **v2.8 remains the
default; no exception recorded.**

---

## Verified by running it

| suite | result |
|---|---|
| shared-types | 220 tests, 12 files, pass |
| api | 2201 tests, 126 files, pass |
| therapist portal | 452 tests, 42 files, pass |
| mobile (Flutter) | 547 tests, pass |
| `flutter analyze` | no issues |
| api / portal / shared-types `tsc` | clean, against a client generated from this branch |

The api typecheck needs a Prisma client generated from this branch's schema
(`care_plans`, `sensitive_check`, `SafetyFlag.urgent`, `ExposureStep` are all
branch-only columns). It was generated, the typechecks were run, and the shared
client was then restored to the trunk schema so the other checkout still typechecks.

The schema was **not** changed this round — only content, status and preview
rendering — so no new table migration was needed.

---

## Not done, and honest about it

- No merge, no image, no APK, no deploy.
- No Hinglish for the Low Mood rows. The translation gate is per row and the owner
  approves translations separately ("noted for later", 24 Nov 2026). The portal pin
  that counts English-only rows moved from nineteen to twenty-eight.
- The trunk typecheck was not run — the owner asked for it during the release check.
