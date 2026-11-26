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
 * Two files, because one of them is already applied:
 *
 *  - the original seed (`20261109130000_seed_library_worksheets`) carries the
 *    approved rows and the placeholders. Drafts are filtered OUT of it, so
 *    adding a draft never rewrites a migration production may already have run;
 *  - a drafts seed per batch (`20261124140000_seed_stress_burnout_drafts`)
 *    inserts the `status: 'draft'` rows. They are in the database so a therapist
 *    can preview them, and invisible to every client query because it filters on
 *    `status = 'approved'`.
 *
 * Run (writes both files): WRITE_WORKSHEET_SQL=1 npx vitest run __tests__/migration.test.ts
 */
import { CATALOGUE, LISTABLE_CATALOGUE } from '@okuvu/shared-types/worksheets';
import { APPROVED_ANXIETY_IDS } from '@okuvu/shared-types/worksheets/anxiety-worry';
import { LOW_MOOD_BATCH_IDS, APPROVED_LOW_MOOD_IDS } from '@okuvu/shared-types/worksheets/low-mood';
import { ALL_PLANS_BATCH_IDS } from '@okuvu/shared-types/worksheets/all-plans';
import { BREATHING_CHILD_TOOL_IDS } from '@okuvu/shared-types/worksheets/types';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

const MIGRATION_DIR = '20261109130000_seed_library_worksheets';

/** The first batch of drafts: the Stress & Burnout worksheets of 24 Nov 2026. */
const DRAFTS_MIGRATION_DIR = '20261124140000_seed_stress_burnout_drafts';

/** The Anxiety & Worry drafts of 24 Nov 2026, in their own migration. */
const ANXIETY_DRAFTS_MIGRATION_DIR = '20261124200000_seed_anxiety_worry_drafts';

/** The Low Mood drafts of 24 Nov 2026, in their own migration. */
const LOW_MOOD_DRAFTS_MIGRATION_DIR = '20261124230000_seed_low_mood_drafts';

/** The four "All" extras of 25 Nov 2026. */
const ALL_PLANS_DRAFTS_MIGRATION_DIR = '20261125120000_seed_all_plans_drafts';

/** The Low Mood approvals of 24 Nov 2026, in their own migration. */
const LOW_MOOD_APPROVALS_MIGRATION_DIR = '20261124233000_approve_low_mood_nine';

/** The owner's 24 Nov 2026 approvals, in their own migration. */
const APPROVALS_MIGRATION_DIR = '20261124160000_approve_stress_burnout_eight';

/**
 * The Anxiety & Worry approvals: the nine rows the owner approved on 24 Nov
 * 2026, after the five revisions he asked for. Its own migration, for the same
 * reason every approval has one — the eight of the first batch were approved as
 * written, and these were approved only once their wording changed.
 */
const ANXIETY_APPROVALS_MIGRATION_DIR = '20261124220000_approve_anxiety_worry_nine';

/**
 * The owner's second read, later the same day: the two he sent back, revised and
 * then approved. A separate migration so the history reads in order — drafted,
 * eight approved, two revised, then those two approved.
 */
const REVISED_APPROVALS_MIGRATION_DIR = '20261124180000_approve_stress_burnout_revised';

/** Deterministic ids so re-running against an upgrade database is idempotent. */
function rowId(index: number): string {
  const n = (index + 1).toString(16).padStart(12, '0');
  return `c1b2a3d4-0000-4e00-9000-${n}`;
}

/**
 * The row order the applied seed was generated in, frozen.
 *
 * Row ids are derived from this index. Recomputing them from the current
 * CATALOGUE would renumber every row after the first placeholder that later
 * became a real worksheet, which rewrites a migration production may already
 * have run — exactly what this split exists to avoid. New rows get ids from
 * `DRAFT_ID_BASE` instead, so this list never needs to grow.
 */
