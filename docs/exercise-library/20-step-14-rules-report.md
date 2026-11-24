# Step 14 — the worksheet rules of 24 Nov 2026

Status: **built, tested, not merged, not deployed.** Branch `feat/worksheet-rules`,
worktree `/opt/data/okuvu/wt/worksheet-rules`, based on the deployed commit
`987230e` (`develop`, which is what `api.okuvu.in/health` reports). Nothing is
switched on for a client by this step: no new worksheet has approved wording, so
nothing new can appear.

Governs from here: `19-rules-24-nov-2026.md`. Chat wording, awaiting approval:
`21-chat-wording-proposal.md`.

## 1. What changed, in plain terms

- **Every worksheet now carries the care-plan labels the owner listed.** All
  sixteen, exactly as written: the worry tree and the thinking trap to Anxiety &
  Worry; the thought record to both Anxiety & Worry and Low Mood; the four
  low-mood ones; the energy audit and the hard conversation to Stress & Burnout;
  and the eight that apply to everybody to All. Nothing else about any of them
  changed — not a word, not a field, not the order they appear in for a client
  whose plan matches nothing.
- **The client sees order, never a plan name.** Their plan's worksheets come first
  inside each Library section, and the one thing the Today card suggests is
  chosen from their plan first. The app is still never told `CP1`/`CP2`/`CP3` or
  a plan name: that decision from the earlier work stands, and there is a test
  that greps the response for it.
- **New worksheets start switched off.** A worksheet inserted without a status is
  a draft: no card, no open, no assignment — and the assign path refuses an
  unapproved row even if a form offers it.
- **The five named worksheets get a deeper safety screen.** Skipping meals,
  restricting food, making yourself sick, exercising to punish yourself, hating
  your body, days without sleep, wanting not to wake up, wanting to hurt someone
  and self-harm are matched by a deterministic floor on exactly those five rows.
  The response is the journal's: the help card, the helplines, the client's safety
  plan, and the content-free therapist alert. A check that cannot run is still
  moderate concern, never crisis.
- **Nothing may ask for weight, body measurements, calories, food amounts or
  medicines**, and no worksheet may promise a score, a level or a total. Both are
  enforced on the body itself, on the save path.
- **The exposure ladder is therapist-only.** Not in the Library, not openable, not
  assignable, never suggested.
- **Two new pieces exist**: a countdown timer and a body outline the client taps.
  Built once, in the same shared content definition the api, the portal preview and
  the app all read.

## 2. How it was checked

