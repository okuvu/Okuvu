# Step 6A — the Treasure Box, and two corrections to Step 6

Branch `feature/exercise-library`. Nothing merged, no APK. Everything below is
what the code does, and each claim names the test that holds it.

## 1. The two Step 6 corrections

### 1.1 "Download my data" is a readable document

`GET /me/export` is unchanged: it is still the machine-readable JSON copy, which
is what a data-protection request is answered with.

The app's **Download my entries and notes** button now calls
`GET /me/export/document`, which answers `text/plain; charset=utf-8` with an
attachment filename. The document is:

- one block per item, **oldest first**;
- a heading line with the date and time in IST (the day boundary the app
  already uses), then *which exercise it was* — `Journal entry`,
  `Worksheet: <name>` or `Treasure Box: <title>`;
- `Shared with my therapist: Yes/No`, which is the share state at the moment of
  download;
- the client's answers under the question they were answering, taken from the
  catalogue's own field prompts. A row list renders as `• Draining: Classes ·
  How much? 8`; a feelings picker renders the feeling's label with its 0–10
  strength;
- for a worksheet, `Before: 7/10 · After: 4/10` when the client gave them;
- for a treasure note, `Where it came from: …` and its tags.

There is no JSON, no field id and no bare `{` anywhere in the document. An
answer whose question no longer exists in the current content is still printed,
under its field id, rather than dropped — it is the client's writing.

Tests: `apps/api/src/__tests__/export-document.test.ts` (three tests: headings,
order and content; the empty case; every query scoped to the client's own
`user_id`) and `apps/mobile/test/features/settings/my_data_document_test.dart`
(the app asks for that endpoint, as plain text, and a failure returns null rather
than an empty file).

### 1.2 Worksheet answers can be deleted from Past me

This already existed in the Step 6 code (`Delete /me/items/worksheet_response/:id`
plus the trash control on every Past me row), so nothing was rebuilt. It is now
**proven**: `apps/mobile/test/features/my_space/past_me_delete_test.dart` taps
delete on a worksheet answer, checks the same confirmation the journal and the
box use, checks nothing is removed on Cancel, and checks the DELETE is
`/me/items/worksheet_response/w1`. `export-document.test.ts` covers the server
half: the WHERE carries the authenticated `user_id`, so someone else's id is a
404 and deletes nothing.

## 2. The Treasure Box

### 2.1 What it is

The client's own place for things worth keeping. Warm, not clinical: lavender
wash and honey accents, no counts, no scores, no "days in a row".

The screen (`apps/mobile/lib/src/features/library/treasure_box_screen.dart`)
holds, in order: the approved privacy line, an optional search field, the
"Open when…" collection chips plus **New**, tag filter chips, **Pick one for
me**, and the notes. Empty, it shows the approved line verbatim:

> This is your space for things worth keeping: something you learnt, words that
> help, reminders for hard days. Add your first one whenever you're ready.

### 2.2 Adding, editing, deleting

- **Type or speak.** The editor sheet has a note field, a microphone
  ("Say it instead"), an optional title and a tags field. Speech uses the
  existing `SpeechService` and gives a specific line for each failure
  (permission denied, blocked in Settings, no recogniser, generic) rather than
  one message for all four.
- **Tags** are normalised server-side: trimmed, `#` stripped, de-duplicated
  case-insensitively, eight at most, 24 characters each.
- **Collections.** Notes can be filed into any collection the client owns; the
  api refuses a collection id that is not theirs.
- **Edit and delete** are in each note's menu. Delete asks first, with the same
  wording as the journal.
- Notes are shown newest first with pinned ones first.

### 2.3 The four starting collections

Created the first time the client opens the box, by `createMany({ skipDuplicates:
true })`, idempotent through the existing unique index on `(user_id,
system_key)`. No migration writes rows for accounts that never open the box.

**Their names were not in the approved copy at the time.** The document approved
the idea and the four system keys (`anxious`, `low`, `overwhelmed`, `win`) but
never named them, so this step used the plainest reading of each key:

| system_key | name shown at Step 6A |
| --- | --- |
| `anxious` | Open when I feel anxious |
| `low` | Open when I feel low |
| `overwhelmed` | Open when it's too much |
| `win` | Open when something went right |

**Resolved in Step 7:** the owner supplied the approved wording on 9 November
2026 — "Open when I’m anxious", "Open when I feel low", "Open when I’m
overwhelmed", "Open when I need a win". It is in
`02-approved-worksheet-copy.md` as an approved addition, in the seed array in
`apps/api/src/routes/treasure.ts`, and applied to existing rows by migration
`20261109180000_step7_updates_and_emails`.

### 2.4 Saving from elsewhere, and the source line

Every note carries where it came from, resolved server-side in
`apps/api/src/lib/treasure-source.ts` so the app never composes a provenance
line:

| saved from | `source` | label |
| --- | --- | --- |
| typed in the box | `self` | Me |
| a journal entry | `journal` | From my journal |
| one chat message | `chat` | From OKUVU chat |
| a finished worksheet | `worksheet` | From a worksheet |
| an exercise in the Library | `worksheet` | From a worksheet |

A client cannot claim `therapist`: the create route whitelists
`self | worksheet | journal | chat` and coerces anything else to `self`, so no
note can say it came from the therapist until a therapist-send path writes it
server-side.

Each door, in the app:

- **Journal** — the gift icon on any entry copies its text.
- **Chat** — long-press either side of a conversation offers "Keep this
  message?".
- **Library** — the gift icon on any available card keeps the exercise's name
  and its approved one-line description.
- **Worksheet** — the approved "Save to my Treasure Box" closing button.

A kept note is a **copy**, not a link: deleting the journal entry, the chat, or
the worksheet answer afterwards leaves the note alone, which is the point of a
keepsake box. `source_ref` records where it came from and is allowed to dangle.

### 2.5 Going back

- **Pin** any note; pinned notes sort first and are the only ones "Pick one for
  me" can choose from.
- **Search** matches title, body and tags (server-side, 350 ms debounce).
- **Filter** by collection (`Everything` / each collection / a tag chip).
- **Pick one for me** asks `GET /treasure/pick`, which only ever queries
  `pinned: true` and picks one at random. With nothing pinned it says "Pin a note
  you want to come back to first." rather than shuffling everything.

### 2.6 After grounding

The approved grounding closing already had an "Open my Treasure Box" button; it
used to say "coming next". It now opens `/treasure`. The Treasure Box is **not**
on the crisis screen, per the owner's instruction.

### 2.7 Privacy and safety

- Default private: the schema default is false, the create route never sets
  `shared_with_therapist`, and the switch is the only write path.
- The approved privacy line is on the screen; every note shows its Private /
  Shared label and its own switch, with the approved first-share confirmation.
- Every save — typed, spoken, or copied in from journal / chat / library /
  worksheet — goes through `checkClientText` in the api, the same function chat
  uses. A crisis hit saves the note, raises the help card, records a flag with
  the note id and no text, and sends the content-free therapist alert. A failed
  check is the Step 5 rule: moderate concern, gentle offer, queued recheck.
- An **edit** re-screens the text; a pin or a move between collections does not
  (it cannot change the words, and a second flag row for a pin would be noise).

## 3. How this was checked

Whole suites, not just the touched files:

| suite | result |
| --- | --- |
| api | 1831 tests, 102 files |
| shared types | 88 tests |
| therapist portal | 364 tests; typecheck clean |
| worker | 95 tests |
| Flutter app | 417 tests; `flutter analyze` clean |

The four checks the owner named:

1. **Each way of saving works and shows the right source.**
   `treasure-box.test.ts` asserts the label for every stored source and that an
   unknown source reads "Me"; `treasure_saves_test.dart` drives the journal and
   Library doors and asserts the exact POST (`source: 'journal'` /
   `'worksheet'`, with `sourceRef`), and the chat door through `TreasureSaver`.
   The worksheet door posts `source: 'worksheet'` from `library_api.dart`.
2. **Notes start private.** `treasure-box.test.ts` ("a new note is private: the
   row is created without a share") and `treasure_box_test.dart` (the switch is
   off and the label reads Private).
3. **"Pick one for me" only picks pinned notes.** `treasure-box.test.ts` asserts
   the query is `{ user_id, pinned: true }`; the widget test covers both the
   note and the nothing-pinned line.
4. **Crisis words in a note bring up the help card.** `treasure-safety.test.ts`
   (from Step 4) proves the api path end to end — saved, `showHelp`, flag
   without text, content-free email; `treasure_box_test.dart` proves the screen
   raises the card when the api says `showHelp`.

## 4. Gaps and decisions carried forward

1. **The four collection names are unapproved copy.** See 2.3. The owner's
   wording is needed.
2. **No migration in this step.** `tags`, `pinned`, `source`, `source_ref` and
   the collection unique index all existed from Step 1; this step only started
   using them. So the Step 13 database gate is unchanged.
3. **The Step 13 gate still stands.** No database has been applied on this
   machine. Every migration from Steps 1–6A must be applied to a real Postgres
   and checked before any APK; if that cannot be done here, Step 13 stops and
   names what is needed.
4. **The becoming spiral is still not built.** Listed for the Step 12 write-up;
   the data it needs (per-completion ratings, "This helped", timestamps) keeps
   being saved.
5. **Old summaries are still untouched.** To be carried into the Step 12
   write-up as an open decision, not an omission.
6. **The Treasure Box is discoverable but the "keep" doors are icon-only.**
   Journal, Library and chat use long-press or a gift icon; there is no one-time
   hint explaining them.
7. **No therapist-to-box send.** The `therapist` source and the approved Updates
   copy ("Your therapist sent you something for your Treasure Box.") exist, but
   no path writes them yet.
8. **Pinned-first ordering is per read, not a setting.** There is no "hide
   pinned" toggle and no reordering by hand.
