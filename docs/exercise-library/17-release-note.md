# Release note — worksheet Library, Treasure Box and the safety pass

**9 November 2026 · 16 commits on `main` (local) · 8 new database migrations**
**Nothing is live. Nothing has been deployed. No APK was built.**

---

## What changed

**For clients**
* A **Library** of the sixteen approved worksheets in nine sections, with the
  approved line at the top. Eight are open to anyone, seven appear once a
  therapist assigns them, and the safety plan only once a therapist has made one.
* A **Toolkit tab** — Breathe, Journal, Mood check-in, Library, Treasure Box — so
  home stays just Chat and the Today card.
* The **Today card** shows one thing (the next homework or assigned exercise,
  with minutes), then the reminder line and the quote, smaller.
* **Doing a worksheet**: one step per screen, optional 0–10 before and after
  ratings, "this helped", and "Save to my Treasure Box" where the approved
  wording has it.
* A **Treasure Box**: notes typed or spoken, tags, four "Open when…" collections
  plus their own, pinning, search, "Pick one for me", and saving from a finished
  worksheet, a journal entry, a chat message or a Library card — each note
  showing where it came from.
* **Sharing, one item at a time**, starting Private, with the approved
  confirmation the first time; **My toolkit** and **Past me**; a readable
  download of their own entries in Settings, and deletion.
* **Updates list** with unread first, and one email a day at most ("Something new
  in OKUVU", no personal detail, with a working pause link).
* **Demanding worksheets** (thought record, thinking trap, worry tree, kind
  letter) ask how strong the feeling is first; above 5 they show the approved
  calming-first message and grounding instead.

**For therapists**
* A **Library** to browse every approved exercise with five filters, the
  "For therapists" note, and a preview of exactly what the client sees.
* **Assignment** details: a personal line in the client's own words, how often,
  a due date, a linked goal, and a private note the client never sees. Typed
  homework is unchanged.
* **Named sets** of exercises, visible only to the therapist who made them,
  assignable in one go.
* A **safety plan editor** (seven parts, helplines from the app's central list),
  **Send to their Treasure Box**, a **Shared with me** tab with patterns, and a
  **since last session** section in session preparation.

**Under all of it**
* One safety check, the same function, on **every** client write: chat, journal,
  worksheet answers, Treasure Box notes. Crisis words save the words, show the
  help card, record a flag with no text, and email the therapist with no content.
* If the check is **down**: the crisis-word backstop still runs and a hit is a
  full crisis; otherwise the client sees "Help is here if you need it", nothing
  is emailed, and the entry is re-screened when the service returns.

---

## Check results

| What | Result |
|---|---|
| Database — every migration applied to a **fresh** Postgres 17.11 | **59/59 applied**, 0 failed, 51 tables, no manual SQL |
| Database-level safety/privacy assertions | **14/14 passed** |
| api | **1850 passed** (103 files) |
| shared-types | **89 passed** |
| therapist portal | **415 passed** |
| worker | **95 passed** |
| mobile app | **430 passed**, analyzer clean |
| typechecks (api, portal) | clean |
| approved-copy gate (byte-exact crisis wording) | **18/18** |
| live model, 110 calls, 0 errors | check 6: 0 balanced thoughts (17 blocked, 1 restates the step — accepted); check 7: 0 advice; check 8: 0 injections followed |
| model identity | `qwen.qwen3-32b-v1:0`, ap-south-1, `evia-beta-api:78` — the same model the live app runs |
| crisis screen and helplines | unchanged: zero removed lines since the last release; the five helplines identical; the only addition is the plan button (hidden until a plan exists) |

---

## To make it live — in this order

1. **Back up the live database first.** Take an RDS snapshot and confirm it
   finished; additionally `pg_dump` the schema and data to a file you can reach
   without the cluster, and check the dump restores into a scratch database.
   Nothing else starts until that exists.
2. **Pick a quiet window** and tell the therapists. The rollout restarts all
   three services; expect a minute or two of 5xx on the api.
3. **Push `main`** (`git push origin main`, 16 commits, currently at `b7713f1`).
   That push is the deploy: CodeBuild `evia-beta-build` builds the three images,
   runs `prisma migrate deploy` against the live RDS, then rolls api, portal and
   worker. There is no separate migration step to remember, and no way to push
   without deploying.
4. **Watch the build's migration step.** Eight migrations apply in order, all
   additive: Library storage, the worksheet seed, mood check-in columns, safety
   plan, safety recheck queue, privacy/sharing columns, updates and emails,
   assignment details and sets. No table or column is dropped and every new
   column on an existing table has a default, so no row is rewritten and a code
   rollback stays possible. The seed upserts the sixteen catalogue cards by
   `tool_id`, so the three cards that already exist (mood check-in, grounding,
   breathing) have their catalogue rows updated in place — their client data is
   untouched. Any failure aborts before the services roll.
5. **Smoke test, in this order:** `/health`; the crisis screen text and the five
   helplines; open the Library and one worksheet; share a journal entry and check
   it appears in the portal's "Shared with me"; assign an exercise and see it on
   the client's Today card; press Get help from a worksheet.
6. **If anything fails:** stop the rollout, restore the snapshot, and roll the
   services back to `evia-beta-api:78`, `evia-beta-portal:78`,
   `evia-beta-worker:76`. The migrations are additive, so a code rollback alone
   is safe — the old code ignores the new columns and tables.

---

## Left unfinished

* **The "becoming" spiral** is not built. Its data is being saved from the first
  release (before/after ratings, "this helped", completion times).
* **The 15 future worksheets** exist as name-plus-purpose placeholders; clients
  and therapists never see them.
* **The Hinglish versions** of all sixteen cards are written and stored, switched
  off, awaiting clinical approval.
* **Timed reminders and push notifications** are not sent. Reminder times are
  stored so they can be. Rule for later: no assignment text in a push.
* **The therapist daily email**, **therapists authoring their own worksheets**,
  and **remembering portal filters** are not built.
* **Old summaries** written before this work were left untouched and may contain
  crisis text. They were not rewritten — that is a decision, and it belongs in
  the clinical record rather than a data migration.
* **The schema carries pre-existing drift**: a `Campaign` table and three
  `ConversationRun` columns that no migration creates and no code uses (eval
  harness leftovers). Harmless for this release; a rebuild from migrations alone
  would lack them.
* **No APK** has been built, and there has been no pass on a physical handset.
* Small known limits: session preparation lists at most 20 shared items (the
  count beside it is the true total); the share confirmation is shown once per
  install, not once per item; no email is sent to the therapist when a client
  shares something.
