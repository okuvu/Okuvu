# Step 2 — the pieces a worksheet is made of

Status: built and verified. Nothing merged, no APK. Branch `feature/exercise-library`
(off `main` at 12236bc), sitting on top of the Step 1 storage commit.

## The one decision that shapes this step

A worksheet is **data, not code**. Its body lives in the existing catalogue
(`ToolRegistryEntry.content_en` / `content_hi`) and every screen that shows it is a renderer
over that body. That is what makes it possible to fix approved wording without a release, to
serve English and Hinglish from the same piece ids, and to have the therapist's preview and
the client's app agree by construction rather than by copy-paste.

So Step 2 built three things, and only three:

1. **One definition of the pieces** — `packages/shared-types/worksheet.ts`.
2. **One validator**, in that same file, used by the api write/read path and by the portal's
   preview.
3. **Two renderers** over that definition: the app (`worksheet_runner_screen.dart`) and the
   portal preview (`WorksheetRunner.tsx`).

## The pieces (twelve, as the owner listed them)

| Piece | Type key | Notes |
|---|---|---|
| Instruction text | `instruction` | Never "required"; it is not a question |
| Short answer | `short_text` | 500-char default ceiling |
| Long answer | `long_text` | 10,000-char default ceiling |
| Speaking instead of typing | `voice_note` | Only the transcript is stored; there is no audio column and none was added |
| 0–10 slider | `scale_0_10` | End labels come from approved copy when there are any |
| 0–100 slider | `scale_0_100` | Conviction percentage only |
| Feelings picker | `feelings_picker` | Two levels (family → finer words), max 3 by default, optional per-feeling strength |
| Checklist | `checklist` | Optional per-option one-line description (thinking traps), min/max selections |
| Choice | `choice` | Buttons; the thing branches are keyed on |
| Add-your-own rows | `row_list` | Columns can be text, 0–10 or a date |
| Date and time | `datetime` | Date, time, or both — one of them always present |
| Closing reflection | `closing_reflection` | Optional answer, must be the last piece |

Every piece can be required or optional, can carry a helper line and an example, and can
reserve space for the therapist's personal line (`therapistNote: true`, rendered from
`Homework.personal_note`).

**Branching** is `visibleWhen: { field, in: [...] }` pointing at an *earlier* choice or
checklist. That covers every branch in the approved set: the worry tree's "Yes" / "Not right
now", and the small-things planner's "Yes / Partly / Not this time". One level, forward-only,
no cycles — a rules engine would have been more surface than the worksheets need.

## "A badly put-together worksheet must not be saveable"

`validateWorksheetContent` rejects, with a specific message per problem:

- an unknown piece type, and **any unknown key** (a typo like `requried` would otherwise
  silently turn a required piece optional);
- a missing prompt, duplicate ids, ids that are not lowercase slugs;
- a choice or checklist with fewer than two options, or two options sharing a value;
- a branch pointing at a later piece, at a non-choice piece, or at an option value that
  does not exist;
- a second closing reflection, or one that is not last;
- feelings nested deeper than one level, or with an unknown parent;
- a row list with no columns, or a column type that is not text / 0–10 / date;
- a date piece with neither a date nor a time;
- closing buttons with an unknown action or a duplicate action.

`worksheetRowProblems` adds the catalogue-level rules: the section must be one of the nine,
the access mode one of the three, the load level light or demanding, the duration sane, and
the client-facing Library summary present (the therapist-facing note is not a substitute).

`assertClientServable` additionally refuses anything whose `status` is not `approved`. The
portal deliberately uses `parseWorksheetRow` instead, so a draft can be previewed before it
is approved — but an invalid draft previews with its problems listed and the renderer
withheld.

The Hinglish body is checked as a *translation of the same worksheet*: same piece ids in the
same order, same option values, same feeling ids, same branching. Prompts and labels differ.
That is what lets a client switch language mid-worksheet without losing answers, which are
keyed by id.

## The app

`worksheet_runner_screen.dart` — one piece per screen, a progress bar, Back/Next, and Next
gated on a required piece. It holds no copy: every question, helper, example and button label
comes out of the body.

- **Drafts survive a closed app.** `worksheet_draft_store.dart` writes answers + step index to
  `shared_preferences` on every change, keyed `worksheet_draft_v1:<user>:<worksheet>`. Local
  on purpose: a draft that needs the network would fail exactly when the network is what
  broke, and half-finished writing stays off the server. A corrupt draft is dropped rather
  than crashing the screen.
- **Dictation** reuses the existing `SpeechService`, so permission handling, the 60-second
  cap and the "only the words" property are the ones already shipped and tested. Nothing in
  this path touches audio storage.
- Text fields keep a controller per piece, so a rebuild does not reset the caret mid-sentence.
- The closing screen renders the closing line and the buttons from the body. A
  `treasure_box` button currently says "coming next" rather than doing nothing silently —
  the Treasure Box is a later step.

## The portal

- `worksheets.list` / `worksheets.preview` (therapist-only procedures).
- `/worksheets` lists the catalogue with the therapist-only columns (therapy approach,
  approval state, problem count).
- `/worksheets/[toolId]` previews the client view piece by piece, with an English/Hinglish
  switch when both bodies exist, and shows the refusal list instead of a half-rendered
  worksheet when the body is invalid.
- The preview says, on screen, that nothing typed there is saved, checked or sent, and that
  dictation is an app-only affordance.

## Verification (actual output, not intended)

- `packages/shared-types`: **57 tests pass**, `tsc --noEmit` clean.
- `apps/api`: **1722 tests pass** across 88 files (1707 before this step + 15 new
  `worksheet-content` tests); `tsc --noEmit` clean.
- `apps/therapist-portal`: **344 tests pass** across 30 files; `tsc --noEmit` clean.
- `apps/mobile`: `flutter analyze` clean on the new feature and its tests;
  **26 tests pass** (spec + runner widget tests); full mobile suite result recorded in the
  step report.

## What this step did *not* do, on purpose

- **No worksheet content was seeded.** Writing the sixteen bodies into the catalogue is the
  next step; doing it here would have meant two changes in one commit and a much harder
  review.
- **The demanding-worksheet gate is not here.** "Feeling above 5/10 sends the client to
  grounding" belongs to the Library entry point that decides whether a client may open a
  worksheet at all — this screen assumes it was allowed. Recorded so it is not forgotten.
- **Answers are not saved to the server yet.** `onFinished` hands them to the caller; the
  safety-checked write path (the same check chat uses) is a later step. The draft is
  deliberately not cleared here, because the answers are only safe once that write succeeds.
- **No portal authoring UI.** The approved wording is data; it arrives by migration/seed, not
  by a therapist typing it.

## Repo note worth recording

The worktree reuses `apps/*/node_modules` through symlinks into `/opt/data/okuvu/ts`. Those
symlinks made `@okuvu/shared-types` resolve to the **main checkout's** copy, so the first test
run silently exercised the wrong source. The four app `node_modules` symlinks are now real
directories whose `@okuvu/*` entries point at this worktree's packages. Without that, every
cross-package test in a worktree tests the wrong code.