const LEGACY_SEED_ORDER = [
  'mood_checkin',
  'ws_name_the_feeling',
  'grounding_5431',
  'breathing',
  'ws_thought_record',
  'ws_thinking_trap',
  'ws_worry_tree',
  'ws_small_things',
  'ws_values_compass',
  'ws_hard_conversation',
  'ws_kind_friend_letter',
  'ws_three_good_things',
  'ws_energy_audit',
  'ws_bring_to_session',
  'ws_post_session',
  'ws_safety_plan',
  'ws_body_map',
  'ws_unhooking',
  'ws_fear_ladder',
  'ws_tiny_steps',
  'ws_problem_solving',
  'ws_boundary_planner',
  'ws_unsent_letter',
  'ws_naming_the_problem',
  'ws_miracle_question',
  'ws_strengths',
  'ws_exam_career_pressure',
  'ws_sleep_diary',
  'ws_scrolling_log',
  'ws_family_expectations',
  'ws_comparison_check',
  'ws_inner_critic',
  'ws_exposure_ladder',
  'ws_pros_cons_change',
] as const;

/** First id index for rows that were never in the applied seed. */
const DRAFT_ID_BASE = 1000;

/**
 * The Anxiety & Worry batch (24 Nov 2026), in the owner's order.
 *
 * Its own list and its own id range: the Stress & Burnout batch already owns
 * 1000-1009, and a shared range would give two rows the same primary key the
 * moment both migrations run. Membership is a list rather than "whatever is
 * `draft` today", for the same reason as the first batch — a later approval must
 * never silently move a row between migrations.
 */
export const ANXIETY_DRAFT_BATCH_IDS = [
  'ws_worry_time',
  'ws_brain_dump',
  'ws_unhooking',
  'ws_sos_calm',
  'ws_sitting_with_not_knowing',
  'ws_exam_career_pressure',
  'ws_social_situation_prep',
  'ws_family_expectations',
  'ws_exposure_ladder',
] as const;

/** First id index for the Anxiety batch, kept clear of the earlier batch. */
const ANXIETY_ID_BASE = 2000;

/** First id index for the Low Mood batch, kept clear of the two before it. */
const LOW_MOOD_ID_BASE = 3000;

/** First id index for the "All" extras, kept clear of the three before them. */
const ALL_PLANS_ID_BASE = 4000;

/**
 * The ten Stress & Burnout rows of 24 Nov 2026, in the owner's order.
 *
 * Membership is a list rather than "whatever is `draft` today", so a later
 * approval never silently adds a row to the applied seed or drops one from the
 * batch. The eight the owner approved on the same day are flipped in their own
 * migration, generated from `APPROVED_24_NOV_IDS`; the two sent back for a
 * wording change stay here as drafts. A later batch gets its own list.
 */
export const DRAFT_BATCH_IDS = [
  'ws_whats_on_my_plate',
  'ws_basics_check',
  'ws_rest_break',
  'ws_boundary_planner',
  'ws_priority_sorter',
  'ws_scrolling_log',
  'ws_weekly_load_check',
  'ws_unsent_letter',
  'ws_pros_cons_change',
  'ws_caring_load_check',
] as const;

/**
 * The eight rows the owner approved on 24 November 2026, as written.
 *
 * A list, not "whatever is `approved` today": a later approval gets its own
 * migration, and this one keeps meaning the 24 Nov decisions. The two rows of
 * the same batch that were sent back for a wording change are not here.
 */
export const APPROVED_24_NOV_IDS = [
  'ws_whats_on_my_plate',
  'ws_basics_check',
  'ws_rest_break',
  'ws_boundary_planner',
  'ws_priority_sorter',
  'ws_scrolling_log',
  'ws_weekly_load_check',
  'ws_caring_load_check',
] as const;

/**
 * The two the owner sent back on 24 Nov 2026, revised and then approved later
 * the same day: Unsent letter and Weighing it up.
 *
 * A separate list from `APPROVED_24_NOV_IDS` because the approval has its own
 * migration and its own record — the eight above were approved as written, and
 * these two were approved only after the revisions (the letter's helper and
 * delete line, the "what change are you thinking about" question and the
 * readiness helper). A row here must still be `draft` in the drafts migration.
 */
