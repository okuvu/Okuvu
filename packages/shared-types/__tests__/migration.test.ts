/**
 * The committed migrations must be exactly what the catalogue generates.
 *
 * Two copies of a worksheet is how the portal ends up previewing a sentence the
 * client never sees. This test makes the SQL a build artifact: regenerate
 * (WRITE_WORKSHEET_SQL=1) or the build fails.
 *
 * Two files are checked: the applied seed (approved rows + placeholders, no
 * drafts) and the drafts seed for the batch of 24 Nov 2026.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DRAFTS_MIGRATION_PATH,
  MIGRATION_PATH,
  buildDraftsSql,
  buildMigrationSql,
  draftEntries,
  listableToolIds,
} from '../worksheets/emit-sql';

const ROOT = join(__dirname, '../../..');
const FILE = join(ROOT, MIGRATION_PATH);
const DRAFTS_FILE = join(ROOT, DRAFTS_MIGRATION_PATH);

function wrote(path: string, sql: string): boolean {
  if (process.env.WRITE_WORKSHEET_SQL !== '1') return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, sql, 'utf8');
  return true;
}

describe('generated migration', () => {
  it('matches the catalogue', () => {
    const sql = buildMigrationSql();
    if (wrote(FILE, sql)) return;

    expect(existsSync(FILE)).toBe(true);
    expect(readFileSync(FILE, 'utf8')).toBe(sql);
  });

  it('keeps new draft ids out of the applied seed', () => {
    // Four of the ten reuse a placeholder id the applied seed already created;
    // that migration is left byte-identical and the drafts migration upgrades the
    // row in place. The six genuinely new ids must not appear there.
    const sql = buildMigrationSql();
    for (const id of [
      'ws_whats_on_my_plate',
      'ws_basics_check',
      'ws_rest_break',
      'ws_priority_sorter',
      'ws_weekly_load_check',
      'ws_caring_load_check',
    ]) {
      expect(sql).not.toContain(`'${id}'`);
    }
    // ...and the four reused ones are still placeholders in that file.
    expect(sql).toContain(
      "('c1b2a3d4-0000-4e00-9000-000000000016', 'ws_boundary_planner', 'Boundary planner'",
    );
    expect(sql).toContain("'placeholder'");
  });

  it('lists sixteen approved Library entries and every placeholder', () => {
    expect(listableToolIds()).toHaveLength(16);
    const sql = buildMigrationSql();
    expect(sql).toContain("'ws_safety_plan'");
    expect(sql).toContain("'ws_energy_audit'");
    // Hidden placeholders are in the database, never in a list query.
    expect(sql).toContain("'placeholder'");
    expect(sql).toContain("'guided_breathing'");
  });
});

describe('generated drafts migration', () => {
  it('matches the catalogue', () => {
    const sql = buildDraftsSql();
    if (wrote(DRAFTS_FILE, sql)) return;

    expect(existsSync(DRAFTS_FILE)).toBe(true);
    expect(readFileSync(DRAFTS_FILE, 'utf8')).toBe(sql);
  });

  it('carries every draft and nothing else', () => {
    const sql = buildDraftsSql();
    expect(draftEntries()).toHaveLength(10);
    for (const entry of draftEntries()) {
      expect(sql).toContain(`'${entry.tool_id}'`);
    }
    expect(sql).not.toContain("'ws_worry_tree'");
    expect(sql).not.toContain("'placeholder'");
    // Every row is switched off in the SQL itself, not by a column default.
    expect(sql.match(/'draft'/g)?.length).toBe(10);
  });
});
