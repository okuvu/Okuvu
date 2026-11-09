/**
 * Emit the SQL that seeds the Library from the catalogue in this package.
 *
 * The catalogue is TypeScript because the api, the portal preview and the tests
 * all read it directly. Production deploys apply migrations, though, so the rows
 * have to exist as SQL. Rather than keep two hand-written copies of sixteen
 * worksheets, this module generates the SQL and a test asserts the committed
 * migration still matches it — drift fails the build instead of shipping a
 * portal that previews something the database does not contain.
 *
 * Run (writes the file): WRITE_WORKSHEET_SQL=1 npx vitest run __tests__/migration.test.ts
 */
import { CATALOGUE, LISTABLE_CATALOGUE } from './index';
import { BREATHING_CHILD_TOOL_IDS } from './types';

const MIGRATION_DIR = '20261109130000_seed_library_worksheets';

/** Deterministic ids so re-running against an upgrade database is idempotent. */
function rowId(index: number): string {
  const n = (index + 1).toString(16).padStart(12, '0');
  return `c1b2a3d4-0000-4e00-9000-${n}`;
}

function q(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonb(value: unknown, tag: string): string {
  if (value === null) return 'NULL';
  return `$${tag}$${JSON.stringify(value)}$${tag}$::jsonb`;
}

function tagFor(toolId: string): string {
  return `ws_${toolId.replace(/[^a-z0-9_]/g, '_')}`;
}

export const MIGRATION_PATH = `packages/prisma/migrations/${MIGRATION_DIR}/migration.sql`;

export function buildMigrationSql(): string {
  const lines: string[] = [];

  lines.push(
    '-- Library catalogue: the approved worksheets, the cards that open the',
    '-- exercises and features that already exist, and the future worksheets.',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit: change the catalogue and regenerate, or the drift test',
    '-- in packages/shared-types/__tests__/migration.test.ts will fail.',
    '',
    '-- Therapist-only framing: the "For therapists:" line from the approved',
    '-- document. Never serialized to a client.',
    'ALTER TABLE "ToolRegistryEntry" ADD COLUMN "therapist_note" TEXT;',
    '',
    '-- Step 1 constrained kind to exercise/worksheet and status to',
    '-- draft/approved/retired. The Library needs one more of each: a `group`',
    '-- card (Breathing opens four techniques) and `placeholder` (future',
    '-- worksheets that exist only as a name).',
    'ALTER TABLE "ToolRegistryEntry" DROP CONSTRAINT IF EXISTS "ToolRegistryEntry_kind_check";',
    'ALTER TABLE "ToolRegistryEntry" ADD CONSTRAINT "ToolRegistryEntry_kind_check"',
    `    CHECK ("kind" IN ('exercise', 'worksheet', 'group'));`,
    'ALTER TABLE "ToolRegistryEntry" DROP CONSTRAINT IF EXISTS "ToolRegistryEntry_status_check";',
    'ALTER TABLE "ToolRegistryEntry" ADD CONSTRAINT "ToolRegistryEntry_status_check"',
    `    CHECK ("status" IN ('draft', 'approved', 'retired', 'placeholder'));`,
    '',
    '-- Which Library card a row opens from. The four breathing techniques hang',
    '-- off the one Breathing card; a row with NULL here is its own card.',
    'ALTER TABLE "ToolRegistryEntry" ADD COLUMN "library_group" TEXT;',
    '',
  );

  const columns = [
    'id',
    'tool_id',
    'label',
    'label_hi',
    'text',
    'chat_guidable',
    'kind',
    'summary',
    'summary_hi',
    'section',
    'therapy_modality',
    'therapist_note',
    'access_mode',
    'load_level',
    'est_minutes',
    'content_en',
    'content_hi',
    'status',
    'approved_at',
    'sort_order',
    'library_group',
    'updated_at',
  ];

  lines.push(`INSERT INTO "ToolRegistryEntry" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES`);

  const rows = CATALOGUE.map((entry, index) => {
    const text = entry.summary;
    const values = [
      q(rowId(index)),
      q(entry.tool_id),
      q(entry.label),
      q(entry.label_hi),
      q(text),
      'false',
      q(
        entry.opens === 'breathing'
          ? 'group'
          : entry.opens === 'grounding'
            ? 'exercise'
            : 'worksheet',
      ),
      q(entry.summary),
      q(entry.summary_hi),
      q(entry.section),
      q(entry.therapy_modality),
      q(entry.therapist_note),
      q(entry.access_mode),
      q(entry.load_level),
      entry.est_minutes === null ? 'NULL' : String(entry.est_minutes),
      jsonb(entry.content_en, tagFor(entry.tool_id)),
      jsonb(entry.content_hi, tagFor(entry.tool_id)),
      q(entry.status),
      entry.status === 'approved' ? `'2026-11-09'::timestamp` : 'NULL',
      String(entry.sort_order),
      q(entry.library_group ?? null),
      // Prisma sets @updatedAt on the client, so the column has no default.
      'CURRENT_TIMESTAMP',
    ];
    return `    (${values.join(', ')})`;
  });

  lines.push(rows.join(',\n'));
  lines.push(
    'ON CONFLICT ("tool_id") DO UPDATE SET',
    '    "label" = EXCLUDED."label",',
    '    "label_hi" = EXCLUDED."label_hi",',
    '    "kind" = EXCLUDED."kind",',
    '    "summary" = EXCLUDED."summary",',
    '    "summary_hi" = EXCLUDED."summary_hi",',
    '    "section" = EXCLUDED."section",',
    '    "therapy_modality" = EXCLUDED."therapy_modality",',
    '    "therapist_note" = EXCLUDED."therapist_note",',
    '    "access_mode" = EXCLUDED."access_mode",',
    '    "load_level" = EXCLUDED."load_level",',
    '    "est_minutes" = EXCLUDED."est_minutes",',
    '    "content_en" = EXCLUDED."content_en",',
    '    "content_hi" = EXCLUDED."content_hi",',
    '    "status" = EXCLUDED."status",',
    '    "approved_at" = EXCLUDED."approved_at",',
    '    "sort_order" = EXCLUDED."sort_order",',
    '    "library_group" = EXCLUDED."library_group",',
    '    "updated_at" = CURRENT_TIMESTAMP;',
    '',
    '-- Grounding already carries its approved description in `text`; summarising',
    '-- from the column keeps the two from drifting apart.',
    `UPDATE "ToolRegistryEntry" SET "summary" = "text" WHERE "tool_id" = 'grounding_5431';`,
    '',
    '-- The four breathing techniques hang off the one Breathing card. Their',
    '-- descriptions are their own approved one-liners, so `summary` copies',
    '-- `text` here rather than restating it.',
    `UPDATE "ToolRegistryEntry"`,
    `SET "library_group" = 'breathing',`,
    `    "section" = 'calm_my_body',`,
    `    "summary" = "text",`,
    `    "load_level" = COALESCE("load_level", 'light'),`,
    `    "est_minutes" = COALESCE("est_minutes", 3)`,
    `WHERE "tool_id" IN (${BREATHING_CHILD_TOOL_IDS.map((id) => `'${id}'`).join(', ')});`,
    '',
    '-- Breathing children are ordered inside their card, not in the Library list.',
    `UPDATE "ToolRegistryEntry" SET "sort_order" = 10 WHERE "tool_id" = 'box_breathing';`,
    `UPDATE "ToolRegistryEntry" SET "sort_order" = 20 WHERE "tool_id" = 'physiological_sigh';`,
    `UPDATE "ToolRegistryEntry" SET "sort_order" = 30 WHERE "tool_id" = 'extended_exhale';`,
    `UPDATE "ToolRegistryEntry" SET "sort_order" = 40 WHERE "tool_id" = 'humming_breath';`,
    '',
    '-- Guided breathing stays retired (clinical review v2.0.0): hidden from the',
    '-- Library, still resolvable by old Homework and Reminder rows.',
    `UPDATE "ToolRegistryEntry" SET "status" = 'retired' WHERE "tool_id" = 'guided_breathing';`,
    '',
    '-- A client must never be served a row that is not approved.',
    `CREATE INDEX "ToolRegistryEntry_kind_status_section_idx"`,
    `    ON "ToolRegistryEntry"("kind", "status", "section", "sort_order");`,
    '',
  );

  return lines.join('\n');
}

/** Rows the client-facing Library may list. Mirrors `LISTABLE_CATALOGUE`. */
export function listableToolIds(): string[] {
  return LISTABLE_CATALOGUE.map((entry) => entry.tool_id);
}