export const APPROVED_24_NOV_REVISED_IDS = [
  'ws_unsent_letter',
  'ws_pros_cons_change',
] as const;

/**
 * The four placeholder rows from the applied seed that this batch turns into real
 * worksheets: Boundary planner (950), Unsent letter (960), Scrolling log (1020)
 * and Pros and cons of change (1040).
 *
 * They are frozen here with the copy the applied migration wrote. The seed file
 * has to stay byte-identical — production may already have run it — so the seed
 * still creates the placeholder, and the drafts migration upgrades that row in
 * place through ON CONFLICT. Nothing reads these objects at runtime; they exist
 * only so a historical migration can be regenerated.
 */
function frozenPlaceholder(
  tool_id: string,
  label: string,
  purpose: string,
  section: CatalogueEntry['section'],
  sort_order: number,
  sensitiveCheck: boolean,
  accessMode: CatalogueEntry['access_mode'] = 'assigned',
): CatalogueEntry {
  return {
    tool_id,
    label,
    label_hi: null,
    summary: purpose,
    summary_hi: null,
    section,
    therapy_modality: null,
    therapist_note: null,
    access_mode: accessMode,
    load_level: null,
    est_minutes: null,
    sort_order,
    status: 'placeholder',
    content_en: null,
    content_hi: null,
    opens: 'worksheet',
    care_plans: [],
    sensitive_check: sensitiveCheck,
  };
}

const FROZEN_DRAFT_PLACEHOLDERS: Record<string, CatalogueEntry> = {
  ws_body_map: frozenPlaceholder(
    'ws_body_map',
    'Body map',
    'Mark where in the body a feeling shows up, and how strong it is there.',
    'notice_and_name',
    900,
    false,
  ),
  ws_sleep_diary: frozenPlaceholder(
    'ws_sleep_diary',
    'Sleep diary',
    'Record sleep and wake times and how the day felt, to spot a pattern.',
    'energy_life',
    1010,
    true,
  ),
  ws_boundary_planner: frozenPlaceholder(
    'ws_boundary_planner',
    'Boundary planner',
    'Work out what a boundary is, what to say, and what to do if it is pushed.',
    'people_boundaries',
    950,
    false,
  ),
  ws_unsent_letter: frozenPlaceholder(
    'ws_unsent_letter',
    'Unsent letter',
    'Write what was never said to someone, without sending it.',
    'people_boundaries',
    960,
    true,
  ),
  ws_scrolling_log: frozenPlaceholder(
    'ws_scrolling_log',
    'Scrolling log',
    'Note when and why scrolling happens, and how it felt afterwards.',
    'energy_life',
    1020,
    true,
  ),
  ws_exposure_ladder: frozenPlaceholder(
    'ws_exposure_ladder',
    'Exposure ladder',
    'Therapist-only: order avoided situations from easiest to hardest, and plan the steps.',
    'do_what_matters',
    1070,
    false,
    'therapist_only',
  ),
  ws_unhooking: frozenPlaceholder(
    'ws_unhooking',
    'Unhooking from thoughts',
    'Notice a thought, name it as a thought, and let it pass without arguing with it.',
    'untangle_thoughts',
    910,
    false,
  ),
  ws_exam_career_pressure: frozenPlaceholder(
    'ws_exam_career_pressure',
    'Exam and career pressure planner',
    'Plan around exam and career pressure: what is in your control this week, and what is not.',
    'energy_life',
    1000,
    false,
  ),
  ws_family_expectations: frozenPlaceholder(
    'ws_family_expectations',
    'Family expectations map',
    'Map what family expects, what the client wants, and where the two overlap.',
    'people_boundaries',
    1030,
    false,
  ),
  ws_tiny_steps: frozenPlaceholder(
    'ws_tiny_steps',
    'Tiny steps',
    'Turn one big task into the smallest first step that can be done today.',
    'do_what_matters',
    930,
    false,
  ),
  ws_miracle_question: frozenPlaceholder(
    'ws_miracle_question',
    'The miracle question',
    'Describe how things would look if the problem were solved, to find a first step.',
    'do_what_matters',
    980,
    false,
  ),
  ws_strengths: frozenPlaceholder(
    'ws_strengths',
    'Strengths',
    'Name strengths the client already uses, with an example of each.',
    'be_kinder',
    990,
    false,
  ),
  ws_comparison_check: frozenPlaceholder(
    'ws_comparison_check',
    'Comparison check',
    'Notice where comparing yourself with other people lands, and what it costs.',
    'untangle_thoughts',
    1050,
    true,
  ),
  ws_inner_critic: frozenPlaceholder(
    'ws_inner_critic',
    'Meet the inner critic',
    'Describe the critical voice as something separate, and notice what it says.',
    'be_kinder',
    1060,
    true,
  ),
  ws_pros_cons_change: frozenPlaceholder(
    'ws_pros_cons_change',
    'Pros and cons of change',
    'Lay out the costs and benefits of changing, and of staying the same.',
    'do_what_matters',
    1040,
    false,
  ),
};

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

