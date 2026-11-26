/**
 * The care plan labels must reach the sixteen worksheets on a database that has
 * already run the old setup file.
 *
 * The failure this pins: `20261109130000_seed_library_worksheets` was edited in
 * place to carry `care_plans`, but an applied migration never re-runs. Every
 * deployed database ran the old bytes (no such column) and then
 * `20261124090000`, which adds the column with `DEFAULT '{}'` and backfills
 * nothing — so all sixteen read as "not decided" on exactly the systems the
 * owner sees, while a freshly built database and every unit test look correct.
 *
 * The test performs the sequence those databases actually went through, against
 * a real Postgres engine (PGlite, in-process):
 *
 *   1. the table as it stood before the labels, holding the sixteen rows;
 *   2. the real `20261124090000` migration, which is where the column arrives
 *      empty;
 *   3. the new labels migration, read from its own file.
 *
 * It then asserts three things: the sixteen are labelled exactly as the owner
 * listed them, nothing else about them changed, and rows the migration does not
 * name are untouched.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import { CATALOGUE, type CatalogueEntry } from '@okuvu/shared-types/worksheets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const MIGRATIONS = join(REPO_ROOT, 'packages', 'prisma', 'migrations');
const COLUMN_MIGRATION = '20261124090000_worksheet_care_plans_and_sensitive_check';
const LABEL_MIGRATION = '20261126120000_care_plan_labels_original_sixteen';

/**
 * The sixteen worksheets that shipped before the care plan labels existed, and
 * the labels the owner gave them on 24 Nov 2026. Kept here deliberately as the
 * owner's list rather than derived from today's catalogue: the test's job is to
 * check the migration against his list, and two copies of a fact that disagree
 * is the defect it exists to catch. The catalogue is compared to this list in
 * the second test.
 */
const ORIGINAL_SIXTEEN: Array<[string, string[]]> = [
  ['ws_worry_tree', ['anxiety_worry']],
  ['ws_thinking_trap', ['anxiety_worry']],
  ['ws_thought_record', ['anxiety_worry', 'low_mood']],
  ['ws_small_things', ['low_mood']],
  ['ws_three_good_things', ['low_mood']],
  ['ws_kind_friend_letter', ['low_mood']],
  ['ws_values_compass', ['low_mood']],
  ['ws_energy_audit', ['stress_burnout']],
  ['ws_hard_conversation', ['stress_burnout']],
  ['mood_checkin', ['all']],
  ['ws_name_the_feeling', ['all']],
  ['breathing', ['all']],
  ['grounding_5431', ['all']],
  ['ws_bring_to_session', ['all']],
  ['ws_post_session', ['all']],
  ['ws_safety_plan', ['all']],
];

/** Rows the migration must leave alone, carrying labels of their own. */
const UNTOUCHED: Array<[string, string[]]> = [
  ['ws_whats_on_my_plate', ['stress_burnout']],
  ['ws_worry_time', ['anxiety_worry']],
  ['ws_one_small_thing', ['low_mood']],
];

function migrationSql(name: string): string {
  return readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf-8');
}

/**
 * The table as it stood before `20261124090000`: the columns the original seed
 * wrote, and no `care_plans`. Later columns on the model (`kind`, `status`,
 * `content_en`, ...) are included so the "nothing else changed" assertion has
 * real values to compare; the migration under test only knows about two.
 */
const TABLE_BEFORE_LABELS = `
CREATE TABLE "ToolRegistryEntry" (
    "id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'exercise',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approved_at" TIMESTAMP,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "content_en" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolRegistryEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ToolRegistryEntry_tool_id_key" ON "ToolRegistryEntry"("tool_id");
`;

interface Row {
  id: string;
  tool_id: string;
  label: string;
  kind: string;
  status: string;
  approved_at: string | null;
  sort_order: number;
  content_en: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  care_plans?: string[];
}

