# The worksheet Library, the Treasure Box and the safety check — a guide for the team

Written 10 November 2026, at the end of Step 12. Everything below describes code on
`feature/exercise-library` (tip `d91dabc` and the commits after it), **not** what is running in production.
Nothing has been merged and no APK has been built.

This guide is for anyone who has to work on the feature: engineers, the clinical lead, whoever picks it up
next month. It is written in plain English on purpose. Where a rule came from a decision the owner made,
the date is given so the reason can be found.

---

## 1. What was built

Eight steps, each committed separately:

| Step | What it added |
|---|---|
| 1 | Storage: worksheet answers, their before/after ratings, "this helped", barriers |
| 2 | The step types a worksheet is made of (one piece per screen, branches, row lists, scales) |
| 3 | The catalogue: 16 approved worksheets in the owner's nine sections, plus 15 placeholders |
| 4 | One safety check for everything a client writes; the safety plan editor in the portal |
| 5 | The client side: Toolkit tab, the Library, the runner, the one-item Today card |
| 6 | Sharing and privacy: a label and a switch on everything, My toolkit, Past me, data download/delete |
| 6A | The Treasure Box |
| 7 | The Updates list and the "Something new in OKUVU" email |
| 8 | The therapist's Library, assigning with a personal line, and sets |
| 9 | Seeing what clients share: patterns, session preparation, share audit |
| 11 | The 24-point safety and privacy gate (see `14-step-11-checks.md`) |
| 12 | This guide |

Where things live:

- The catalogue and its copy: `packages/shared-types/worksheets/`
- The safety check: `apps/api/src/lib/safety-check.ts`
- Client screens: `apps/mobile/lib/src/features/library/`, `.../my_space/`, `.../home/toolkit_screen.dart`
- Portal: `apps/therapist-portal/src/app/clients/[id]/` (`safety-plan/`, `shared/`, `homework/`) and
  `apps/therapist-portal/src/app/worksheets/` (the therapist Library)
- Email: `apps/api/src/routes/updates-notify.ts` and `apps/api/src/lib/`
- Step-by-step records: `docs/exercise-library/01` … `15-this-file`

---

## 2. How the Library works

**For the client.** The Library is one card per exercise, grouped under the nine section names from the
approved document, in this order: Notice & name · Calm my body · Untangle my thoughts · Do what matters ·
People & boundaries · Be kinder to me · Energy & life · Before & after session · Safety. The approved line
sits at the top: "Small exercises to try anytime. Some are added by your therapist."

A client sees every approved exercise that anyone can open, plus anything their own therapist has
assigned to them. They never see a therapy-type label ("CBT"), an access label ("assigned"), or a count.

Doing one is one piece per screen. The client can rate their feeling before and after if they want to
(0–10). An assigned worksheet asks "Did you do it?" and, only if the answer is no, what got in the way.
Each worksheet ends with one-tap "This helped". Where the approved closing copy has a "Save to my
Treasure Box" button, that button really saves.

**The demanding gate.** Four worksheets — the thought record, spot the thinking trap, the worry tree and
the letter from a kind friend — ask "How strong is what you're feeling right now?" on a 0–10 slider before
they open. Above 5, or while the client is in a crisis state, the worksheet does not open: the approved
"try something calming first" message appears with a grounding button, and after grounding the client is
offered "Open my Treasure Box". Five or below opens it, and that number becomes the "before" rating. Light
exercises never ask. **The gate is enforced by the api**, not only by the screen, so a client cannot skip
it by tapping a link.

**The Today card.** One main item: the next due assigned thing — a worksheet or homework the therapist
typed in their own words — with its minutes. Under it, smaller, the reminder line and the quote. If
nothing is assigned it suggests one light exercise. No streaks, no missed-day warnings, no red badges.

**For the therapist.** `Worksheets` in the portal is now `Library`: every approved exercise, filterable by
section, therapy type, who can open it, how demanding it is and how long it takes, each card carrying the
"For therapists" note, each with a Preview that shows exactly what the client sees. Assigning adds a
personal line in the client's own words, how often, a due date, a goal from Clinical Reasoning, and a
private note the client never sees. Typed homework is unchanged. A therapist can also save a named set
("My anxiety starter set") and assign the whole set in one go; sets are visible only to their author.

---

## 3. How the Treasure Box works

It is the client's own place for things worth keeping — a keepsake box, not a medical record.