const COLUMNS = [
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
  'care_plans',
  'sensitive_check',
  'updated_at',
];

type IndexedEntry = { entry: CatalogueEntry; index: number };

function buildInsert(rows: IndexedEntry[]): string[] {
  const lines: string[] = [];
  lines.push(`INSERT INTO "ToolRegistryEntry" (${COLUMNS.map((c) => `"${c}"`).join(', ')}) VALUES`);

  const values = rows.map(({ entry, index }) => {
    const cells = [
      q(rowId(index)),
      q(entry.tool_id),
      q(entry.label),
      q(entry.label_hi),
      q(entry.summary),
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
      entry.status === 'approved' ? q(entry.approved_at ?? '2026-11-09') + '::timestamp' : 'NULL',
      String(entry.sort_order),
      q(entry.library_group ?? null),
      `ARRAY[${entry.care_plans.map((label) => q(label)).join(', ')}]::TEXT[]`,
      entry.sensitive_check ? 'true' : 'false',
      // Prisma sets @updatedAt on the client, so the column has no default.
      'CURRENT_TIMESTAMP',
    ];
    return `    (${cells.join(', ')})`;
  });

  lines.push(values.join(',\n'));
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
    '    "care_plans" = EXCLUDED."care_plans",',
    '    "sensitive_check" = EXCLUDED."sensitive_check",',
    '    "updated_at" = CURRENT_TIMESTAMP;',
    '',
  );
  return lines;
}

