# Step 7 — Updates list and emails

**Status:** built and tested on `feature/exercise-library`, commit `Step 7`. Nothing
merged, no APK. Branch sits at the tip of the library work; every earlier step is on the
same branch.

## What changed, in user terms

### The Updates list

Three kinds of update now exist, all of them rows the app already knows how to show:

| Kind | Where it comes from | What the client sees |
| --- | --- | --- |
| `homework_assigned` | the therapist assigning work | "New homework" + the therapist's own excerpt |
| `homework_due_today` | derived on read | "Due today" + the assignment |
| `treasure_note_waiting` | the therapist sending a Treasure Box note | the approved line, with **Keep** and **Not now** |

- **"Due today" is derived on read, not written by a clock.** Nothing in this deployment
  runs on a schedule, so the only moment we know the client is looking is the read. One
  row per assignment per IST day, enforced by a unique `dedupe_key`
  (`due_today:<homeworkId>:<YYYY-MM-DD>`), so re-opening the app cannot stack duplicates
  and tomorrow gets its own row. An assignment the client already did today does not
  produce one.
- **Unread first.** The list orders unread rows above read ones, newest first inside each
  group, and a row stays unread until it is opened. Sorting purely by time buried an
  unseen update under rows the client had already read.
- **The approved fixed line** ("Your therapist reads shared entries before sessions, not in
  real time. If you need help right now, tap Get help.") sits above the rows, and "Get
  help" opens the same crisis overlay chat and the worksheet safety card open.
- **Keep and Not now.** The therapist's note travels in `Notification.note_body` and is
  never rendered on the row — a phone on a table shows lock-screen previews. **Keep**
  copies the words into the client's own `TreasureNote` with `source = 'therapist'` and
  `source_ref = <notification id>`, so a second tap returns the same note rather than a
  duplicate, and **Not now** only marks the row read, leaving it in the list to keep later.

### The writer that makes it reachable

A new portal card on the client's page — "Send to their Treasure Box" — is the only way
`treasure_note_waiting` rows get created, gated on a **live** `TherapistClient` link
(`ended_at: null`). Per the standing rule, a kind with no writer is an unreachable feature
however green its tests are.

### Email

- **One sender, one promise.** The approved copy is the entire message: subject "Something
  new in OKUVU", body "Hi, there's something waiting for you in the OKUVU app, whenever
  you're ready. Open the app to see it.", footer "Pause these emails". No exercise name, no
  note text, no therapist name, no feeling, no session.
- **Events, not schedules.** An assignment and a Treasure Box note mail. A reminder being
  set does not — it is a schedule the therapist already discussed, and mailing it is the
  noise that gets a sender filtered.
- **One per client per IST day**, claimed with a single conditional `UPDATE` on
  `User.last_update_email_at` *before* the send, so two events in the same second cannot
  both mail. The day boundary is `startOfIstDay` in `packages/shared-types`, the same
  helper the Today card's "done today" uses.
- **The pause link is a real token**, `User.email_update_token`, random (never derived from
  the id) and minted on the first email. Without a token the mail is not sent at all,
  because a footer that cannot keep its promise is worse than a missing message.
- **Appointment emails keep their own existing copy** (the session time is logistics) but
  now sit behind the same preference and the same cap. `reminder_set` no longer emails.
- **Settings → Notifications** gains an "Email updates" switch. The Updates list is not
  gated by it: pausing email never hides an update.

### The pause page

`GET /api/updates/pause?t=<token>` on the portal, public (added to the exact
`PUBLIC_API_PATHS` list, not a prefix). It clears one boolean and says so. It names nobody —
no address, no client id, no therapist name — because a pause URL gets forwarded.

### Collection names

The four approved names are in `SEEDED_COLLECTIONS`, added to the approved document as an
approved addition, and applied to existing rows by
`20261109180000_step7_updates_and_emails`.

### Reminder times

Unchanged and still stored (`Homework.reminder_time`, `Reminder.times`). No timed reminder
is sent; there is no scheduler, and this step did not imply one.

## Verification

| Suite | Before | After |
| --- | --- | --- |
| api | 1831 / 102 files | **1838 / 103 files** |
| shared-types | 88 | **88** |
| therapist portal | 364 | **384 / 36 files** |
| worker | 95 | **95** |
| Flutter app | 417 | **425**, `flutter analyze` clean |

Every runtime typecheck was run: `tsc --noEmit` on api and portal, `prisma validate`,
`flutter analyze`.

The owner's five checks, each a real test:

1. **Each kind appears and stays until opened** — `updates-list.test.ts`: the due-today row
   is written with the right kind, title and dedupe key; a second read produces the same
   key; the query asks only for active work due today and not done today; the list orders
   unread first. The inbox widget tests render the fixed line, the waiting note row with
   both buttons, and the Keep/Not-now calls.
2. **An email goes out only when something happens** — `updates-email.test.ts`: assignment
   sends one; a reminder sends none; the row is written either way.
3. **Never more than one email a day** — the cap returns `count: 0` for the second event:
   the row is still written, the mailbox is untouched.
4. **No email contains anything personal** — the copy test asserts the approved subject and
   body, the pause link, and the absence of "homework", "worksheet", "Treasure", "session"
   and "your therapist"; the sender test asserts the therapist's own words (inside the row)
   never reach the payload.
5. **Pausing works** — the preference skips the send *and* the claim (so pausing does not
   burn the day's message); the pause route test covers a live token, an already-paused
   client, an unknown token and a missing token.

Also re-run because Step 7 touched shared code: the Step 4/5/6 safety tests (crisis words
in a worksheet, journal entry and Treasure Box note; the demanding-worksheet gate; the
hidden safety-plan card) all still pass inside the api suite.

### Schema check

No database on this machine, so the migration was **validated and diffed, not applied**:
`prisma validate` passes and `migrate diff --from-empty --to-schema` renders exactly the
columns, defaults and two unique indexes the hand-written migration contains. That proves
file and model agree; it does not prove the file applies. **Step 13's gate stands**: every
migration from every step on a real Postgres before any APK.

## What this step did not do, on purpose

- No push notification, no scheduler, no timed reminder send.
- No email for a reminder being set, by the owner's own rule.
- No share-email to therapists (still correct per the Step 6 round).
- No unread badge change beyond the already-shipped bell count.
- The becoming spiral is not built; the data it needs keeps being recorded. Carried to the
  Step 12 write-up, with the untouched old summaries.

## Known gaps

1. **One email a day is now a cap across appointment mail too.** An appointment
   confirmation that lands after an assignment email the same day is not sent — the row is
   in the app, the mail is not. That is the owner's rule read literally; if appointment
   mail should be exempt, it is one line in `EMAILABLE_KINDS`.
2. **"Due today" only covers assignments with a due date.** Plain homework the therapist
   typed with no date never becomes due-today, which matches the wording but means a
   therapist who assigns without a date is silent in Updates.
3. **The due-today row is written on read**, so a client who never opens the app has an
   empty list rather than a queue of past days — the right behaviour for a live list, the
   wrong one if a future digest ever reads it.
