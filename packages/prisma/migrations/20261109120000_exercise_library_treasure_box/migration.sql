-- Exercise/worksheet Library + Treasure Box: storage only (Step 1).
--
-- Additive by design. No existing row is deleted, no existing column changes
-- type or loses data. The one write to existing rows is a status backfill:
-- every catalogue row that exists today is a clinically approved exercise, so
-- it becomes 'approved'; `guided_breathing` becomes 'retired' because clinical
-- review v2.0.0 withdrew it and the owner asked for it to be hidden from the
-- Library without being deleted (old Homework/Reminder rows still point at it).
--
-- Why the registry is extended rather than a second table: the Library is the
-- existing approved exercises PLUS the worksheets, "in one place, with nothing
-- duplicated". A separate Worksheet table would have meant two catalogues, two
-- id spaces and a polymorphic assignment pointer. Adding `kind` to
-- ToolRegistryEntry keeps one catalogue and lets Homework.tool_id address
-- either kind.
--
-- Why no therapist column on WorksheetResponse / TreasureNote: an unshared item
-- must be unreachable by a therapist, not merely filtered out of a list. With no
-- therapist FK there is no per-therapist copy to leak, and clearing
-- shared_with_therapist removes the row from every therapist's view in the same
-- statement (owner rule: revoking share disappears immediately).

-- ---------------------------------------------------------------- catalogue --

ALTER TABLE "ToolRegistryEntry"
    ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'exercise',
    ADD COLUMN "summary" TEXT,
    ADD COLUMN "summary_hi" TEXT,
    ADD COLUMN "label_hi" TEXT,
    ADD COLUMN "section" TEXT,
    ADD COLUMN "therapy_modality" TEXT,
    ADD COLUMN "access_mode" TEXT NOT NULL DEFAULT 'open',
    ADD COLUMN "load_level" TEXT,
    ADD COLUMN "est_minutes" INTEGER,
    ADD COLUMN "content_en" JSONB,
    ADD COLUMN "content_hi" JSONB,
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN "approved_at" TIMESTAMP(3),
    ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Prisma's @updatedAt is applied by the client, not the database; the default
-- existed only to backfill existing rows and is dropped so the migrated
-- database matches schema.prisma exactly (verified with `migrate diff`).
ALTER TABLE "ToolRegistryEntry" ALTER COLUMN "updated_at" DROP DEFAULT;

-- Everything that exists today is an approved exercise. Written explicitly
-- rather than relying on the column default, because the default is 'draft'
-- (a worksheet inserted without a status must never reach a client).
UPDATE "ToolRegistryEntry" SET "status" = 'approved' WHERE "kind" = 'exercise';

-- Clinical review v2.0.0 retired guided breathing as a duplicate of extended
-- exhale. Hidden, not deleted: old Homework and Reminder rows reference this
-- tool_id and must keep resolving; the client's Breathe screen has its own
-- four-technique list and is unaffected.
UPDATE "ToolRegistryEntry" SET "status" = 'retired' WHERE "tool_id" = 'guided_breathing';

-- Guard rails the Prisma schema cannot express. Values are documented in
-- schema.prisma; these make a typo a failed write instead of an invisible
-- worksheet. `section` is checked only when set, so exercises stay null.
ALTER TABLE "ToolRegistryEntry"
    ADD CONSTRAINT "ToolRegistryEntry_kind_check"
        CHECK ("kind" IN ('exercise', 'worksheet')),
    ADD CONSTRAINT "ToolRegistryEntry_status_check"
        CHECK ("status" IN ('draft', 'approved', 'retired')),
    ADD CONSTRAINT "ToolRegistryEntry_access_mode_check"
        CHECK ("access_mode" IN ('open', 'assigned', 'in_session')),
    ADD CONSTRAINT "ToolRegistryEntry_load_level_check"
        CHECK ("load_level" IS NULL OR "load_level" IN ('light', 'demanding')),
    ADD CONSTRAINT "ToolRegistryEntry_section_check"
        CHECK ("section" IS NULL OR "section" IN (
            'notice_and_name', 'calm_my_body', 'untangle_thoughts',
            'do_what_matters', 'people_boundaries', 'be_kinder',
            'energy_life', 'before_after', 'safety'
        ));

CREATE INDEX "ToolRegistryEntry_kind_status_section_sort_order_idx"
    ON "ToolRegistryEntry"("kind", "status", "section", "sort_order");

-- --------------------------------------------------------- worksheet assign --

ALTER TABLE "Homework"
    ADD COLUMN "personal_note" TEXT,
    ADD COLUMN "frequency" TEXT,
    ADD COLUMN "due_at" TIMESTAMP(3),
    ADD COLUMN "reminder_time" TEXT,
    ADD COLUMN "therapy_goal" TEXT;

ALTER TABLE "Homework"
    ADD CONSTRAINT "Homework_reminder_time_check"
        CHECK ("reminder_time" IS NULL OR "reminder_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- ------------------------------------------------------ worksheet responses --

CREATE TABLE "WorksheetResponse" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "worksheet_id" TEXT NOT NULL,
    "homework_id" TEXT,
    "answers" JSONB NOT NULL,
    "feeling_before" INTEGER,
    "feeling_after" INTEGER,
    "barriers" TEXT,
    "helped" BOOLEAN,
    "safety_flagged" BOOLEAN NOT NULL DEFAULT false,
    "safety_level" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "shared_with_therapist" BOOLEAN NOT NULL DEFAULT false,
    "shared_at" TIMESTAMP(3),
    "unshared_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorksheetResponse_pkey" PRIMARY KEY ("id")
);