export const MIGRATION_PATH = `packages/prisma/migrations/${MIGRATION_DIR}/migration.sql`;
export const ANXIETY_DRAFTS_MIGRATION_PATH = `packages/prisma/migrations/${ANXIETY_DRAFTS_MIGRATION_DIR}/migration.sql`;
export const DRAFTS_MIGRATION_PATH = `packages/prisma/migrations/${DRAFTS_MIGRATION_DIR}/migration.sql`;
export const APPROVALS_MIGRATION_PATH = `packages/prisma/migrations/${APPROVALS_MIGRATION_DIR}/migration.sql`;
export const REVISED_APPROVALS_MIGRATION_PATH = `packages/prisma/migrations/${REVISED_APPROVALS_MIGRATION_DIR}/migration.sql`;
export const ANXIETY_APPROVALS_MIGRATION_PATH = `packages/prisma/migrations/${ANXIETY_APPROVALS_MIGRATION_DIR}/migration.sql`;
export const LOW_MOOD_DRAFTS_MIGRATION_PATH = `packages/prisma/migrations/${LOW_MOOD_DRAFTS_MIGRATION_DIR}/migration.sql`;
export const ALL_PLANS_DRAFTS_MIGRATION_PATH = `packages/prisma/migrations/${ALL_PLANS_DRAFTS_MIGRATION_DIR}/migration.sql`;
export const LOW_MOOD_APPROVALS_MIGRATION_PATH = `packages/prisma/migrations/${LOW_MOOD_APPROVALS_MIGRATION_DIR}/migration.sql`;

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
    '-- Which care plan(s) a row belongs to: anxiety_worry, low_mood,',
    '-- stress_burnout, or `all`. Drives the ORDER a client sees; never sent to',
    '-- the client as a label. Empty means not decided (placeholders).',
    'ALTER TABLE "ToolRegistryEntry" ADD COLUMN "care_plans" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];',
    'ALTER TABLE "ToolRegistryEntry" DROP CONSTRAINT IF EXISTS "ToolRegistryEntry_care_plans_check";',
    'ALTER TABLE "ToolRegistryEntry" ADD CONSTRAINT "ToolRegistryEntry_care_plans_check"',
    "    CHECK (\"care_plans\" <@ ARRAY['anxiety_worry', 'low_mood', 'stress_burnout', 'all']::TEXT[]);",
    '',
    '-- True when this row also runs the deeper risk screen (eating and body,',
    '-- sleep, self-harm, harm to someone else). A property of the row, not a list',
    '-- of ids in code. Defaults false so an insert that says nothing gets the',
    '-- ordinary screen rather than silently claiming the deeper one.',
    'ALTER TABLE "ToolRegistryEntry" ADD COLUMN "sensitive_check" BOOLEAN NOT NULL DEFAULT false;',
    '',
  );

  lines.push(
    ...buildInsert(
      LEGACY_SEED_ORDER.map((id, index) => {
        const current = CATALOGUE.find((row) => row.tool_id === id);
        const entry = FROZEN_DRAFT_PLACEHOLDERS[id] ?? current;
        if (!entry) throw new Error(`seed row "${id}" is not in the catalogue`);
        return { entry, index };
      }),
    ),
  );

  lines.push(
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

/**
 * The drafts migration, regenerated after the 24 Nov decisions.
 *
 * It still carries all ten rows of the batch, and every one is written
 * `status = 'draft'` — the status the batch had when it was drafted. Approving
 * a row is a separate migration (below), so the history reads in order: these
 * ten were drafted, then eight were approved, and two were sent back for a
 * wording change and remain drafts here with the revised copy.
 */
export function buildDraftsSql(): string {
  const lines: string[] = [
    '-- Stress & Burnout worksheets, 24 November 2026: the ten the owner briefed.',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit; regenerate instead.',
    '--',
    '-- Every row is `draft`: a therapist can preview it, and no client can open,',
    '-- list or be assigned one until the owner approves its wording. Four rows',
    '-- reuse a placeholder id the applied seed already created (Boundary planner,',
    '-- Unsent letter, Scrolling log, Pros and cons of change) and are upgraded in',
    '-- place by the ON CONFLICT branch; the other six are new.',
    '--',
    '-- The owner approved eight of these on 24 Nov 2026; that decision is the',
    '-- next migration, not an edit here. The two that were sent back for a wording',
    '-- change (Unsent letter, Weighing it up) stay drafts, with the revised copy.',
    '',
  ];

  lines.push(
    ...buildInsert(
      DRAFT_BATCH_IDS.map((id, i) => {
        const entry = CATALOGUE.find((row) => row.tool_id === id);
        if (!entry) throw new Error(`draft batch row "${id}" is not in the catalogue`);
        // The batch was drafted here, whatever a later approval says.
        return { entry: { ...entry, status: 'draft' as const, approved_at: undefined }, index: DRAFT_ID_BASE + i };
      }),
    ),
  );

  return lines.join('\n');
}

/**
 * The owner's approvals of 24 Nov 2026.
 *
 * One INSERT ... ON CONFLICT per row rather than an `UPDATE ... SET status`,
 * because the approved copy must travel with the status: a row promoted by a
 * status-only update would keep whatever body the drafts migration wrote, and
 * the two migrations would have to be read together to know what a client sees.
 * The `approved_at` date is the owner's, not the 9 Nov document's.
 */
export function buildApprovalsSql(): string {
  const lines: string[] = [
    '-- The owner approved these eight Stress & Burnout worksheets as written,',
    '-- on 24 November 2026. The wording is unchanged from the drafts migration;',
    '-- this migration is the approval, and it writes the approval date with it.',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit; regenerate instead.',
    '--',
    '-- Unsent letter and Weighing it up are NOT here: they were sent back for a',
    '-- wording change and stay `draft` in the previous migration.',
    '',
  ];

  lines.push(
    ...buildInsert(
      APPROVED_24_NOV_IDS.map((id) => {
        const entry = CATALOGUE.find((row) => row.tool_id === id);
        if (!entry) throw new Error(`approved batch row "${id}" is not in the catalogue`);
        if (entry.status !== 'approved') {
          throw new Error(`"${id}" is in the approval batch but is ${entry.status} in the catalogue`);
        }
        // Same row id the drafts migration used, so the two agree about identity.
        return { entry, index: DRAFT_ID_BASE + DRAFT_BATCH_IDS.indexOf(id) };
      }),
    ),
  );

  return lines.join('\n');
}

/**
 * The owner's second read of 24 Nov 2026: the two worksheets he sent back,
 * revised, then approved later the same day.
 *
 * Same shape as the eight-row approval — one INSERT ... ON CONFLICT per row, so
 * the approved copy travels with the status and a row promoted by a status-only
 * update cannot keep a body nobody approved.
 */
export function buildRevisedApprovalsSql(): string {
  const lines: string[] = [
    '-- The owner approved these two Stress & Burnout worksheets after the',
    '-- revisions he asked for, later on 24 November 2026: the Unsent letter',
    '-- (letter helper, delete helper) and Weighing it up (what change is this,',
    '-- four boxes about it, readiness helper).',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit; regenerate instead.',
    '--',
    '-- The copy written here is the revised text he read and approved. The',
    '-- previous migration left both rows `draft` with the pre-revision wording.',
    '',
  ];

  lines.push(
    ...buildInsert(
      APPROVED_24_NOV_REVISED_IDS.map((id) => {
        const entry = CATALOGUE.find((row) => row.tool_id === id);
        if (!entry) throw new Error(`revised approval row "${id}" is not in the catalogue`);
        if (entry.status !== 'approved') {
          throw new Error(`"${id}" is in the revised approval batch but is ${entry.status} in the catalogue`);
        }
        // Same row id the drafts migration used, so all three agree about identity.
        return { entry, index: DRAFT_ID_BASE + DRAFT_BATCH_IDS.indexOf(id) };
      }),
    ),
  );

  return lines.join('\n');
}

/**
 * The Anxiety & Worry drafts of 24 Nov 2026.
 *
 * Same shape as the first batch: every row is written `status = 'draft'`, so a
 * therapist can preview it and no client can list, open or be assigned one until
 * the owner approves its wording. Three rows reuse ids the applied seed created
 * as placeholders (Unhooking, Exam and career pressure planner, Family
 * expectations map) and are upgraded in place by the ON CONFLICT branch; the
 * other six are new.
 */
export function buildAnxietyDraftsSql(): string {
  const lines: string[] = [
    '-- Anxiety & Worry worksheets, 24 November 2026: the nine the owner briefed.',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit; regenerate instead.',
    '--',
    '-- Every row is `draft`: a therapist can preview it, and no client can open,',
    '-- list or be assigned one until the owner approves its wording. Three rows',
    '-- reuse a placeholder id the applied seed already created (Unhooking, Exam',
    '-- and career pressure planner, Family expectations map) and are upgraded in',
    '-- place by the ON CONFLICT branch; the other six are new.',
    '--',
    '-- The exposure ladder is therapist-only: it can never be a Library card,',
    '-- never be assigned, and a direct client request answers as an unknown id.',
    '',
  ];

  lines.push(
    ...buildInsert(
      ANXIETY_DRAFT_BATCH_IDS.map((id, i) => {
        const entry = CATALOGUE.find((row) => row.tool_id === id);
        if (!entry) throw new Error(`anxiety batch row "${id}" is not in the catalogue`);
        return {
          entry: { ...entry, status: 'draft' as const, approved_at: undefined },
          index: ANXIETY_ID_BASE + i,
        };
      }),
    ),
  );

  return lines.join('\n');
}

/**
 * The nine Anxiety & Worry rows the owner approved on 24 November 2026.
 *
 * His message approved six as written and five after changes (Unhooking from a
 * thought, SOS calm, Sitting with not knowing, Social situation prep — four
 * rows; Worry time, Brain-dump, Big day planner, Pressure map, Exposure ladder
 * and the exposure pause line as written). The copy inserted here is the text
 * he read back, so the migration carries the approved wording with the status
 * rather than promoting a body nobody approved.
 *
 * The Exposure ladder is `therapist_only` and approved: it is in the catalogue
 * for therapists to build from, and it is still never a Library card, never
 * assignable and never suggested by chat — those are properties of the row, not
 * of its status.
 */
export function buildAnxietyApprovalsSql(): string {
  const lines: string[] = [
    '-- The owner approved the nine Anxiety & Worry worksheets on 24 November',
    '-- 2026: five as written, four after the revisions he asked for.',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit; regenerate instead.',
    '--',
    '-- The copy written here is the revised, approved text. The drafts migration',
    '-- that preceded it leaves every row `draft`; this one is the approval, and',
    '-- it carries the wording with it so a row cannot be promoted without its',
    '-- approved body.',
    '--',
    '-- The Exposure ladder is approved and therapist-only. Approval does not put',
    '-- it in the client Library: that is `access_mode`, and the client read path',
    '-- still answers 404 for it.',
    '',
  ];

  lines.push(
    ...buildInsert(
      APPROVED_ANXIETY_IDS.map((id) => {
        const entry = CATALOGUE.find((row) => row.tool_id === id);
        if (!entry) throw new Error(`approved anxiety row "${id}" is not in the catalogue`);
        if (entry.status !== 'approved') {
          throw new Error(`"${id}" is in the approval batch but is ${entry.status} in the catalogue`);
        }
        // Same row id the drafts migration used, so the two agree about identity.
        return { entry, index: ANXIETY_ID_BASE + ANXIETY_DRAFT_BATCH_IDS.indexOf(id) };
      }),
    ),
  );

  return lines.join('\n');
}

/**
 * The Low Mood drafts of 24 Nov 2026.
 *
 * Same shape as the two batches before it: every row is written
 * `status = 'draft'`, so a therapist can preview it and no client can list, open
 * or be assigned one until the owner approves its wording. Five rows reuse ids
 * the applied seed created as placeholders (Tiny steps, The miracle question,
 * Strengths, Comparison check, Meet the inner critic) and are upgraded in place
 * by the ON CONFLICT branch; the other four are new.
 */
export function buildLowMoodDraftsSql(): string {
  const lines: string[] = [
    '-- Low Mood worksheets, 24 November 2026: the nine the owner briefed.',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit; regenerate instead.',
    '--',
    '-- Every row is `draft`: a therapist can preview it, and no client can open,',
    '-- list or be assigned one until the owner approves its wording. Five rows',
    '-- reuse a placeholder id the applied seed already created (Tiny steps, The',
    '-- miracle question, Strengths, Comparison check, Meet the inner critic) and',
    '-- are upgraded in place by the ON CONFLICT branch; the other four are new.',
    '--',
    '-- Meet the inner critic and the Comparison check carry `sensitive_check`, so',
    '-- their answers also run the deeper screen the owner named on 24 Nov 2026.',
    '',
  ];

  lines.push(
    ...buildInsert(
      LOW_MOOD_BATCH_IDS.map((id, i) => {
        const entry = CATALOGUE.find((row) => row.tool_id === id);
        if (!entry) throw new Error(`low mood batch row \"${id}\" is not in the catalogue`);
        return {
          entry: { ...entry, status: 'draft' as const, approved_at: undefined },
          index: LOW_MOOD_ID_BASE + i,
        };
      }),
    ),
  );

  return lines.join('\n');
}

/**
 * The four "All" extras of 25 Nov 2026.
 *
 * Same shape as the three batches before it: every row is written
 * `status = 'draft'`, so a therapist can preview it and no client can list, open
 * or be assigned one until the owner approves its wording. Two rows reuse ids
 * the applied seed created as placeholders (Body map, Sleep diary) and are
 * upgraded in place by the ON CONFLICT branch; the two audio-guided ones are new.
 *
 * The Sleep diary carries `sensitive_check`, so its answers also run the deeper
 * screen the owner named on 24 Nov 2026.
 */
export function buildAllPlansDraftsSql(): string {
  const lines: string[] = [
    '-- The "All" extras, 25 November 2026: the four the owner briefed.',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit; regenerate instead.',
    '--',
    '-- Every row is `draft`: a therapist can preview it, and no client can open,',
    '-- list or be assigned one until the owner approves its wording. Two rows',
    '-- reuse a placeholder id the applied seed already created (Body map, Sleep',
    '-- diary) and are upgraded in place by the ON CONFLICT branch; Muscle',
    '-- relaxation and Safe place are new.',
    '--',
    '-- The Sleep diary carries `sensitive_check`, so its answers also run the',
    '-- deeper screen the owner named on 24 Nov 2026.',
    '--',
    '-- Muscle relaxation and Safe place are audio-guided in intent; nothing is',
    '-- recorded yet, and their bodies carry the script the owner has to approve',
    '-- before a voice is chosen.',
    '',
  ];

  lines.push(
    ...buildInsert(
      ALL_PLANS_BATCH_IDS.map((id, i) => {
        const entry = CATALOGUE.find((row) => row.tool_id === id);
        if (!entry) throw new Error(`all-plans batch row "${id}" is not in the catalogue`);
        return {
          entry: { ...entry, status: 'draft' as const, approved_at: undefined },
          index: ALL_PLANS_ID_BASE + i,
        };
      }),
    ),
  );

  return lines.join('\n');
}

/**
 * The nine Low Mood rows the owner approved on 24 November 2026.
 *
 * Five as written, four after the revisions he asked for: Things I might enjoy
 * ("Sitting outside at sunset"), Reconnect planner ("Who would you like to be
 * back in touch with?" and its helper), The morning after a miracle ("This is a
 * question therapists often ask"), Strengths spotting (a "Something of my own"
 * option with its own short answer). The copy inserted here is the text he read
 * back, so the migration carries the approved wording with the status rather
 * than promoting a body nobody approved.
 */
export function buildLowMoodApprovalsSql(): string {
  const lines: string[] = [
    '-- The owner approved the nine Low Mood worksheets on 24 November 2026: five',
    '-- as written, four after the revisions he asked for.',
    '--',
    '-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.',
    '-- Do not hand-edit; regenerate instead.',
    '--',
    '-- The copy written here is the revised, approved text. The drafts migration',
    '-- that preceded it leaves every row `draft`; this one is the approval, and it',
    '-- carries the wording with it so a row cannot be promoted without its',
    '-- approved body.',
    '--',
    '-- Meet the inner critic and the Comparison check are approved AND keep',
    '-- `sensitive_check`: approval does not retire the deeper screen they carry.',
    '',
  ];

  lines.push(
    ...buildInsert(
      APPROVED_LOW_MOOD_IDS.map((id) => {
        const entry = CATALOGUE.find((row) => row.tool_id === id);
        if (!entry) throw new Error(`approved low mood row "${id}" is not in the catalogue`);
        if (entry.status !== 'approved') {
          throw new Error(`"${id}" is in the approval batch but is ${entry.status} in the catalogue`);
        }
        // Same row id the drafts migration used, so the two agree about identity.
        return { entry, index: LOW_MOOD_ID_BASE + LOW_MOOD_BATCH_IDS.indexOf(id) };
      }),
    ),
  );

  return lines.join('\n');
}

/** Rows the client-facing Library may list. Mirrors `LISTABLE_CATALOGUE`. */
export function listableToolIds(): string[] {
  return LISTABLE_CATALOGUE.map((entry) => entry.tool_id);
}

/** Draft rows, by id. Used by the tests and the review document. */
export function draftEntries(): CatalogueEntry[] {
  return CATALOGUE.filter((entry) => entry.status === 'draft');
}
