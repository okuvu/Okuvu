# Step 02 — the client sees their goals, and completion has to be earned

**Status:** built and verified; not deployed, not in a build.
**Branch:** `feat/client-goals` (on top of step 01, the portal goals tab).
**Authority:** Shubhangi Goswami, 23 Nov 2026 — four changes in one message.

## What was asked

1. The client should be able to see their goals.
2. The therapist changes a goal's status to done when the client achieves it.
3. The today card shows homework even when it is done; it should go away when
   the task is done.
4. The client can tap "Mark done" on an exercise they have not done, so there is
   no way of checking validity. Remove that option. Only a prescribed exercise
   that the client actually does should be marked done, automatically.

## What changed

**Goals, client side.** `GET /users/me/goals` (new, `apps/api/src/routes/goals.ts`)
returns the client's goals in the therapist's order with the one in focus marked;
`dropped` goals are never sent, and the list is scoped to the therapist the
client is linked to right now. The app has a `Your goals` screen (`/goals`) and a
card on Home naming the goal in focus. Read-only: no control on the client side
changes a goal's status. That is item 2, and it already existed — `goals.setStatus`
on the portal's Goals tab. The client read is what was missing.

**Item 3, done homework leaving the card.** Two separate defects, both fixed:

- The today card's single `homework` field read straight `status = 'active'`. A
  one-off closes when done, but a *repeating* assignment stays active by design,
  so a client who did this morning's exercise kept seeing it all day. The card's
  `next` field already excluded it; `getActiveHomework` now excludes a completion
  from the client's current IST day too. This also stops the companion being
  told to follow up on work already done (`agent-context.ts` reads the same
  helper).
- The app never re-fetched the card after a completion. The homework screen
  invalidated the homework list only, so Home kept rendering the pre-completion
  card until something else refreshed it. The completion path now invalidates
  both.

**Item 4, no self-declared completion.**

- `POST /users/me/homework/:id/complete` is **removed**. A route that closes any
  assignment on the client's say-so is the defect, not the button in front of it.
- `POST /users/me/homework/practice-complete` replaces it: the body names a
  **tool**, never an assignment, and the server looks up the caller's own active
  assignment for that tool. Answers `not_assigned` (200) when there is none, and
  `already_done_today` for a second run in the same IST day.
- The app reports a finished session from the players, not from a button: the
  guided breathing card when its last planned round completes, the grounding card
  when the fifth sense is walked. Stopping early, and tapping "skip" on grounding,
  report nothing. Chat tool cards report the same way, because the exercise is
  the same exercise.
- `Mark done` is gone from the homework screen, and rendering that screen
  dispatches no write at all.

**Typed homework** (the therapist's own words, e.g. "write a letter you will not
send") has no in-app proof of any kind. It is now closed from the portal's
homework page (`homework.markCompleted`), which already existed.

## Verification

| Check | Result |
|---|---|
| `apps/api` `npx vitest run` | 2041 passed / 1 failed, the failure pre-existing (see below) |
| `apps/api` `npx tsc --noEmit` | clean |
| `packages/shared-types` `npx vitest run` | 93 passed / 1 failed, pre-existing (`sharing.test.ts` expects three shareable kinds; `mood_log` is in `SHAREABLE_KINDS` on this branch already) |
| `apps/mobile` `flutter analyze` | No issues found |
| `apps/mobile` `flutter test` | 506 passed |

New tests: 6 on the practice-complete route (completion, not-assigned,
already-done-today, repeating stays open, malformed tool id, old route 404), 4 on
the goals route, 5 on the goals screen and Home card, 2 on the breathing card's
reporting, 1 rewritten on the homework screen (asserts no completion control and
no write).

## What this step deliberately did not do

- **No APK, no deploy.** The api change and the app change must land together in
  the right order (see the gap below).
- **No client-visible proof of practice.** See the limit below.
- **Goal text is not sent to the companion.** It still only knows the care plan.

## Known gaps, stated plainly

1. **The server cannot prove a body did the breathing.** It proves the app
   reported a finished session. A determined client could call the endpoint
   directly. What is now impossible is the one-tap claim with no session behind
   it — which is the change the authority asked for. Wording anywhere in the
   portal should stay "reported", not "verified".
2. **Deploy order matters.** The api no longer serves `/:id/complete`. An
   installed build that still has the old screen will show "Couldn't save that"
   when the client taps Mark done, because the route is gone. Ship the app build
   first, then deploy the api — or accept that window on a tester build.
3. **Typed homework can now sit on the today card indefinitely** unless the
   therapist closes it from the portal. That is a deliberate consequence of
   removing the button, but it moves work onto the therapist, and it should be
   watched in beta.
4. **The client-facing wording is draft.** `GoalsCopy` in
   `goals_screen.dart` holds one block of strings: the screen title, "Working on
   now", "Next", "Achieved", one line saying what the list is, and the empty
   state. All structural labels, none clinical. Awaiting the authority's wording;
   replacing them is that one class.
5. **A goal's wording reaches the client verbatim.** There is no separate
   client-safe field. The portal's guide already asks for goals written in words
   the therapist would read aloud; nothing enforces it.
