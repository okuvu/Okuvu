# Step 5 — the client side of the Library

Status: built and verified on `feature/exercise-library`. Nothing merged, no APK.
Branch tip before this step: `1704600` (Step 4).

The owner's Step 5 also carried one change to Step 4's behaviour (a failed check
is moderate concern, not a crisis). That change is recorded in
`07-step-04-safety.md` under "Revision, 9 November 2026", and its tests live in
`apps/api/src/__tests__/safety-outage-rule.test.ts`.

---

## 1. The home screen stays simple; the tools move under one tab

The bottom nav is now **Home | Chat | Toolkit**. Everything that is not Chat and
not Today lives behind the Toolkit tab:

| Tile | Opens |
|---|---|
| Breathe | `BreathingScreen` (the four techniques, unchanged) |
| Journal | `JournalScreen` (unchanged) |
| Mood check-in | `MoodCheckinScreen` (unchanged) |
| Library | `LibraryScreen` (unchanged list, unchanged data) |
| Treasure Box | a placeholder, built in Step 6A |

Home keeps the greeting, the next-session card, the pending chat-access banner,
the Today card and the Crisis Support button. The Mood check-in card and the
three quick-access tiles that used to sit there are gone from Home — they are
one tap deeper, not duplicated. No screen was rebuilt to do this.

## 2. The Library

Already built in Step 3 and unchanged here in substance: one list, nine
sections in the approved document's order, the owner's top line
("Small exercises to try anytime. Some are added by your therapist."), every
approved exercise anyone can open plus anything this client's therapist has
assigned.

What the api still guarantees, and what the app therefore never has to decide:

- no `therapy_modality`, no `therapist_note`, no access label and no load label
  is serialised to a client;
- drafts, retired exercises and the fifteen placeholders are filtered in the
  query, and a direct request for one answers exactly as an unknown id does;
- an `assigned` card is shown but does not open until the therapist assigns it;
- the safety-plan card does not exist at all until a plan does.

## 3. Doing a worksheet

One piece per screen, as before. Added in this step:

- **Before and after ratings, both optional.** "How strong is what you're
  feeling right now?" (0–10) before, "How are you feeling now?" (0–10) after,
  each with a Skip. A skipped rating is stored as null, never as a zero. When
  the worksheet is demanding, the answer given at the Library card *is* the
  before rating and the question is not asked twice — asking twice is how two
  different numbers get stored for one moment.
- **Assigned worksheets ask "Did you do it?"** with *Yes* / *Not this time*, and
  only "Not this time" reveals "What got in the way?" with the approved helper
  line. Open worksheets never ask.
- **"This helped", one tap**, on the last screen before the closing line.
- **"Save to my Treasure Box"**, where the approved closing copy has it. The
  note is the client's own answers under the prompts they answered, and it goes
  through `POST /treasure/notes` — the same safety-checked write path as any
  other note, not around it.
- Finishing an assigned worksheet closes its `Homework` row, so the Today card
  moves on to the next one instead of offering the same exercise forever.

AI help inside a worksheet is unchanged from Step 4: explain a step, encourage,
ask an open question — never the client's answer, never "another way to see it",
never advice, diagnosis words or a promise, and every reply goes through the
full review before it is shown.

## 4. The Today card

The card shows **one** thing and nothing else (the owner's rule): the next due
assigned exercise with its length in minutes, or — when nothing is assigned —
one light exercise from the catalogue, chosen deterministically so the card
cannot reshuffle between refreshes.

- Undated assignments are still candidates; a dated one wins, then the older
  assignment.
- `GET /users/me/today` now returns `next: { source: 'assigned' | 'suggested',
  toolId, homeworkId, label, estMinutes, dueAt, loadLevel }`, and decides it
  server-side. The app renders what it is given.
- The reminders list, the quote of the day and the homework text are no longer
  rendered on the card. They are still in the payload (other screens and the
  Breathe screen read `assignedExercises` and the pace presets), but the card is
  one line.
- Tapping it opens the item through the same launcher the Library uses, so a
  demanding worksheet still asks the gate question from here.
- No streak, no counter, no missed-day warning, no red badge anywhere.

## 5. Language

English only. `HINGLISH_RELEASED` is still `false`, so a request for Hinglish
gets English and `hinglishAvailable: false`; nothing claims a translation
exists.

## 6. What this step did not do, on purpose

- **The Treasure Box is a placeholder.** The entry exists and leads to a screen
  that says it opens soon. No empty state, no add button, no collections: those
  arrive with the real screen in Step 6A, and an "Add" button here would promise
  something that does not exist.
- **Old summaries are untouched.** Summaries written before Step 4 may contain
  crisis text that the new exclusion rule would now drop. Rewriting clinical
  records is not a side effect of a build step — **this must be noted in the
  Step 12 write-up** and decided there.
- **No scheduling or push.** Nothing in this step sends anything on a timer; the
  Today card is still a pull surface.

## Known gap — the "becoming" spiral

The owner's instruction was "Finishing an exercise grows the existing 'becoming'
spiral". **There is no spiral in the app.** The only spiral in this codebase is
the brand mark (`assets/brand/okuvu-mark.png`) and the landing page's hero
description of it; the Progress screen draws a care-phase row and a mood chart,
and nothing anywhere is called "becoming".

So nothing was grown, and no new growth visual was invented: a made-up progress
motif sitting next to approved copy is indistinguishable from a real one once it
is in a build, and this is a design decision, not a coding one. What exists for
it: every finished worksheet is stored (`WorksheetResponse`, with `helped`, the
before/after ratings and the assignment it answered), so whatever the spiral
reads can read it. The question back to the owner is one line — **which screen
is the spiral on?** — because the honest answer today is that it is not on one.

## Verification

| Suite | Result |
|---|---|
| `apps/api` (vitest) | 1792 tests, 96 files, all passed |
| `packages/shared-types` (vitest) | 82 tests, 7 files, all passed |
| `apps/mobile` (`flutter test`) | 399 tests, all passed |
| `apps/mobile` (`flutter analyze`) | No issues found |

The three checks the owner named, and where each one lives:

1. **Crisis words bring up the help card and alert the therapist** — `worksheets-safety.test.ts`,
   `journal.test.ts` and `treasure-safety.test.ts`, one per surface, each
   asserting the text is saved, the answer says `showHelp`, the flag carries the
   row id and none of the words, and the email carries no content.
2. **A demanding worksheet does not open at 8 out of 10** — `library.test.ts`
   ("refuses a demanding worksheet at 8 out of 10 and offers grounding
   instead"), plus the same refusal on the write path in `worksheets-safety`.
3. **The safety plan stays hidden until the therapist creates one** —
   `library.test.ts` ("the safety plan card is hidden until a plan exists" and
   "refuses the safety plan before it exists"), with the portal editor from
   Step 4 as the only writer.

The migration (`20261109160000_safety_recheck`) was generated from the schema and
compared against it: `prisma migrate diff --from-empty --to-schema` renders the
same table, the same three indexes and the same cascading foreign key, and
`prisma validate` accepts the schema. **No Postgres was available in this
session**, so the migration was not applied to a live database here; that check
belongs with the deploy, and Step 4's live-database run is the precedent it
should follow.

New in this step: outage behaviour both ways (`safety-outage-rule.test.ts`), the
one-item Today card (`users-today-and-tool-preference.test.ts`,
`today_card_test.dart`), the Toolkit tab (`toolkit_screen_test.dart`), the
optional ratings, the barrier question and "This helped"
(`worksheet_runner_test.dart`).
