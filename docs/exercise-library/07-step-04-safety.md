# Step 4 — the safety pass, the plan editor, and the rules around both

Status: built and verified on `feature/exercise-library`. Nothing merged, no APK.
Branch tip before this step: `3b80b59` (Step 3).

This is the step the owner called the most important one. It has four parts: the
safety plan editor in the portal, one safety check used by every surface, the
rules that follow from that check, and the checks that prove the rules.

---

## 1. The safety plan card is hidden until a plan exists

Step 3 showed the card greyed out. The owner's decision (9 Nov 2026) is that it
must not appear at all until the therapist has made a plan with the client.

- `GET /library` filters an `in_session` card out entirely when no `SafetyPlan`
  row exists for that user. Not `available: false` — no card.
- `GET /library/ws_safety_plan` answers **404 NOT_FOUND**, the same answer an
  unknown id gives, so a guessed URL cannot discover that a plan is coming.
- Once a plan exists the card appears, and tapping it opens the plan itself
  (`/safety-plan` in the app), not a worksheet form.

## 2. The safety plan editor (portal)

`/clients/[id]/safety-plan`, reached from a new **Safety plan** tab on the client
hub.

- **Seven parts**, in the approved order, with the owner's headings and the
  therapist's in-session question above each box. The parts are read from the
  approved catalogue body (`ws_safety_plan`), not retyped.
- **Only the client's own linked therapist** can read or write it. "Linked"
  means a live `TherapistClient` row (`ended_at: null`); an assignment that once
  existed is not permission.
- **Part 5** carries the therapist's own contact details (typed) and the five
  crisis lines (read-only, from the central list).
- **One plan per client** — a living document that is edited together, not a
  version history. Saving is what makes it appear on the client's side.
- An empty plan is refused: saving one would put a card on the client's screen
  with nothing on it.

Data: new `SafetyPlan` model (`user_id` unique, `answers` JSON, therapist
contact, who created/updated it). Not a `WorksheetResponse` — that table is
client-authored and deliberately has no therapist column, and a plan is the
opposite shape. Migration `20261109150000_safety_plan`, additive only. The
erasure path and its schema-derived test were extended.

On the client side: `GET /safety-plan` returns the seven parts (therapist
framing stripped), the client's answers, the therapist contact, and the five
helplines from the central list. The crisis screen carries a **My plan for hard
moments** button that is rendered only when that request returns a plan.

The safety plan cannot appear inside chat: the chat tool cards are a typed map
of exercise ids (`ToolCardType`), so a `ws_*` id is not expressible as one.

## 3. One safety check, used everywhere

`apps/api/src/lib/safety-check.ts` — `checkClientText(text)` — is the chat check,
lifted out of the turn:

1. the deterministic crisis floor (`hasCrisisLanguage`) first, so a disclosure is
   caught with no model involved;
2. otherwise A1's classifier, under an 8-second deadline;
3. **a failure, a throw or a timeout is a possible risk (S3), never "safe".**

The surfaces that call it, all inside the write:

| Surface | Route | Flag source | Subject |
|---|---|---|---|
| Journal entry | `POST /journal` | `journal_entry` | `journal_entry` + row id |
| Worksheet answers | `POST /worksheets/:toolId` | `worksheet_answer` | `worksheet_response` + row id |
| Treasure Box note | `POST /treasure/notes` | `treasure_note` | `treasure_note` + row id |
| Treasure Box collection name | `POST /treasure/collections` | — (name only) | — |

On S3/S4 the behaviour is chat's, in this order: **save what the client wrote**,
answer `safety.showHelp`, record the flag with the row it came from and **no
content**, and send the therapist the same alert email (no content). The app
raises the same crisis card chat raises.

`SafetyFlag` gained the non-chat identity (`subject_kind`, `subject_id`, unique
together) — the columns were already in the schema from Step 1; the writer and
the router now use them.

## 4. The journal

