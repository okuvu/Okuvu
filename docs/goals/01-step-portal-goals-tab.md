# Step 1 — goals become a queue you work through, one at a time

**Status:** built, tested, not deployed. Branch `feat/client-goals` off
`origin/develop` (`f5621e2`). No push, no migration applied to any database.

Owner's request (Dr Shubhangi Goswami, 22 Nov 2026): *"goal setting … I see no
specific entry for that in the therapist portal … the client and therapist should
be aware of the goals and target them one by one … there needs to be a guide as
to how to set goals (text available only to therapist)."*

## What was actually there

Goals existed, but not as a place:

- `ClientGoal` (Prisma) and the `goals` tRPC router with `list`, `add` and
  `setStatus` — written in Step 8.
- The only way to edit them was a small block **inside the Notes page**, under a
  line that said "Your client never sees this list".
- They could be attached to a homework assignment (`Homework.therapy_goal`
  copies the wording at assign time).
- No order, no focus, no guide, and no client-facing surface at all — the
  mobile app has zero references to goals.

So the therapist could only find goal setting by opening Clinical notes, and
nothing anywhere said which goal was the one currently being worked on.

## What changed

1. **A Goals tab of its own**, next to Care Plan in the per-client tab strip.
   Route `/clients/[id]/goals`.
2. **An order and a focus.** `ClientGoal.position` (new column). The lowest
   position among *active* goals is the current focus; the rest wait their turn.
   Marking a goal achieved or dropped removes it from the queue and the next one
   becomes the focus by itself — no second action needed.
3. **Controls on the list:** add at the end, Make focus, Move up, Move down,
   Mark achieved, Drop, Reopen.
4. **A Goals card on the client profile**, showing the current focus and counts,
   so the client's page answers "what are we working on" without a click.
5. **Notes page** no longer writes goals. It keeps a card that links to the new
   tab — one writer for the table, not two.
6. **Homework page** reads the new list shape and points its "linked goal" hint
   at the Goals tab.
7. **A therapist-only guide** on the page, collapsed behind `<details>`, in one
   constant (`goal-guide.ts`) so replacing the wording is one edit. It is
   procedural — how the queue behaves, what the field is for, what it must not
   hold — and makes no clinical prescription, because that is the owner's
   judgement and not the page's.

## Verification that actually ran

- `vitest run` in `apps/therapist-portal`: **430 tests, 40 files, all pass**
  (new `goals.test.ts` covers position ordering, focus = first *active* goal,
  append position, promote-to-top renumbering, no-write at the edge, and a goal
  that is not on the list).
- `tsc --noEmit` in `apps/therapist-portal`: clean.
- `next build`: succeeds; `/clients/[id]/goals` appears in the route table.
- `prisma validate`: schema valid. `prisma generate` re-run.
- Disk free at build time: **26 GB**.

## What this step did not do, on purpose

- **The client cannot see a goal yet.** Her words — "the client and therapist
  should be aware of the goals" — need a client-facing surface, and that surface
  needs approved client copy. I have not written any. The `shared_with_client`
  decision and the two or three sentences the client would read are hers.
- **The AI companion does not know the goal.** The therapist's goal wording is
  not in the A2 context bundle. That is a clinical decision (therapist free text
  reaching the model) and, like `care_plan_focus`, it would also travel to the
  phone through `/users/me/context` unless that route is fixed first.
- **Nothing polices goal wording.** If a goal carries clinical shorthand and a
  future surface shows it to the client, no check catches that. The guide says
  "write the goal in words you would be willing to read aloud", which is advice,
  not enforcement.
- **The guide is a draft (v0.1), marked as such above the text.** It is written
  by product and awaiting the clinical authority's approval.

## Known gaps

- The migration was **not executed** — this host has no Postgres and no database
  is reachable from here. The SQL is one additive `ALTER TABLE` plus a
  `ROW_NUMBER()` backfill of the existing rows; it needs a real `migrate deploy`
  against a scratch database before production.
- Reordering rewrites every row's position inside one `$transaction`. Fine for
  the handful of goals a client has; it would not be the right shape for
  hundreds.
- Position is per `(therapist, client)` as read, but there is no unique
  constraint on it, so a concurrent edit from two portal tabs could tie two
  rows. Ties fall back to `created_at`, which is why the read orders by both.
