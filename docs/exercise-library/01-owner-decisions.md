# Owner decisions — recording of the 9 Nov 2026 instructions

Recorded before Step 1. These govern every later step of the exercise/worksheet
Library and Treasure Box work. Nothing here is a design proposal; it is what the
owner said, kept verbatim where it is wording.

Status: no product code written yet. Only this file and `00-repo-map.md` exist on
`feature/exercise-library`.

## 1. Where the work lives

- One place, separate from everything else: branch `feature/exercise-library`,
  worktree `/opt/data/okuvu/exercise-lib-wt`.
- Rebased onto `origin/main` @ `12236bc` on 9 Nov 2026. The earlier base
  (`fffa30f`, client-notification inbox) is now an ancestor of `origin/main`, so
  **the Library does not need a separate branch of the inbox work** — the inbox,
  the `Notification` model and the Updates screen are all on main already.
- Nothing is merged to the app and no APK is built until the owner sends Step 13.

## 2. What "the Library" means

- The existing approved exercises **plus** the owner's 16 worksheets, in one
  place, with nothing duplicated.
- `grounding_5431` (5-4-3-2-1) already exists and is kept with its approved
  wording. From the approved document, add **only**: the optional short writing
  box per sense, and the "How are you feeling now?" slider at the end.
- Breathing: use the **four techniques in the current player**. `guided_breathing`
  was retired in the clinical review: hide it so it never appears in the Library,
  but do **not** delete it.

## 3. Journal safety (and, by extension, worksheets and Treasure Box writes)

- Every client-typed field goes through the same safety check chat uses. No
  alternate path, no bypass.
- On S3/S4, behave exactly like chat: show the help card immediately, record the
  flag with **no text**, send the therapist the **same alert email with no
  content**.
- The therapist never sees what was written.

## 4. Privacy wording (verbatim, owner-supplied)

Used on the journal line, the matching privacy-page line, and for worksheets and
the Treasure Box:

> Your therapist can't read this unless you choose to share it. If OKUVU's safety
> system notices you may be in danger, it will show you help straight away and let
> your therapist know you may need support, without sharing what you wrote.

This replaces the existing journal line that promises OKUVU does not read entries,
which becomes false once the safety pass lands.

## 5. Chat access rules — fix now, inside this work

- Report Card and Session Prep must follow the same rule as everywhere else: chat
  derived content is visible to the therapist **only** after the client approves
  in the app, and **only** inside the 30-day window measured from that approval.
- A therapist switching the flag on themselves is not consent.
- This fix is part of this branch, and is verified again in Step 11's checks.

## 6. Sharing one item

- New per-item share setting, with its own grant, its own revoke, and a state the
  client can see.
- Never reuse the chat-access switch for it.
- A shared item is visible to the therapist **even without chat access**.

## 7. Reminders and emails

- Do not build a sending/scheduling system now.
- Anything due shows in the app: on the Today card and in Updates.
- Emails only on an event (e.g. homework assigned), never on a schedule.
- Existing homework and reminder emails must not carry assignment text or
  anything personal; if they do, replace with approved wording.
- Verified 9 Nov: they do not. See §9.

## 8. Copy and clinical constraints

- All worksheet wording comes from the owner's approved document, word for word.
  Never compose clinical copy; never copy from a published workbook.
- The approved document is in the repo at
  `docs/exercise-library/02-approved-worksheet-copy.md`, marked **COMPLETE**
  (v1, 9 Nov 2026, all 16 worksheets and the shared app copy). That file is the
  only source of worksheet and app copy. Hinglish is translated from it and
  needs separate approval before it can be marked approved.