- Entries are checked before they are stored (previously: stored silently).
- The AI-written journal prompt (J2) now passes the **final safety review**
  (`a9PostReview`) before the client sees it. A blocked prompt, an empty one, a
  review failure or a thrown call all serve the vetted static prompt instead —
  nothing unreviewed reaches the screen, and the screen is never left empty.

## 5. Demanding worksheets

Before the thought record, spot the thinking trap, worry tree or letter from a
kind friend opens, the client answers "How strong is what you're feeling right
now?" on a 0–10 slider.

- Enforced by the api, not only by the app: `GET /library/:toolId` for a
  `demanding` row requires `?feelingNow=N` (400 `FEELING_NOT_GIVEN` otherwise)
  and refuses above 5, or in a crisis state (S3/S4), with 403 `DEMANDING_GATE`
  carrying the approved message, the two buttons and the grounding exercise id.
- The rating is echoed back as `feelingBefore` and stored as the worksheet's
  "before" rating; `POST /worksheets/:toolId` refuses a demanding worksheet with
  no rating or one above 5, so a direct POST cannot skip the question.
- Light worksheets never ask.

## 6. AI help inside a worksheet

`POST /worksheets/:toolId/help` is the only AI help a worksheet offers.

- The model **never receives the client's answers** — only the worksheet label,
  the step's own prompt and helper text, and an optional question about the step.
- The system prompt forbids: writing/drafting/suggesting an answer, suggesting
  "another way to see it" in a thought record, advice, diagnosis words, and any
  promise that something will help.
- The reply goes through `a9PostReview` before it is returned. Blocked, failed or
  empty → `503 HELP_UNAVAILABLE` with no text. There is no invented fallback
  line: the step is already on screen, so silence costs the client nothing.

## 7. Summaries, Report Card and session preparation

- **Crisis turns never reach a summary.** The worker reads the session's
  `SafetyFlag` rows, maps them to turn numbers, and drops both halves of that
  exchange from the transcript. If the flags cannot be read the summary fails
  and is retried — it is never summarised with the flags unknown.
- Memory extraction (which feeds session-prep themes) consumes the summary, not
  raw turns, so the same exclusion covers it.
- **Report Card and Session Prep now use the one chat-access predicate**
  (`chatAccessWindow` from `packages/shared-types`): the client's own approval
  timestamp plus the 30-day window, closed early by a revocation. The bare
  boolean they read before could not expire and could be set by the therapist.
- Nothing unshared is read: journal entries, worksheet answers and Treasure Box
  notes are not inputs to any of these three surfaces.

## 8. Privacy wording

The approved sentence is on the journal, on every worksheet's first screen, and
on the privacy page's journal row. It replaced the old line promising the app
does not read entries, which the safety pass made false.

> Your therapist can't read this unless you choose to share it. If OKUVU's safety
> system notices you may be in danger, it will show you help straight away and let
> your therapist know you may need support, without sharing what you wrote.

The Treasure Box has no screen in the app yet, so the sentence is not rendered
there; the write path it will use is built and checked.

## Verification (actual output)

Run from the worktree, whole suites, not the files touched:

- `packages/shared-types`: **82 tests / 7 files pass**. New:
  `safety-surface.test.ts` — the five helplines in clinical order, no retired
  service, the app's crisis screen carrying the same numbers, the gate table
  (6/8/10 closed, 5/0 open, S3/S4 closed, unanswered and out-of-range closed),
  the privacy line and blocked-worksheet copy present in the approved document,
  and the app's journal screen carrying the approved sentence.