-- 0-10 feeling slider around a worksheet, per the approved copy ("Slider 0-10",
-- and the demanding gate is "above 5 out of 10"). The daily mood check-in keeps
-- its own 1-5 scale; these two columns are worksheet-level self-report, not a
-- scored instrument, and no scored instrument exists anywhere in this schema.
-- The CHECK keeps a future caller from widening it into one by accident.
ALTER TABLE "WorksheetResponse"
    ADD CONSTRAINT "WorksheetResponse_feeling_before_check"
        CHECK ("feeling_before" IS NULL OR ("feeling_before" BETWEEN 0 AND 10)),
    ADD CONSTRAINT "WorksheetResponse_feeling_after_check"
        CHECK ("feeling_after" IS NULL OR ("feeling_after" BETWEEN 0 AND 10)),
    ADD CONSTRAINT "WorksheetResponse_language_check"
        CHECK ("language" IN ('en', 'hi')),
    ADD CONSTRAINT "WorksheetResponse_safety_level_check"
        CHECK ("safety_level" IS NULL OR "safety_level" IN ('S3', 'S4'));

CREATE INDEX "WorksheetResponse_user_id_completed_at_idx"
    ON "WorksheetResponse"("user_id", "completed_at" DESC);
CREATE INDEX "WorksheetResponse_user_id_shared_with_therapist_idx"
    ON "WorksheetResponse"("user_id", "shared_with_therapist");
CREATE INDEX "WorksheetResponse_worksheet_id_idx"
    ON "WorksheetResponse"("worksheet_id");

ALTER TABLE "WorksheetResponse"
    ADD CONSTRAINT "WorksheetResponse_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "WorksheetResponse_worksheet_id_fkey"
        FOREIGN KEY ("worksheet_id") REFERENCES "ToolRegistryEntry"("tool_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "WorksheetResponse_homework_id_fkey"
        FOREIGN KEY ("homework_id") REFERENCES "Homework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------- treasure box ----

CREATE TABLE "TreasureCollection" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "system_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasureCollection_pkey" PRIMARY KEY ("id")
);

-- The four seeded collections, one set per client. system_key makes a retried
-- seed idempotent; Postgres treats NULLs as distinct, so a client's own
-- collections (null key) are unaffected by this constraint.
ALTER TABLE "TreasureCollection"
    ADD CONSTRAINT "TreasureCollection_system_key_check"
        CHECK ("system_key" IS NULL OR "system_key" IN ('anxious', 'low', 'overwhelmed', 'win'));

CREATE UNIQUE INDEX "TreasureCollection_user_id_system_key_key"
    ON "TreasureCollection"("user_id", "system_key");
CREATE INDEX "TreasureCollection_user_id_sort_order_idx"
    ON "TreasureCollection"("user_id", "sort_order");

ALTER TABLE "TreasureCollection"
    ADD CONSTRAINT "TreasureCollection_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TreasureNote" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'self',
    "source_ref" TEXT,
    "collection_id" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "shared_with_therapist" BOOLEAN NOT NULL DEFAULT false,
    "shared_at" TIMESTAMP(3),
    "unshared_at" TIMESTAMP(3),
    "safety_flagged" BOOLEAN NOT NULL DEFAULT false,
    "safety_level" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasureNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TreasureNote"
    ADD CONSTRAINT "TreasureNote_source_check"
        CHECK ("source" IN ('self', 'therapist', 'worksheet', 'journal', 'chat')),
    ADD CONSTRAINT "TreasureNote_safety_level_check"
        CHECK ("safety_level" IS NULL OR "safety_level" IN ('S3', 'S4'));

CREATE INDEX "TreasureNote_user_id_created_at_idx"
    ON "TreasureNote"("user_id", "created_at" DESC);
CREATE INDEX "TreasureNote_user_id_collection_id_idx"
    ON "TreasureNote"("user_id", "collection_id");
CREATE INDEX "TreasureNote_user_id_shared_with_therapist_idx"
    ON "TreasureNote"("user_id", "shared_with_therapist");
CREATE INDEX "TreasureNote_user_id_pinned_idx"
    ON "TreasureNote"("user_id", "pinned");

ALTER TABLE "TreasureNote"
    ADD CONSTRAINT "TreasureNote_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "TreasureNote_collection_id_fkey"
        FOREIGN KEY ("collection_id") REFERENCES "TreasureCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------- safety flags --

-- Chat flags hang off a Turn (turn_id). A journal entry, worksheet answer or
-- Treasure note has no Turn, so the flag needs to name the row it came from.
-- Still content-free: an id and a kind, never the text.
ALTER TABLE "SafetyFlag"
    ADD COLUMN "subject_kind" TEXT,
    ADD COLUMN "subject_id" TEXT;

ALTER TABLE "SafetyFlag"
    ADD CONSTRAINT "SafetyFlag_subject_kind_check"
        CHECK ("subject_kind" IS NULL OR "subject_kind" IN ('journal_entry', 'worksheet_response', 'treasure_note')),
    ADD CONSTRAINT "SafetyFlag_subject_pair_check"
        CHECK (("subject_kind" IS NULL) = ("subject_id" IS NULL));

CREATE UNIQUE INDEX "SafetyFlag_subject_kind_subject_id_key"
    ON "SafetyFlag"("subject_kind", "subject_id");