async function oldDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(TABLE_BEFORE_LABELS);

  const rows: Row[] = [
    ...ORIGINAL_SIXTEEN.map(([toolId], index) => ({
      // Synthetic ids on purpose: the migration is keyed on `tool_id`, so this
      // also proves it does not depend on the ids the seed generator emitted.
      id: `row-${String(index + 1).padStart(2, '0')}`,
      tool_id: toolId,
      label: `Label for ${toolId}`,
      kind: toolId === 'mood_checkin' ? 'worksheet' : 'worksheet',
      status: 'approved',
      approved_at: '2026-11-09T00:00:00.000Z',
      sort_order: (index + 1) * 10,
      content_en: { version: 1, closing: { text: `Closing ${toolId}` } },
      created_at: '2026-11-09T00:00:00.000Z',
      updated_at: '2026-11-09T00:00:00.000Z',
    })),
    ...UNTOUCHED.map(([toolId], index) => ({
      id: `later-${index + 1}`,
      tool_id: toolId,
      label: `Label for ${toolId}`,
      kind: 'worksheet',
      status: 'approved',
      approved_at: '2026-11-24T00:00:00.000Z',
      sort_order: 1000 + index,
      content_en: { version: 1, closing: { text: `Closing ${toolId}` } },
      created_at: '2026-11-24T00:00:00.000Z',
      updated_at: '2026-11-24T00:00:00.000Z',
    })),
    {
      id: 'draft-1',
      tool_id: 'ws_four_all_extras_placeholder',
      label: 'A draft the labels migration never names',
      kind: 'worksheet',
      status: 'draft',
      approved_at: null,
      sort_order: 2000,
      content_en: null,
      created_at: '2026-11-25T00:00:00.000Z',
      updated_at: '2026-11-25T00:00:00.000Z',
    },
  ];

  for (const row of rows) {
    await db.query(
      `INSERT INTO "ToolRegistryEntry"
         ("id", "tool_id", "label", "kind", "status", "approved_at", "sort_order",
          "content_en", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        row.id,
        row.tool_id,
        row.label,
        row.kind,
        row.status,
        row.approved_at,
        row.sort_order,
        row.content_en === null ? null : JSON.stringify(row.content_en),
        row.created_at,
        row.updated_at,
      ],
    );
  }

  // The real migration every deployed database ran after the seed: the column
  // arrives, empty, with `DEFAULT '{}'` and no backfill.
  await db.exec(migrationSql(COLUMN_MIGRATION));

  // The later batches were labelled by their own migrations, which is why they
  // are the control group: a row that already carries a label must survive this
  // migration untouched.
  for (const [toolId, labels] of UNTOUCHED) {
    await db.query(`UPDATE "ToolRegistryEntry" SET "care_plans" = $1::TEXT[] WHERE "tool_id" = $2`, [
      `{${labels.join(',')}}`,
      toolId,
    ]);
  }

  return db;
}

async function snapshot(db: PGlite): Promise<Row[]> {
  const result = await db.query<Row>(
    `SELECT "id", "tool_id", "label", "kind", "status",
            "approved_at"::text AS approved_at, "sort_order",
            "content_en", "created_at"::text AS created_at, "updated_at"::text AS updated_at,
            "care_plans"
       FROM "ToolRegistryEntry" ORDER BY "id"`,
  );
  return result.rows;
}

/** Everything except the column under test. */
function withoutLabels(row: Row): Omit<Row, 'care_plans'> {
  const { care_plans: _ignored, ...rest } = row;
  return rest;
}

describe('care plan labels migration — a database that already ran the old setup', () => {
  it('leaves all sixteen undecided before it runs, which is the defect it fixes', async () => {
    const db = await oldDatabase();
    const rows = await snapshot(db);
    const sixteen = rows.filter((row) => ORIGINAL_SIXTEEN.some(([id]) => id === row.tool_id));

    expect(sixteen).toHaveLength(16);
    for (const row of sixteen) {
      expect({ tool_id: row.tool_id, care_plans: row.care_plans }).toEqual({
        tool_id: row.tool_id,
        care_plans: [],
      });
    }
    await db.close();
  });

  it('labels the sixteen exactly as the owner listed them', async () => {
    const db = await oldDatabase();
    await db.exec(migrationSql(LABEL_MIGRATION));

    const rows = await snapshot(db);
    for (const [toolId, labels] of ORIGINAL_SIXTEEN) {
      const row = rows.find((candidate) => candidate.tool_id === toolId);
      expect(row, `${toolId} is missing after the migration`).toBeDefined();
      expect({ tool_id: toolId, care_plans: row!.care_plans }).toEqual({ tool_id: toolId, care_plans: labels });
    }
    await db.close();
  });

  it('changes nothing else about them', async () => {
    const db = await oldDatabase();
    const before = await snapshot(db);
    await db.exec(migrationSql(LABEL_MIGRATION));
    const after = await snapshot(db);

    expect(after.map(withoutLabels)).toEqual(before.map(withoutLabels));
    await db.close();
  });

  it('does not touch rows it does not name', async () => {
    const db = await oldDatabase();
    await db.exec(migrationSql(LABEL_MIGRATION));
    const rows = await snapshot(db);

    for (const [toolId, labels] of UNTOUCHED) {
      const row = rows.find((candidate) => candidate.tool_id === toolId);
      expect({ tool_id: toolId, care_plans: row!.care_plans }).toEqual({ tool_id: toolId, care_plans: labels });
    }
    const draft = rows.find((row) => row.tool_id === 'ws_four_all_extras_placeholder');
    expect(draft!.care_plans).toEqual([]);
    expect(draft!.status).toBe('draft');
    await db.close();
  });

  it('is safe to run on a database that already has the labels', async () => {
    // Every fresh database gets these labels from the seed itself. The
    // migration must be a no-op there rather than rewriting rows on purpose.
    const db = await oldDatabase();
    await db.exec(migrationSql(LABEL_MIGRATION));
    const first = await snapshot(db);
    await db.exec(migrationSql(LABEL_MIGRATION));
    const second = await snapshot(db);

    // Guarded on `care_plans = '{}'`, so the second run matches no row.
    expect(second).toEqual(first);
    await db.close();
  });

  it('agrees with the catalogue the app and the portal read', () => {
    for (const [toolId, labels] of ORIGINAL_SIXTEEN) {
      const entry = CATALOGUE.find((row: CatalogueEntry) => row.tool_id === toolId);
      expect(entry, `${toolId} is not in the catalogue`).toBeDefined();
      expect({ tool_id: toolId, care_plans: entry!.care_plans }).toEqual({ tool_id: toolId, care_plans: labels });
    }
  });

  it('writes the same labels the edited seed writes, so both paths agree', () => {
    // A database built from zero gets its labels from the seed migration; an
    // upgraded one gets them here. The two files must not drift.
    const seed = migrationSql('20261109130000_seed_library_worksheets');

    // Split the seed into one chunk per inserted row. Each row starts at a new
    // line with the id and tool_id; the chunk ends where the next one starts.
    const starts = [...seed.matchAll(/\n\s*\('[^']+',\s*'([^']+)',/g)];
    const rowsByToolId = new Map<string, string>();
    starts.forEach((match, index) => {
      const from = match.index ?? 0;
      const to = index + 1 < starts.length ? (starts[index + 1].index ?? seed.length) : seed.length;
      rowsByToolId.set(match[1], seed.slice(from, to));
    });

    for (const [toolId, labels] of ORIGINAL_SIXTEEN) {
      const chunk = rowsByToolId.get(toolId);
      expect(chunk, `${toolId} has no row in the seed migration`).toBeDefined();
      const match = chunk!.match(/ARRAY\[([^\]]*)\]::TEXT\[\]/);
      expect(match, `${toolId} has no care_plans array in the seed migration`).not.toBeNull();
      const seeded = [...match![1].matchAll(/'([^']+)'/g)].map((value) => value[1]);
      expect({ tool_id: toolId, care_plans: seeded }).toEqual({ tool_id: toolId, care_plans: labels });
    }
  });
});