Run from the worktree, against the worktree's own packages (verified: `readlink -f
apps/api/node_modules/@okuvu/shared-types` resolves inside the worktree, not the
shared checkout).

| Check | Result |
| --- | --- |
| `apps/api` — `tsc -p tsconfig.json --noEmit` | clean |
| `apps/api` — `vitest run` (whole suite) | **114 files, 2041 tests passed** |
| `apps/therapist-portal` — `tsc --noEmit` | clean |
| `apps/therapist-portal` — `vitest run` (whole suite) | **40 files, 430 tests passed** |
| `packages/shared-types` — `vitest run` (whole suite) | **10 files, 118 passed, 1 failed** |
| `apps/mobile` — `flutter analyze lib/src/features/library test/features/library` | No issues found |
| `apps/mobile` — `flutter test test/features/library` | **57 passed** (53 existing + 4 for the two new pieces) |
| `apps/mobile` — `flutter test` (whole app suite) | **510 tests passed** |
| `packages/prisma` — `prisma validate` | "The schema at schema.prisma is valid" |
| `prisma migrate diff --from-empty --to-schema` | emits `care_plans TEXT[] DEFAULT ARRAY[]::TEXT[]` and `sensitive_check BOOLEAN NOT NULL DEFAULT false`, matching the hand-written migration |
| `prisma generate` | regenerated; the new columns are visible to `tsc` |
| Seed SQL regenerated from the catalogue | `WRITE_WORKSHEET_SQL=1 … migration.test.ts` → 2 passed, file rewritten |
| `node -e "import('@okuvu/shared-types/worksheets/types')"` | loads in the container's own resolver; `scopeForCarePlan` is a function and the four labels come back spelled the owner's way |

**The one failing test is pre-existing and is not mine.** `packages/shared-types/
__tests__/sharing.test.ts` → "knows exactly the three shareable surfaces" fails
because `SHAREABLE_KINDS` now contains a fourth member, `mood_log`, added by the
mood-sharing branch. I confirmed it failed identically on `987230e` before I
changed anything. It is a copy guard that pins a list the clinical/consent owner
approved; adding the fourth kind to the expected list would silently re-approve a
new shareable surface, so it is left red and reported instead.

New tests written for these rules, so a later change fails on the rule it breaks:

- `packages/shared-types/__tests__/worksheet-rules.test.ts` — the label table
  verbatim, draft is not listable/servable, the five sensitive rows, the forbidden
  asks, the score copy guard, therapist-only, and both new pieces (valid, invalid,
  unknown key, answer shapes).
- `apps/api/src/__tests__/worksheet-rules.test.ts` — the deeper screen fires on
  the marked row and not on an ordinary one; S3 vs S4; ordinary sentences do not
  fire; the exposure ladder answers `404` on open and on save; the Library orders
  the client's plan first and never serializes it.
- `apps/mobile/test/features/library/new_pieces_test.dart` — the timer counts
  down, stores the seconds it ran, and satisfies a required step only when it has
  run; stopping early is an answer when no minimum is set; the body outline offers
  every part (including one with no place on the drawing) and a tapped part
  answers the step.

Three existing test files were updated because the route grew — the mocks needed
the new `clinicalConfig` read and the new query shape. That is scaffolding, not an
assertion loosened: `library.test.ts` now also asserts the therapist-only filter
is in the query, and `users-today-and-tool-preference.test.ts` serves the
suggestion as a candidate list.

## 3. What this step did not do, on purpose

- **No new worksheet wording.** The message says "some worksheets below" and then
  has no list. Comparison check, Sleep diary, Meet the inner critic, Unsent letter
  and Doomscroll log are named for the deeper screen, but there is no brief for
  any of them, and the two new pieces do not obviously belong to those five. See
  §4.
- **No chat wording applied.** `21-chat-wording-proposal.md` holds the exact
  before/after. The prompt file is untouched.
- **Nothing merged, nothing deployed, no APK built.**
- **The migration is not applied.** There is no Postgres on this machine. The
  file is written by hand in the repo's style, `prisma validate` passes, and
  `migrate diff --from-empty` shows the schema agrees with it — but "it applies to
  a populated database" is not proved here.
- **No new index.** The plan ordering is computed after the fetch (sixteen rows),
  and a GIN index would be permanent drift from `schema.prisma`, which cannot
  express one.
- **The client app was not changed for the labels.** Ordering is the server's; the
  app renders what it is given, so a Home that reads "first" needs no new widget.

## 4. What is needed from the owner

1. **The list of new worksheets to draft** — name plus one line on what each is
   for. Then each draft comes back as a review list, none of it switched on. The
   five named in rule 3 are the obvious first batch if that is what was meant.
2. **The S3/S4 mapping in the deeper screen.** Self-harm and "sleep and not wake
   up" are S4 (the crisis card); the eating/body/sleep/harm-to-others signals are
   S3 (flagged, help card, therapist alert, no crisis card). That follows the
   existing meanings in `crisis-keywords.ts`, but it is a clinical threshold and
   the owner decides it.
3. **Chat wording approval**, and the choice in §"The one thing Edit 1 cannot do
   today" of the proposal: ship the sentence with no list behind it, or feed the
   client's Library list to `${toolkit}` first.

## 5. Disk and suite numbers

- Free on `/opt/data`: **24 GB** (`96G` total, 76% used). The worktree itself is
  126 MB, because `node_modules` is symlinked at the shared checkout's and the
  per-app trees are copied symlink trees.
- Full mobile suite: **510 tests passed** (`flutter test`, whole app).
- Free space after the build work: **24 GB**.

## Known gap

`${toolkit}` is empty in production, so the chat has no worksheet list to suggest
from. Rule 4's "it may suggest which worksheet to try" is therefore still a
prompt-only behaviour until that list is wired — which is why the wording proposal
offers option 2 rather than declaring rule 4 done. The prohibitions (never write
the answer, never name a thinking trap, never fill in a blank) are already carried
by the in-worksheet helper and are unaffected.
