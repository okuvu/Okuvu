-- Client record numbers.
--
-- Every client registered from the portal gets a system-generated number of
-- the shape `<initials><birth YY><gender letter><serial>` — `SG88F0001`.
-- Three parts, all derived from data the Add-client wizard already collects:
--
--   initials   first letter of the first and last word of User.full_name
--              (a single word gets X as its second letter)
--   birth YY   two-digit year of User.date_of_birth
--   gender     M / F / X — anything that is not Male or Female is X
--   serial     a GLOBAL counter, four digits, never reused
--
-- The number is minted once and never rewritten, which is why it is stored on
-- the row rather than derived on read: a record number that moves is worse
-- than one that is slightly wrong, and a corrected birth year or a name change
-- must not silently renumber a clinical record.
--
-- Existing rows are numbered here, in creation order, so the serials read as a
-- history. Rows missing a birth year or gender cannot be numbered without
-- inventing data — they stay NULL, and the console's "Set ID details" action
-- mints one the moment an operator fills the gap.

-- ── 1. The column and the counter ────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "client_code" TEXT;

-- Unique: two clients must never share a record number. Postgres treats
-- multiple NULLs as distinct, so unnumbered rows do not fight over it.
CREATE UNIQUE INDEX "User_client_code_key" ON "User"("client_code");

CREATE TABLE "ClientCodeSequence" (
    "id" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ClientCodeSequence_pkey" PRIMARY KEY ("id")
);

-- Seeded so the first registration increments (rather than upserts) a row that
-- already exists: ON CONFLICT DO UPDATE takes a row lock, which is what
-- serialises two registrations racing for the same number.
INSERT INTO "ClientCodeSequence" ("id", "last_value") VALUES ('client_code', 0);

-- ── 2. Number the clients that already exist ─────────────────────────────
-- Same rules as apps/therapist-portal/src/lib/client-code.ts. Written out in
-- SQL because a migration cannot import TypeScript; the two are pinned to
-- agree by the fixture cases in that module's test.
DO $$
DECLARE
  r        RECORD;
  n        INTEGER := 0;
  words    TEXT[];
  initial1 TEXT;
  initial2 TEXT;
  gender_c TEXT;
  code     TEXT;
BEGIN
  FOR r IN
    SELECT "id", "full_name", "date_of_birth", "gender"
    FROM "User"
    WHERE "deleted_at" IS NULL
      AND "full_name" IS NOT NULL AND BTRIM("full_name") <> ''
      AND "date_of_birth" IS NOT NULL
      AND "gender" IS NOT NULL AND BTRIM("gender") <> ''
    ORDER BY "created_at" ASC, "id" ASC
  LOOP
    n := n + 1;

    words := regexp_split_to_array(BTRIM(r."full_name"), '\s+');
    -- `[[:alpha:]]` rather than the first character: the TypeScript rule takes
    -- the first *letter* of each word, so a name written as "(Asha) Rao" gives
    -- A, not a bracket. The two implementations must agree exactly.
    initial1 := COALESCE(UPPER(SUBSTRING(words[1] FROM '[[:alpha:]]')), 'X');
    IF array_length(words, 1) > 1 THEN
      initial2 := COALESCE(
        UPPER(SUBSTRING(words[array_length(words, 1)] FROM '[[:alpha:]]')),
        'X'
      );
    ELSE
      initial2 := 'X';
    END IF;

    gender_c := CASE UPPER(SUBSTRING(BTRIM(r."gender") FROM 1 FOR 1))
                  WHEN 'M' THEN 'M'
                  WHEN 'F' THEN 'F'
                  ELSE 'X'
                END;

    code := initial1 || initial2
            || TO_CHAR(r."date_of_birth", 'YY')
            || gender_c
            || LPAD(n::TEXT, 4, '0');

    UPDATE "User" SET "client_code" = code WHERE "id" = r."id";
  END LOOP;

  UPDATE "ClientCodeSequence" SET "last_value" = n WHERE "id" = 'client_code';
END $$;

-- ── 3. One data repair, same pass ────────────────────────────────────────
-- The P0 migration backfilled TherapistClient.client_label from
-- User.full_name, then the email local part, then 'Client' — never a phone
-- number. Rows written before that migration by the phone-first code path
-- carry a masked phone as their label instead (the therapist's Dashboard reads
-- "•••• ••• 6553" where a name belongs). A real name never starts with that
-- bullet character, so the predicate is safe to scope this tightly.
UPDATE "TherapistClient" tc
SET "client_label" = COALESCE(
  NULLIF(BTRIM(u."full_name"), ''),
  NULLIF(SPLIT_PART(u."email", '@', 1), ''),
  tc."client_label"
)
FROM "User" u
WHERE u."id" = tc."client_user_id"
  AND LEFT(tc."client_label", 1) = chr(8226);
