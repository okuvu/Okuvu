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