- `apps/api`: **1781 tests / 95 files pass** (`vitest run`, whole suite). New suites:
  - `safety-check.test.ts` — the floor beats the model, S3 flagged, S0–S2 not,
    throw → S3, A1 fallback → S3, timeout → S3, empty text → S0.
  - `journal.test.ts` (extended) — a crisis entry is saved, flagged as
    `journal_entry` with the row id and no text, and the therapist alert carries
    no words; a degraded check is treated as risk; an ordinary entry is not
    flagged; a blocked AI prompt is replaced by the vetted list.
  - `worksheets-safety.test.ts` — crisis words in an answer raise the card,
    flag and email; a nested row-list answer is found; 8/10 refused with nothing
    stored; no rating refused; 5/10 saved with `feeling_before = 5`; the safety
    plan is not a form.
  - `worksheet-help.test.ts` — approved help, blocked draft refused whole, review
    failure refused, model unavailable refused, unknown step 404, no help inside
    the safety plan, and the prompt forbidding each ruled-out behaviour.
  - `treasure-safety.test.ts` — crisis note saved + flagged + alert with no
    text; ordinary note not flagged; empty note refused; another client's
    collection refused.
  - `safety-plan-route.test.ts` — no plan → NOT_CREATED_YET; with a plan → seven
    parts in order, the client's words, five helplines, no therapist framing.
  - `helpline-parity.test.ts` — the chat block and the structured list are the
    same five services, same numbers, same order.
  - `safety-flags.test.ts` (extended) — a non-chat flag carries the row, never
    the text.
- `apps/therapist-portal`: **359 tests / 32 files pass**, including the new
  safety-plan router suite (unlinked therapist refused on read and write,
  `ended_at: null` demanded, seven parts, create vs update, empty plan refused,
  unknown part refused) and the chat-access tests (bare flag refused, expired
  window refused, closed access refused).
- `apps/worker`: **93 tests pass**, including crisis-turn exclusion and
  "flags unreadable → summary fails rather than guesses".
- `apps/mobile`: **388 tests pass**, `flutter analyze` clean. New:
  `safety_plan_screen_test.dart` (seven parts, the client's words, both
  helplines, Get help now raises the crisis screen, empty state).

### The migration, proven against a real database

A schema change is not proven by `tsc` and a mocked suite, so a throwaway
PostgreSQL 17 was stood up locally (extracted binaries, no root, no Docker) and
the whole chain applied with the same command `post_build` runs:

```
apps/.../20261109130000_seed_library_worksheets/migration.sql
  └─ 20261109140000_mood_checkin_trigger_intensity/
  └─ 20261109150000_safety_plan/
All migrations have been successfully applied.
```

Then, against the migrated database:

- `information_schema` shows the eight columns with the nullable set the schema
  declares (`answers` jsonb NOT NULL, `created_by_therapist_id` NOT NULL,
  `therapist_contact` and `updated_by_therapist_id` nullable).
- `SafetyPlan_user_id_key` refuses a second plan for the same client
  (`duplicate key value violates unique constraint`).
- `SafetyPlan_user_id_fkey` is `ON DELETE CASCADE`, and deleting the `User` row
  left zero plan rows behind — the erasure path a real deletion uses.
- `prisma migrate diff` against `schema.prisma` contains **zero** `SafetyPlan`
  statements. Its remaining output is the known pre-existing harness drift
  (`Campaign`, `ConversationRun`, `UserMemory.homework_track`), unchanged by
  this step.

## What this step did not do, on purpose

- No push notification, no scheduler. The therapist alert is the existing email.
- No per-item share control (owner decision 6 is a later step); nothing here adds
  a second consent path.
- No fallback copy anywhere a model might fail. Silence or the vetted list.
- The four "Open when…" Treasure collections are still not seeded, because the
  approved document does not name them and inventing the names is inventing
  clinical copy.

## Known gaps, stated plainly

1. **The Treasure Box has no screen in the app.** Its write path is built and
   safety-checked, but a client cannot reach it yet, so the privacy line and the
   box itself are awaiting that screen.
2. **The worksheet help has no widget test.** The control ("What does this
   mean?" under each step) and the route are built and the route is tested; the
   Flutter side is covered only by `flutter analyze`, because this app's widget
   tests stub dio and a stubbed endpoint would prove nothing about the review.
3. **The safety plan editor has no client-side "edited since" note.** The app
   shows the plan; it does not tell the client the plan was updated. Not a safety
   property, but worth knowing.
4. **Summaries written before this step may already contain crisis text.** The
   exclusion applies to summaries generated from now on; no backfill of existing
   rows was attempted, because editing a clinical record to remove text is not
   reversible.
