# Mood check-in — faces, feeling words, per-check-in sharing

Branch `feat/mood-faces-words`, worktree `/opt/data/okuvu/wt/mood-checkin`,
based on `5497b3b` (the release/mobile-1.0.27 tip plus its changelog row).
Nothing merged, no APK built.

## What changed, in user terms

**Step 1 — the five faces.** The 1-5 number row is gone from both places it
appeared (the Home card and the Library's mood screen). In its place are five
faces drawn in the app with the OKUVU palette — outline, eyes, brows and mouth
as paths, not emoji — with the words Awful / Low / Okay / Good / Great under
them. Tapping one face is the whole required step. No phone emoji is used
anywhere: a system emoji font cannot take the brand colours and differs on every
handset.

**Step 2 — words and strength, both optional.** After the face:
up to three chips from the owner's four groups, a "Something else" chip that
opens a small text box, and a "Skip" button that is a real skip (the client can
save with nothing but a face). Below that, the optional slider "How strong is
this feeling?" 1 (a little) to 5 (a lot). Saving stores the face, the words, the
"Something else" text, the strength and the date the api stamps (the client's
IST day).

**The old ratings keep their meaning.** `mood_value` is unchanged and still 1-5;
1 = Awful … 5 = Great. Every check-in written before this change reads the same
as it did, and the word under each face is the same map on the client and in the
portal.

**The gentle card.** Choosing "hopeless" or "numb" shows, after the save, a card
with the owner's sentence ("That sounds really heavy. You don't have to sit with
this alone. Would you like some support right now?") and three buttons: "Talk in
chat" opens the chat as normal, "See support lines" opens the app's existing
crisis screen (no new list of numbers), "Not now" closes the card. It is not a
crisis alert: no safety flag is written, no email is sent, and nothing reaches
the therapist because of those two words.

**Private by default, shared one day at a time.** Every check-in starts Private.
Each saved entry in the client's list carries its own "Share with my therapist"
switch, off until the client turns it on, with the existing approved labels and
the existing first-share notice (once per install).

**What the therapist sees.** On the client's "Shared with me" tab, a "Mood
check-ins" section: the face, the words (chips plus "Something else"), the
strength and the date, newest first. Only shared days are queried, so an
unshared check-in is not there — not even as a count.

**"Your week", for the client only.** A small card on the mood screen: how many
times each face was chosen in the last seven days (counts under the faces), and
one plain sentence naming the three most-chosen words — "This week you felt
calm, tired and anxious most often." Counts and words only: no score, no trend,
no advice, no comparison. It is never rendered in the portal.

## Data

`MoodLog` gains `feeling_words TEXT[]` (default empty), `feeling_other`,
`strength_1_5` (CHECK 1-5), `shared_with_therapist` (default false), `shared_at`,
`unshared_at`, and an index on `(user_id, shared_with_therapist, date_ist DESC)`
for the therapist's read. `feeling_words` is CHECK-limited to three, and the api
refuses any word that is not in the fixed vocabulary — free text has its own
column so it can be screened.

`mood_log` joins `SHAREABLE_KINDS`, so the one existing `POST /sharing` route
writes it; there is no second share path.

The vocabulary (face labels, the 18 words in four groups, the strength copy, the
gentle card and its buttons) lives in `packages/shared-types/mood.ts` for the api
and the portal. Flutter cannot import it, so the Dart copy in
`apps/mobile/lib/src/features/mood/mood_vocabulary.dart` is pinned to it by
`apps/api/src/__tests__/mood-vocabulary-parity.test.ts`, which reads the Dart
file as text. Changing a word in one place and not the other fails that test.

## What was run

| Check | Result |
| --- | --- |
| `apps/api` tsc (`./node_modules/.bin/tsc -p tsconfig.json --noEmit`) | clean |
| `apps/api` vitest | 113 files, 2008 tests passed |
| `apps/therapist-portal` tsc | clean |
| `apps/therapist-portal` vitest | 39 files, 422 tests passed |
| `apps/therapist-portal` `next build` | succeeded; `/clients/[id]/shared` in the route table |
| `apps/mobile` `flutter analyze` | No issues found |
| `apps/mobile` `flutter test` | 499 tests passed |
| Shared-types subpath at runtime (`node -e import('@okuvu/shared-types/mood')`) | loads, 5 faces, 18 words |
| Migration, fresh database | full chain applied, 0 failures |
| Migration, populated database | old row kept: `feeling_words` `{}`, `shared_with_therapist` false |
| CHECK `strength_1_5 = 6` | rejected (`MoodLog_strength_range`) |
| CHECK four words | rejected (`MoodLog_feeling_words_max`) |
| `prisma migrate diff` against the migrated database | 0 statements naming `MoodLog` |

The migration was applied to a real Postgres 17 cluster (local, port 5432), once
to an empty database and once to one carrying a check-in written before the
change.

## What this step did not do, on purpose

- No merge and no build. The branch is not on `main` and no APK was produced.
- No new helpline numbers. "See support lines" raises the existing crisis overlay.
- No safety flag, email or therapist notification from "hopeless"/"numb". The
  card is the whole response.
- No "Your week" data in the portal, and no per-therapist copy of a shared
  check-in: visibility is the boolean on the client's own row.
- The session-prep digest's "shared" counts are unchanged (journal, worksheets,
  notes). Mood check-ins are shown on "Shared with me", not folded into that
  count.

## Known gaps and decisions to confirm

1. **The approved document's two post-check-in screens are no longer collected.**
   The Library's mood screen used to ask "What was happening just before you felt
   this?" and "How strong is this feeling right now?" 0-10, from the approved
   worksheet copy. The owner's new flow (face → words → 1-5 slider) replaces both
   on this screen. The columns `trigger_text` and `intensity_0_10` are untouched
   and keep their old values; nothing reads them from this screen any more. The
   demanding-worksheet gate is unaffected: it reads the worksheet flow's own 0-10
   answer, not the mood log. If those two questions should still be asked, they
   need their own step.
2. **The "Something else" box is screened; the chips are not.** A check-in's only
   free text is that box, and it runs the same check chat and the journal run
   inside the write path, so a crisis typed there behaves like a crisis typed in
   chat (flag, content-free alert). This is the standing rule for any client-typed
   text, and it is separate from the gentle card — the card is never a flag.
3. **One check-in per IST day.** The existing unique key (`user_id`, `date_ist`)
   is kept, so a second save the same day updates that day's entry. The list of
   saved entries is therefore one row per day.
4. **Your week counts the fixed vocabulary only.** A typed "Something else" is
   stored and shown on the entry, but it is not a word in the summary sentence,
   because a phrase would not read as a word list.

## Worktree note

The first `next build` in this worktree failed inside Turbopack with
`Could not find the Next.js package (next/package.json)` because `node_modules`
resolved into the shared checkout's pnpm store. A real
`pnpm install --prefer-offline --ignore-scripts` in the worktree fixed it (the
store is warm); `prisma generate` was re-run in `packages/prisma` afterwards, and
all three suites were re-run against the real install.

Disk free at the end of this step: 28 GB on `/opt/data`.
