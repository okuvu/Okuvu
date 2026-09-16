-- Decisions doc round, 15 Sep 2026: 5 clinically-approved exercises,
-- Homework.tool_id (mirrors the existing Reminder.tool_id pattern), and a
-- client-only pace-preset table.

-- AlterTable: Homework gains an optional link to a specific approved exercise.
ALTER TABLE "Homework" ADD COLUMN "tool_id" TEXT;
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "ToolRegistryEntry"("tool_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: ToolRegistryEntry gains the canonical one-line copy read
-- verbatim by the mobile player (content parity, decisions doc §7).
ALTER TABLE "ToolRegistryEntry" ADD COLUMN "text" TEXT NOT NULL DEFAULT '';

UPDATE "ToolRegistryEntry" SET "text" = '5-4-3-2-1 grounding — notice five things you can see, four you can touch, three you can hear, two you can smell, one you can taste.' WHERE "tool_id" = 'grounding_5431';
UPDATE "ToolRegistryEntry" SET "text" = 'Guided breathing — follow the circle: breathe in as it grows, out as it shrinks.' WHERE "tool_id" = 'guided_breathing';
UPDATE "ToolRegistryEntry" SET "text" = 'Box breathing — breathe in, hold, breathe out, hold, each for the same count.' WHERE "tool_id" = 'box_breathing';

ALTER TABLE "ToolRegistryEntry" ALTER COLUMN "text" DROP DEFAULT;

-- Seed the 2 exercises added by this decisions round.
INSERT INTO "ToolRegistryEntry" ("id", "tool_id", "label", "text", "chat_guidable") VALUES
    ('a1e6f8b2-0a4c-4b3e-9f1d-2c3d4e5f6004', 'physiological_sigh', 'Physiological Sigh', 'Physiological sigh — two quick breaths in through your nose, then one long breath out.', true),
    ('a1e6f8b2-0a4c-4b3e-9f1d-2c3d4e5f6005', 'extended_exhale', 'Extended Exhale', 'Extended exhale — breathe in normally, then let your breath out slower than it came in.', true);

-- CreateTable: a client's chosen pace preset for one approved exercise.
-- Covers both their own default (box breathing, no Homework row needed)
-- and any therapist-assigned exercise (same tool_id as the Homework row).
CREATE TABLE "UserToolPreference" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "pace_preset" TEXT NOT NULL DEFAULT 'standard',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserToolPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserToolPreference_user_id_tool_id_key" ON "UserToolPreference"("user_id", "tool_id");

ALTER TABLE "UserToolPreference" ADD CONSTRAINT "UserToolPreference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserToolPreference" ADD CONSTRAINT "UserToolPreference_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "ToolRegistryEntry"("tool_id") ON DELETE RESTRICT ON UPDATE CASCADE;
