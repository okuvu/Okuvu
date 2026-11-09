# Step 1 — storage for the Library and the Treasure Box

Branch `feature/exercise-library`, worktree `/opt/data/okuvu/exercise-lib-wt`,
based on `origin/main` @ `12236bc`. Nothing merged, no APK built.

## What this step adds

### One catalogue, not two

`ToolRegistryEntry` is now the Library: `kind` is `exercise` or `worksheet`.
The six approved exercises keep their ids; worksheets will use `ws_<slug>`.
This is what "build on the existing exercises, don't start a new list" means in
the database — one table, one id space, and `Homework.tool_id` can point at
either kind without a polymorphic join table.

New worksheet columns on that model:

| Column | Purpose |
| --- | --- |
| `kind` | `exercise` / `worksheet` |
| `summary`, `summary_hi`, `label_hi` | one-line description, both languages |
| `section` | one of the nine Library sections (CHECK-constrained) |
| `therapy_modality` | which therapy it comes from — **therapist only**, never serialized to a client response |
| `access_mode` | `open` / `assigned` / `in_session` |
| `load_level` | `light` / `demanding` (drives the high-load gate) |
| `est_minutes` | roughly how long it takes |
| `content_en`, `content_hi` | the approved body, structured JSON, one per language |
| `status` | `draft` / `approved` / `retired`, **default `draft`** |
| `approved_at`, `sort_order`, `updated_at` | editorial ordering and provenance |

The `draft` default is the safety property: a worksheet inserted without an
explicit status cannot reach a client. Client queries will read
`kind='worksheet' AND status='approved'` only.

`guided_breathing` is set to `retired` (hidden, not deleted). Old Homework and
Reminder rows still resolve; the client's Breathe screen has its own
four-technique list and is untouched.

### Assigning a worksheet

A worksheet assignment **is** a `Homework` row — same portal form, same
Notification, same Today card, same completion flow. Five nullable columns were
added rather than a parallel assignment table:

`personal_note`, `frequency`, `due_at`, `reminder_time` (`"HH:mm"` IST, for a
future sender; nothing reads it), `therapy_goal`.

### What the client writes

`WorksheetResponse` — one row per filling-in (a worksheet can be repeated).
`answers` (JSON keyed by the approved content's field ids), optional
`feeling_before`/`feeling_after` (1–5, CHECK-constrained, not a scored
instrument), `barriers`, `helped`, `safety_flagged` + `safety_level`,
`language`, `completed_at`, and `shared_with_therapist` + `shared_at` +
`unshared_at`, all sharing defaults false.

### Treasure Box

- `TreasureCollection` — `name`, `system_key` (`anxious` / `low` /
  `overwhelmed` / `win` for the four starting ones, null for a client's own),
  `sort_order`. Unique on `(user_id, system_key)` so a retried seed cannot
  duplicate.
- `TreasureNote` — optional `title`, `body`, `source` (`self` / `therapist` /
  `worksheet` / `journal` / `chat`), `source_ref`, `collection_id`, `tags[]`,
  `pinned`, `shared_with_therapist` (default false), safety columns, dates.

### Non-chat safety flags

`SafetyFlag` gains `subject_kind` (`journal_entry` / `worksheet_response` /
`treasure_note`) and `subject_id`, unique together. Chat keeps using `turn_id`.
The flag still carries no content — an id and a kind, never text.

## Privacy by construction

Neither `WorksheetResponse` nor `TreasureNote` has a therapist column. A
therapist can only reach a row through `shared_with_therapist = true` **and** a
live `TherapistClient` link. There is no per-therapist copy to leak, and
clearing the boolean removes the row from every therapist's view in the same
statement. Chat access is not consulted and cannot be substituted.

## Existing consumers adjusted

`ToolRegistryEntry` is now polymorphic, so the reminder tool picker
(`reminders.listTools`) filters to `kind='exercise'` and excludes `retired` —
otherwise worksheets and the retired breathing exercise would appear as things
a therapist can attach to a practice reminder. `homework.assign` and
`reminders.create` now refuse a retired tool id. No other consumer reads the
table.

Account erasure (`lib/account.ts`) now erases the three new tables. This was not
optional polish: the repo's erasure-coverage test derives every model that has
an FK to `User` from the schema and fails if `deleteAccount` misses one, and it
failed on the first full run — a client deleting their account would have left
their worksheet answers and Treasure notes behind. The three deletes sit before
`homework` (a response holds a nullable FK to it) and before
`treasureCollection`.

## How it was checked

1. `prisma validate` — schema valid.
2. Fresh database `okuvu_lib_step1`; `prisma migrate deploy` applied all 12
   migrations including this one, clean.
3. `prisma migrate diff --from-config-datasource --to-schema schema.prisma` —
   no drift on any table this step touches. (The diff does report pre-existing
   drift on the test-harness models `Campaign` / `ConversationRun` /
   `UserMemory` / one `SessionLog` index; the same drift reproduces from
   `main`'s own schema and migrations, so it is not introduced here.)
4. A transactional SQL suite (rolled back, so no data is left behind) asserting:
   - `guided_breathing` retired, five exercises still approved;
   - a worksheet inserted without status is `draft` and invisible;
   - new responses and notes are unshared, unpinned, untagged, unflagged;
   - a therapist linked to the client sees an unshared response zero times; a
     therapist not linked to the client sees nothing even when shared;
   - sharing makes it visible once, un-sharing hides it immediately, and the
     client's answers survive;
   - duplicate seeded collection keys rejected, client-made collections allowed;
   - a therapist-sourced Treasure note is still unshared by default;
   - a worksheet assignment resolves to `kind='worksheet'` through the existing
     `Homework.tool_id` pointer;
   - invalid `access_mode`, `section`, note `source`, `reminder_time` and an
     out-of-range feeling value are all rejected by CHECK constraints;
   - a duplicate safety flag for the same non-chat item is rejected;
   - a journal entry still round-trips verbatim.
5. `tsc --noEmit` clean in `apps/api` and `apps/therapist-portal`;
   `vitest run` green: portal 344/344 (30 files), api 1707/1707 (87 files).
6. An ORM smoke test against the migrated database (16 assertions, deleted
   afterwards): creating a worksheet with both language bodies, the draft
   default, JSONB round-trip, the share → visible → un-share → hidden cycle with
   `chat_access_granted` still false, the assignment resolving to a worksheet,
   note defaults, duplicate-collection rejection, and cascade deletion.

## Deliberately not done in this step

- No worksheet rows seeded. Copy requires the complete approved document; only
  fragments have reached this host (`02-approved-worksheet-copy.md`).
- No default collection rows created yet. They are per-client rows, and the
  creation point should be one code path (first read of the Treasure Box) rather
  than a migration that writes four rows for every account. Noted as an open
  question in the step report.
- No API routes, no portal screens, no app screens, no sharing endpoints, no
  safety-check wiring — those are the later steps.