- **Adding.** Type, or tap the mic and speak. Add tags. File it into an "Open when…" collection.
- **The four starting collections**, approved 10 Nov 2026 and seeded the first time a client opens the box:
  *Open when I'm anxious*, *Open when I feel low*, *Open when I'm overwhelmed*, *Open when I need a win*.
  Clients can add their own.
- **Saving from elsewhere.** A finished worksheet's "Save to my Treasure Box"; the gift icon on a journal
  entry; long-press a single OKUVU chat message; the gift icon on a Library card. Each note is a **copy**,
  not a link: deleting the journal entry afterwards leaves the note alone.
- **Where it came from** is printed on every note, using five labels: Me · My therapist · From a
  worksheet · From my journal · From OKUVU chat. (An exercise saved from the Library is labelled "From a
  worksheet" — the Library is made of worksheets, and the owner ruled out a sixth label.)
- **Going back.** Pin a favourite, search, filter by tag or collection, and tap "Pick one for me" to see
  one **pinned** note at random. "Pick one for me" never draws from the unpinned box.
- **Privacy.** Every note starts Private and carries the same share switch as everything else.
- **Safety.** Every note — typed, spoken, or copied from chat or a journal — goes through the same safety
  check on save (§6).

The Treasure Box is *not* on the crisis screen. It is offered after grounding, from the crisis screen only
through the safety plan.

---

## 4. How sharing and privacy work

The rule underneath all of it: **the client decides, one item at a time, and the therapist sees nothing
else.**

- Every journal entry, worksheet answer and Treasure Box note carries a label: **Private** or **Shared
  with my therapist**. Everything starts Private — the column default is false and no existing row was
  backfilled.
- Each item has its own switch. The first time a client shares anything, the approved confirmation line
  appears with Share and Cancel, and nothing is written until they tap Share. (Once per install; stopping
  asks nothing, because consent was for sharing.)
- After an assigned worksheet the client is asked "Share this with your therapist?" with **Share** and
  **Keep private** the same size and neither chosen in advance.
- Stopping a share updates that one row. The portal reads that same row with a `shared = true` filter, so
  the item is gone on the therapist's next read — there is no copy anywhere and no cleanup job.
- The portal's **Shared with me** tab is the only place in the portal that can read client writing, and
  only while the client is still linked to that therapist. Ended links read nothing at all.
- Access is not the same as visibility: Report Card and session preparation follow the same rule as
  everywhere else — chat-based material only after the client's approval in the app, and only inside the
  30-day window.
- Every share and unshare is written to the hash-chained audit log as `SHARE_ENABLED` / `SHARE_STOPPED`
  with the kind and the row id, and **never the words**.
- Clients can delete their own journal entries, worksheet answers (from Past me) and notes, download
  everything as a readable document, and delete their account — which removes their entries, notes,
  worksheet answers, goals, safety plan and therapy record.

---

## 5. What the therapist sees of shared work

- **Patterns** per exercise: before and after ratings, what got in the way, whether it helped, and a
  simple unlabelled trend. Descriptive only — no scores, no grades, no "improving" or "getting worse".
- **Assigned work**: whether an assignment was done. For work the client did not share, that is the only
  thing visible — the query behind it does not even fetch answers, ratings or barriers.
- **Session preparation**: a short "since your last session" section listing shared items, which
  assignments were done, and the client's "What I want to bring to session" if they shared it. The
  chat-based half still needs the client's approval and the 30-day window, and does not even run without
  it.

There are tests that fail if "better", "worse", "improv", "deteriorat", "declin", "non-compliant",
"resistant", "unmotivated", "poor", "struggl", "engaged" or "score" ever appear in that descriptive output.

---

## 6. The safety check, and what happens when it is down

**One check, not four copies.** `apps/api/src/lib/safety-check.ts` is the same check chat already used,
lifted out of the chat turn so every write path calls the same function: chat messages, journal entries,
worksheet answers and Treasure Box notes. The order is fixed:

1. **The crisis-word floor runs first.** It needs no model, so it works during an outage. It includes
   first-person crisis words *and* the "asking for a friend" / third-party forms, so a disclosure written
   about someone else is not dismissed.
2. **Then the classifier** (A1), under an 8-second deadline.
3. **If it fails, throws or times out, the write is "unscreened": moderate concern (S2).** Never safe,
   never a crisis.

**When it finds a crisis (S3/S4)** — identical on all four surfaces:

- the text the client wrote is **saved**;
- the help card is shown straight away;
- a flag row is written with the surface and the row id, and **none of the words**;
- the therapist gets the same alert email, with **no content in it**.

**When the check cannot run** — the owner's rule of 9 Nov 2026, corrected on 10 Nov:

- the crisis-word floor still runs, and a hit there is a full crisis as above;
- if the floor finds nothing, the client sees "Help is here if you need it." with a Get help button;
- the entry is saved, **no flag and no email go anywhere** — a crisis card on every outage would train
  therapists to ignore the real ones;
- the write is queued for a recheck, and the queue holds a pointer to the row, never the words;
- a background sweep screens it again when the classifier answers, and **only then** raises a flag and
  sends the alert if it finds risk. A recheck that still fails backs off, and after eight attempts the row
  is marked abandoned and logged loudly rather than quietly dropped.

**AI-written text.** Anything the app writes for a client passes the same final review chat replies pass:
the journal's AI prompt (if it is blocked the client sees the vetted static prompt), and worksheet help
(if it is blocked the client sees that step's own approved helper line from the owner's document, or
nothing at all — never "help isn't available", which the owner ruled out on 10 Nov because it worries
someone who is already struggling).

**What the worksheet helper may do.** Explain what a step is asking, encourage, and ask one open question.
It may never write the client's answers, suggest "another way to see it", give advice, use a diagnosis
word, or promise that something will help. It never receives the client's answers at all, so a trick typed
into a worksheet has nothing to rewrite. When a client asks it for the answer ("What's the balanced
thought?", "Just tell me what to do"), the reply says the answer is theirs to find and asks an open
question.

**Crisis writing and summaries.** Both halves of any exchange carrying a safety flag are dropped from
summary generation, and if the flags cannot be read the job fails and retries rather than guessing.
Anything written during a crisis therefore cannot appear in a summary, the Report Card or session
preparation.

---

## 7. How to add a new worksheet

Approval comes first (§8). Once the wording is approved, this is the whole procedure:

1. **Put the approved copy in the catalogue.** Add an entry to the family file in
   `packages/shared-types/worksheets/` (e.g. `untangle-thoughts.ts`), with:
   - `tool_id`, `label`, `summary` (the one-line Library description), `section`, `sort_order`;
   - `access_mode` — `open` (anyone), `assigned` (only after a therapist assigns it) or `in_session`
     (therapist-filled, like the safety plan);
   - `load_level` and `est_minutes`;
   - `content_en`: `fields[]` (one piece per screen), optional `closing` with its buttons;
   - `therapy_modality` and `therapist_note` — therapist-only, never serialised to a client;
   - `status: 'approved'` and `ENGLISH_APPROVAL`.
2. **Register it** in the `CATALOGUE` array in `packages/shared-types/worksheets/index.ts`, in Library
   order.
3. **Hinglish, if any**, goes in `content_hi` / `label_hi` / `summary_hi` and **stays unapproved**
   (`status_hi`). The api serves English while it is unapproved; nothing can claim a translation exists.
4. **Regenerate the seed SQL** (from `packages/shared-types`):
   `WRITE_WORKSHEET_SQL=1 npx vitest run __tests__/migration.test.ts`
   The drift test fails the build if the committed migration ever disagrees with the catalogue.
5. **Run the tests**: `packages/shared-types` (pieces validator, unique ids, approved-copy pin, SQL
   drift), `apps/api` (what a client may see), `apps/therapist-portal` (preview over the real rows), and
   `apps/mobile`.
6. Nothing else. Listing, the gate on demanding worksheets, assignment, the runner and the portal preview
   all read the catalogue — there is no second list to update.

A worksheet that does not exist yet is a **placeholder**: a name and a one-line purpose in
`placeholders.ts`, `status: 'placeholder'`, hidden from clients *and* therapists. There are 15 of them
waiting for approved copy.

---

## 8. How approval works

**Nothing reaches a client until the clinical lead approves it.** The mechanism is small and deliberate:

- Every catalogue row has a `status`. Only `approved` rows are listable, assignable and servable;
  `assertClientServable` refuses anything else, so a placeholder answers exactly as a made-up id does.
- Every approved row records **who approved it and when** — `ENGLISH_APPROVAL` is `Dr. Shubhangi Goswami
  (clinical lead)`, 9 November 2026 — and that is written into the seeded row.
- The approved wording lives in `docs/exercise-library/02-approved-worksheet-copy.md`. A test reads that
  document and fails if any on-screen string is not in it. **A copy change is never an engineer's edit**:
  a new approved version of the document replaces the old one and the catalogue is updated to match.
- Hinglish is written but marked unapproved, and stays switched off until the owner signs it.
- Therapist-only material (`therapy_modality`, `therapist_note`) is never sent to a client; there is a
  test that fails if it is.
- The safety plan has its own gate: the client cannot open it, create it or fill it in. Only the client's
  currently linked therapist can create or edit it, and the card is **hidden entirely** — not greyed out —
  until a plan exists.

---

## 9. Fixed in the live app

These are problems that existed before this work and are now fixed. They are listed separately because
each one was live behaviour, not a new feature.

1. **The journal had no safety check.** A journal entry could carry the same words as a crisis chat message
   and produce no card, no flag and no alert, because the classifier only ever ran inside a chat turn.
   Journal entries are now screened by the same check before they are stored.
2. **The Report Card and session preparation could show chat information without the client's approval.**
   Both used the therapist's own on/off switch. They now follow the same rule as everywhere else: the
   client's approval in the app, and the 30-day window — and with no approval the chat query does not run
   at all.
3. **A therapist whose link had ended could still see client information.** The check matched the
   patient-therapist record by its key, which still finds a link after it has ended. There is now one
   live-link check in a shared place, and the tab and session preparation both use it; an ended link
   reads nothing.
4. **"Asking for a friend" in a journal entry relied only on the AI.** Chat had a deterministic keyword
   floor for third-party crisis phrasing; the check every other write used had only the first-person
   floor, so the same words depended entirely on the model noticing them. It now has its own floor and
   raises S3 with no model call at all.

---

## 10. For later

- **The 15 future worksheets.** Named placeholders with a one-line purpose, hidden from everyone, waiting
  for approved copy. Adding one is §7.
- **The Hinglish versions.** All 16 are written and stored but unapproved, in
  `docs/exercise-library/05-hinglish-for-review.md`. They stay invisible until the owner approves them.
- **Timed reminders and push notifications.** Reminder times are already stored, so nothing is lost.
  When push arrives: **no assignment text in a push notification** — no exercise name, no note, no feeling,
  no therapist name. The notification says something is waiting; the app says what. No timed reminder is
  sent today.
- **The therapist daily email.** Not built. Today the only email is "Something new in OKUVU", sent when
  something actually happens, at most once per client per day. Appointment confirmations, reschedules and
  cancellations are exempt from that cap and always send.
- **Therapists building their own worksheets.** Not built. The catalogue is centrally authored and
  clinically approved, which is what keeps §8 true.
- **The becoming spiral.** It does not exist in the app — the only spiral is the brand mark. The data it
  will need is already being saved: every finished worksheet keeps its before and after ratings, its
  "This helped" answer and when it was done.
- **Remembering portal filters.** A therapist who prefers CBT re-picks it each visit.

Also, small and deliberate, so nobody "fixes" them by accident:

- The share confirmation is shown once per install, not once per item.
- No share email is sent to therapists; the email copy exists but nothing sends it.
- "Due today" only covers assignments with a date. Homework typed with no date never appears in Updates.
- The Treasure Box collections are seeded on first open; renaming them for existing clients is a
  migration, not a code change.

---

## 11. Two standing notes

**Summaries written before this work were left untouched.** They may already contain text written during a
crisis. Rewriting clinical records is a decision, not a cleanup, and the owner's decision was to leave them
and note it here. New summaries cannot: crisis-flagged exchanges are dropped before generation.

**No database has been applied on this machine.** Every migration from every step validates, and a full
diff from an empty schema renders the same SQL statement for statement, but there is no Postgres and no
Docker here, so none of it has been run against a real database. The owner's rule for Step 13: before any
APK, all of the database changes from every step must be applied to a real database and checked. If that
cannot be done here, Step 13 stops and says exactly what is needed.

---

## 12. Where the evidence is

- `docs/exercise-library/13-step-09-visibility.md` — Step 9, including the ended-link fix
- `docs/exercise-library/14-step-11-checks.md` — all 24 gates, each with the test that proves it
- `evidence/step-11/worksheet-help-runs.json` — check 6/7/8 against the real model, round 1
- `evidence/step-11/worksheet-help-runs-round2.json` — check 6/7/8 after the 10 Nov wording change
- `evidence/step-11/model-identity.txt` — the live task definition's model settings, read from AWS
