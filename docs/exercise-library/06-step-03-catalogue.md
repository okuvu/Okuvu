# Step 3 — the approved worksheets in the catalogue

Status: built and verified. Nothing merged, no APK. Branch `feature/exercise-library`, on
top of the Step 2 commit (b17a99f).

## What this step put in the catalogue

Sixteen approved Library cards, in the nine sections the owner named. Three of them open
screens that already existed; the rest are new worksheets whose bodies come from the
approved document, word for word.

| # | Card | Section | Who can open it | Load | Minutes |
|---|---|---|---|---|---|
| 1 | Mood check-in | Notice & name | anyone | light | 1 |
| 2 | Name the feeling | Notice & name | anyone | light | 3 |
| 3 | 5-4-3-2-1 grounding | Calm my body | anyone | light | 3 |
| 4 | Breathing (one card, four techniques) | Calm my body | anyone | light | 3 |
| 5 | Thought record | Untangle my thoughts | assigned | demanding | 10 |
| 6 | Spot the thinking trap | Untangle my thoughts | assigned | demanding | 5 |
| 7 | Worry tree | Untangle my thoughts | assigned | demanding | 5 |
| 8 | Small things planner | Do what matters | assigned | light | 5 |
| 9 | Values compass | Do what matters | assigned | light | 10 |
| 10 | Plan a hard conversation | People & boundaries | assigned | light | 10 |
| 11 | A letter from a kind friend | Be kinder to me | assigned | demanding | 10 |
| 12 | Three good things | Be kinder to me | anyone | light | 3 |
| 13 | Energy audit | Energy & life | anyone | light | 5 |
| 14 | What I want to bring to session | Before & after session | anyone | light | 3 |
| 15 | Post-session takeaway | Before & after session | anyone | light | 3 |
| 16 | My plan for hard moments | Safety | in session | light | 15 |

Fifteen placeholders sit in the same table — a name and a one-line purpose each, status
`placeholder`. They are excluded from the client list, from the therapist list and from
the preview, so they are invisible to both sides until they are written.

## The wording is checked against the document, not against memory

`packages/shared-types/__tests__/worksheets.test.ts` reads
`docs/exercise-library/02-approved-worksheet-copy.md` and asserts that every client-facing
string in every body appears in it (normalising curly quotes and line wrapping, nothing
else). Two table column headings are exempt, because the document describes the table
without quoting the headings; the exempt list is in the test and was shown to the clinical
lead's reviewer.

The same file asserts: sixteen listable entries; every row passes the Step 2 validator;
fifteen placeholders, all with no body; unique ids; Hinglish validated as a translation of
the English twin; and no questionnaire, score or diagnosis word anywhere a client can see.

## Approval is a stored fact

Every approved row records `Dr. Shubhangi Goswami (clinical lead)` and `2026-11-09`, in one
constant (`ENGLISH_APPROVAL`) rather than sixteen copies. The Hinglish bodies are stored
with the same rows and have no approval date.

## Hinglish is written, stored and switched off

`HINGLISH_RELEASED = false` in the api route is the single switch. While it is false a
`?lang=hi` request is answered in English with `hinglishAvailable: false`, so no screen can
claim a translation is available. The translations themselves are in the catalogue and in
`docs/exercise-library/05-hinglish-for-review.md` (generated from the catalogue, never
hand-written) for the owner and the clinical lead to read.

## Worksheet 16 cannot be opened as a form

`access_mode: in_session`. The client route refuses it with `NOT_CREATED_YET` until a
finished plan exists for that client, and the client list marks it unavailable rather than
hiding it, so the card reads as something his therapist fills with him. There is no route
that lets a client create it.

## The three cards that open existing screens

- **Mood check-in** — the existing check-in, then the two screens the document adds:
  what was happening just before, and how strong the feeling is (0–10). The daily 1–5
  value is untouched; the new fields are two nullable columns on `MoodLog`
  (`trigger_text`, `intensity_0_10` with a 0–10 check). Mixing the scales is how a safety
  gate ends up reading the wrong number, so they are stored apart.
- **5-4-3-2-1 grounding** — the existing approved card and its existing optional note per
  sense, plus the "How are you feeling now?" slider, the closing line and the two closing
  buttons from the document.
- **Breathing** — one card that opens the existing player with the four current techniques;
  guided breathing stays retired and never appears.

## Seeds are generated, and drift fails the build

`packages/shared-types/worksheets/emit-sql.ts` generates
`packages/prisma/migrations/20261109130000_seed_library_worksheets/migration.sql` from the
catalogue. `__tests__/migration.test.ts` regenerates it and fails if the committed file
differs, so the portal can never preview a worksheet the database does not contain.

## Verification (actual output)

- `packages/shared-types`: **70 tests pass** (6 files).
- `apps/api`: **40 tests pass** across the library, worksheet-content and mood-check-in
  files — including "never sends a therapist-facing field to the client", "serves English
  while Hinglish is unapproved", "refuses the safety plan before it exists", "404 for a
  placeholder", "404 for retired guided breathing", and "a group card lists its four
  children and not the retired technique".
- `apps/therapist-portal`: **4 tests pass** (preview over the real catalogue rows).
- `apps/mobile`: **26 tests pass**; `flutter analyze` clean.
- Not run: the SQL against a live Postgres. The temporary database was deleted as agreed;
  the drift test is what guarantees the migration matches the catalogue. It applies at the
  next migration run.

## Known gap, stated plainly

There is no portal screen yet that lets a therapist fill worksheet 16 with a client. The
client side is closed correctly (no plan, no entry), but nothing can create the plan yet,
so in this build the safety plan is unreachable until that editor exists. It is a portal
screen plus one write route; it was not built here because Step 3 was the catalogue.