- **Feeling ratings.** Every worksheet before/after feeling rating and every
  slider inside a worksheet is **0–10** ("0 = barely there", "10 = the
  strongest I've felt"), and the demanding-worksheet gate is "above 5 out of
  10". Only the existing daily mood check-in keeps 1–5. Corrected in the schema
  on 9 Nov 2026 (it had been built at 1–5).
- No PHQ-9, GAD-7, any scored instrument, and no diagnosis or disorder wording
  anywhere a client can see. This is currently clean; it stays clean.

## 9. Checks run at recording time (read-only, origin/main)

- `apps/therapist-portal/src/server/notifications.ts` — email is a sender hanging
  off the notification row, sent after commit, failure swallowed.
- `buildClientNotificationEmailCopy` (`apps/therapist-portal/src/lib/email.ts`)
  switches on appointment kinds only; `homework_assigned` and `reminder_set` fall
  to a generic body. **No assignment text, no description, no name.**
  Appointment emails carry only the session time.
- Contrast: the in-app `Notification.body` does carry `excerpt(description)` for
  homework. That is the client's own screen, so it is acceptable today, but if
  push is ever added that excerpt would reach a lock screen — flag then, not now.

## 10. Still owed by the owner

1. ~~The approved worksheet document as a complete file.~~ **Received 9 Nov
   2026** as full text; saved complete at `02-approved-worksheet-copy.md`.
   Hinglish still needs its own approval pass once written.
2. Disk: ~3 GB to be freed before Step 13 by the owner. Current free space is
   reported in every step; 964 MB on 9 Nov before this step.
3. ~~The numbered steps themselves, starting at Step 1.~~ Step 1 received and
   done — see `03-step-01-storage.md`.

## 11. Addendum — 9 Nov 2026, after the decisions were recorded

- **Push notifications (for later).** When push is added, the homework
  notification must not show any of the therapist's assignment text, because it
  can appear on the lock screen. Today the in-app `Notification.body` carries a
  short excerpt of the therapist's description; that is acceptable on the
  client's own screen, but the push payload must be a fixed generic line.
  Recorded here so it is not lost; push does not exist yet and this branch adds
  none.
- **Approved document.** Received again as a file; saved as far as it arrived.
  The four fragments are transcribed verbatim in
  `02-approved-worksheet-copy.md`, which is marked incomplete on purpose.

## 12. Addendum — 9 Nov 2026, second round

- **Approved document complete.** The owner pasted the full approved text; it
  replaces the fragment file. All worksheet and app copy now comes from
  `02-approved-worksheet-copy.md` (COMPLETE).
- **Feeling ratings are 0–10.** Worksheet before/after ratings and in-worksheet
  sliders are 0–10; only the daily mood check-in is 1–5. The Step 1 schema had
  this at 1–5 and was corrected. The "above 5 out of 10" demanding gate reads
  the 0–10 rating, so the two scales must never be mixed in code.
- **Treasure Box collections.** Creating the four "Open when…" collections the
  first time a client opens the Treasure Box is approved (better than a
  migration that writes four rows for every account). One code path, seeded on
  first read, idempotent via `system_key`.
- **Account deletion.** The erasure catch in Step 1 was welcomed; keep the
  schema-derived erasure test in the loop for every new client-data table.


## Confirmations added 9 November 2026 (Step 2 round)

- **Feeling ratings on worksheets are 0-10.** Before/after ratings, per-feeling
  strength and "how much do you believe it" percentages are all 0-10 (or 0-100
  for the percentage piece). The daily mood check-in stays 1-5 and is a
  different field in a different table. Code that reads a rating for the
  "demanding worksheet" gate (`> 5 out of 10`) must read the 0-10 field, never
  the mood check-in's 1-5 value.
- **The approved document arrived in full as text** and is stored complete at
  `docs/exercise-library/02-approved-worksheet-copy.md`. The Library one-line
  descriptions are stored as an approved addition in the same file.
- **Breathing is one Library card** opening the four exercises; mood check-in
  and grounding are one card each opening their existing screens.
- **No second version of anything.** The worksheets live in the existing tools
  registry (`ToolRegistryEntry`, `kind='worksheet'`), assignment is the existing
  homework row, and the pieces are one shared definition
  (`packages/shared-types/worksheet.ts`) used by the api, the portal and the app.

## Confirmations added 9 November 2026 (Step 5 round)

- **A failed or slow safety check is MODERATE CONCERN** — never safe, never
  crisis. The crisis-word backstop still runs first and a hit is a full crisis.
  Silence shows "Help is here if you need it.", records that the check could not
  run, and alerts nobody; the write is screened again when the service is back,
  and only that recheck can alert. This replaces the Step 4 fallthrough that
  treated an outage as possible risk. See `07-step-04-safety.md`.
- **The safety plan card is hidden, not greyed out**, until the therapist has
  made a plan with the client.
- **Home is Chat and the Today card; everything else is behind one Toolkit tab**
  (Breathe, Journal, Mood check-in, Library, Treasure Box). Existing screens,
  not rebuilt ones.
- **The Today card shows at most one thing**: the next due assigned exercise
  with its length in minutes, or one light exercise when nothing is assigned.
- **No pressure mechanics**: no streaks, no missed-day warnings, no red badges.
- **The Treasure Box entry leads to a placeholder** until Step 6A.
- **English only**; Hinglish stays switched off until approved.
- **Old summaries stay untouched.** They may contain crisis text the Step 4 rule
  would now exclude. Recorded here so Step 12's write-up carries it as an open
  decision rather than a silent omission.
- **The "becoming" spiral does not exist in the app.** Asked back to the owner as
  a one-line question (which screen is it on?); no growth visual was invented.

## Confirmations added 9 November 2026 (Step 6 round)

- **The Today card keeps one main item, then the reminder line and the quote,
  smaller.** Homework the therapist typed in their own words is back on the
  card; Step 5 had dropped it by only looking at tool-linked rows.
- **A repeating assignment does not close when finished.** Today is marked
  done and it returns on its next due day; only a one-off closes.
- **The "becoming" spiral is not built now.** It is listed for the Step 12
  write-up, and the data it needs keeps being saved.
- **Step 13 gate.** Before making the APK, every database change from every step
  must be applied to a real database and checked. If that cannot be done on
  this machine, Step 13 stops and says what is needed.
- **Every entry and note starts Private**, shows exactly one label, and has its
  own share switch. Stopping a share takes effect on the therapist's next read.
- **First share shows the approved confirmation**; after an assigned worksheet
  the share question has two equal buttons, neither chosen in advance.
- **My toolkit and Past me** are read-only views of the client's own data.
- **Settings offers download and per-item delete**; a deleted item leaves the
  portal because the portal reads the same row.
- **Old summaries stay untouched** and must be carried into the Step 12
  write-up.

## Confirmations added 9 November 2026 (Step 6A round)

- **"Download my data" is a readable document**, not JSON: date order, one
  heading per item (the date, which exercise it was, the client's answers and
  whether it was shared). The JSON export stays at `GET /me/export` for a
  machine copy; the app uses `GET /me/export/document`.
- **Worksheet answers can be deleted from Past me** with the same confirmation
  as journal entries and Treasure Box notes.
- **The Treasure Box is built**: typing or speaking, tags, "Open when…"
  collections, saving from a worksheet, a journal entry, one chat message and a
  Library exercise, pinning, search, filters, and "Pick one for me" (pinned
  notes only).
- **The four starting collections are created on the client's first open**.
  Their names are not in the approved copy document; the names used this step
  are listed in `10-step-06a-treasure-box.md` §2.3 and **await the owner's
  approval or replacement**.
- **An exercise saved from the Library is labelled "From a worksheet"**, because
  the owner's five labels have no separate Library label and the Library is made
  of worksheets.
- **The Treasure Box is not on the crisis screen.** After grounding, the
  approved closing button opens it.
- **Saving is a copy, not a link.** Deleting the journal entry, chat or
  worksheet answer afterwards leaves the kept note in place.

## Confirmations added 9 November 2026 (Step 7 round)

- **The four "Open when…" collection names are approved**: "Open when I’m
  anxious", "Open when I feel low", "Open when I’m overwhelmed", "Open when I
  need a win". Added to `02-approved-worksheet-copy.md` as an approved addition
  and applied to rows already created by migration
  `20261109180000_step7_updates_and_emails`.
- **"From a worksheet" stays the label** for an exercise saved from the Library.
  No sixth source label.
- **A failed safety check is moderate concern** (Step 5 correction, restated
  here because Step 7 touched the same save paths): the keyword floor still runs
  first and a hit is a full crisis; silence shows a gentle offer, queues a
  recheck, and never raises a flag or an alert on its own.
- **Email is for events, not schedules**: an assignment or a Treasure Box note
  mails; a reminder being set does not. One email per client per IST day,
  approved subject and body, a working pause link, and the Updates list always
  works whatever the email setting says.
- **Old summaries stay untouched.** Summaries written before the Step 4 safety
  pass may contain crisis text. Rewriting clinical records is not a code change;
  it is carried into the Step 12 write-up as a decision, not an oversight.
- **The "becoming" spiral is not built.** It does not exist in the app; the data
  it will read (each finished worksheet with its before/after ratings and its
  "This helped") keeps being stored. Carried into the Step 12 list.
- **Step 13 gate**: before any APK, every migration from every step must be
  applied to a real Postgres and checked. No database runs on this machine, so
  the migrations are schema-validated and diffed, not applied.

## Decisions added 10 November 2026 (after the Step 11 report)

- **A blocked worksheet-help reply is never announced as unavailable.** When the
  reviewer blocks the model's reply — or the model or the review fails — the api
  serves that step's own approved helper line from the approved document. A step
  with no approved helper line serves nothing at all. The wording "Help isn't
  available right now" is retired: the owner's reason is that it lands on someone
  who may already be struggling as one more broken thing. (Check 1's S3/S4 stop
  is unchanged: the model is not called and nothing is served, because the crisis
  card is the thing to read.)
- **Asking the helper for the answer gets the answer refused, gently.** When the
  client asks for the balanced thought, "another way to see it", or "just tell me
  what to do", the reply says the answer is theirs to find and asks one open
  question — and does not restate the step in words that describe the alternative
  view. Repeating the worksheet's own helper text is allowed; check 7 is accepted
  on that basis.
- **The model of record was verified, not assumed.** The live `evia-beta-api`
  task definition runs `LLM_PROVIDER=bedrock`, `AWS_REGION=ap-south-1`,
  `BEDROCK_MODEL_ID=qwen.qwen3-32b-v1:0`, which is the same id the checks ran
  against. Recorded in `evidence/step-11/model-identity.txt`.
