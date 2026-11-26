# Round thirteen — the "All" extras

25 November 2026. Four worksheets the owner briefed as "All", built as drafts
under the standing rules. Nothing merged, nothing deployed, no APK.

## What was built

| # | Worksheet | Access | Load | Status |
|---|-----------|--------|------|--------|
| 1 | Body map | open [S] | light | draft |
| 2 | Sleep diary | open [S] | light | draft |
| 3 | Muscle relaxation | open [S] | light | draft |
| 4 | Safe place | open [S] | light | draft |

Plus the weekly mood summary, which was not built and is now an api route.

## The Body map and a new content capability

The body outline piece already existed but nothing used it, and it could only
carry a 0-10 strength per tapped part. The owner's brief asks for "the feelings
picker for that spot", so the piece gained `withFeelings`, `feelingsPrompt` and
`feelings` — the vocabulary declared on the piece, the same fixed list every
other picker uses.

The answer carries `feelings` keyed by region id, exactly as `strength` already
is. The api refuses feelings for an untapped part, a feeling outside the
piece's own vocabulary, and feelings on a piece that offers none.

The feelings-list validation was extracted into `feelingListProblems` so the
standalone picker and the per-part picker run the same rules instead of two
copies that could drift.

On the app side the spot widgets gained stable keys (`body_spot_<id>`,
`body_part_<id>`, `body_feeling_<field>_<region>_<feeling>`). That was needed to
test the behaviour and it also gives an accessibility target per part.

## The Sleep diary and the medicine rule

The sleep diary has no medicine field. That is the owner's rule, and it is the
most likely place one would have crept in — sleep medication is exactly what a
sleep diary usually records. The therapist note *mentions* medicine to explain
its absence, which is why the test asserts through `worksheetRequestProblems`
(the real guard over client-facing strings) rather than grepping the SQL: a
substring match flagged the note instead of a question.

It carries `sensitive_check: true`, per the owner's 24 Nov list.

## The two audio-guided worksheets

Muscle relaxation and Safe place are audio-guided in intent. **Nothing is
recorded.** There is no audio column in the schema and none was created.

What ships in the body is the script, read on screen. That is an honest interim:
the exercise works today as a read-along, and when the owner approves the words
and chooses a voice, the audio becomes an addition rather than a rewrite. The
scripts are in `47-approved-all-plans-copy.md`'s draft companion
(`46-draft-all-plans-copy.md`).

Open question for the release check: whether an audio piece is needed at all, or
whether the read-along body plus a separate audio asset is the right shape.

## The weekly mood summary

The owner asked for it "if this isn't built yet". It was not: there was a mood
check-in, a 14-day history, and per-entry sharing, but no weekly view in words.

`weeklyMoodSummary` in `packages/shared-types/mood.ts` produces:

- how many of the last 7 days have a check-in (a count, not a score);
- the feeling words chosen on more than one day, in the client's own words;
- two sentences naming the week's opening and closing words.

It never produces an average, a level, a band, a trend or a ranking of feelings.
The tests assert the absence explicitly, including that the stored 1-5 values and
the 1-5 strength are never rendered as results.

A row whose stored value falls outside 1-5 has no face and therefore no word. It
is dropped rather than labelled "Unknown" — inventing a word for the client is
the one thing a summary about their own words must not do.

Route: `GET /progress/mood/week`.

## Rule compliance

- **Rule 2 — new worksheets stay hidden.** All four are `draft`: no card, no
  direct open, no assignment. Pinned by a test.
- **Rule 3 — safety screening.** All four go through the journal's check on
  every written and spoken answer. The Sleep diary also carries the deeper
  screen. None asks for weight, measurements, calories, food amounts or
  medicines.
- **Rule 5 — no scores.** No aggregate piece; the weekly summary is words plus a
  day count.
- **Rule 7 — pieces built once.** The body outline, extended in the shared
  content model, not copied into a screen.

## Verification

Run, not asserted:

- shared-types 255 tests across 14 files
- api 2300 tests across 130 files
- therapist portal 452 tests across 42 files
- mobile 550 tests
- `flutter analyze` clean
- shared-types and api typecheck clean against a client generated from this
  branch's schema, then the shared client restored to the trunk schema (verified
  by the branch-only models being absent from it again)

One note: on the first full mobile run one test failed —
`consent_screen_test.dart: ConsentScreen on success navigates to /home` — in a
file this change does not touch. It passes 12/12 on its own and the full suite
then passed 550/550 on a re-run, so it is order-dependent flakiness in that
test, not a regression here. Recording it rather than hiding it.

## What is not built

- The client screen for the weekly summary. The route exists; no Dart surface
  calls it yet.
- The portal preview for the Body map's per-part feelings. The preview renders
  the outline; the per-part picker is app-only so far.
- Audio for Muscle relaxation and Safe place.
- No Hinglish.
