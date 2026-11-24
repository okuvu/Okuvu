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
  APPROVALS_MIGRATION_PATH,
  DRAFTS_MIGRATION_PATH,
  MIGRATION_PATH,
  REVISED_APPROVALS_MIGRATION_PATH,
  buildApprovalsSql,
  buildDraftsSql,
  buildMigrationSql,
  buildRevisedApprovalsSql,
  draftEntries,
  listableToolIds,
} from '../worksheets/emit-sql';

const ROOT = join(__dirname, '../../..');
const FILE = join(ROOT, MIGRATION_PATH);
const DRAFTS_FILE = join(ROOT, DRAFTS_MIGRATION_PATH);
const APPROVALS_FILE = join(ROOT, APPROVALS_MIGRATION_PATH);
const REVISED_APPROVALS_FILE = join(ROOT, REVISED_APPROVALS_MIGRATION_PATH);

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

  it('lists every approved Library entry and every placeholder', () => {
    // 16 from the 9 Nov approved document + the 10 the owner approved on 24 Nov.
    expect(listableToolIds()).toHaveLength(26);
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

  it('still carries the whole batch, and every row in it is a draft', () => {
    const sql = buildDraftsSql();
    for (const id of [
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
    ]) {
      expect(sql).toContain(`'${id}'`);
    }
    expect(sql).not.toContain("'ws_worry_tree'");
    expect(sql).not.toContain("'placeholder'");
    // Every row is switched off in the SQL itself, not by a column default.
    expect(sql.match(/'draft'/g)?.length).toBe(10);
    // No approval date anywhere: this migration is the drafting, not the approval.
    expect(sql).not.toContain('2026-11-24');
  });

  it('leaves nothing as a draft: both rows sent back were revised and approved', () => {
    // The owner read the revised wording and approved it the same day, so the
    // 24 Nov batch has no draft left. A later batch will add its own.
    expect(draftEntries().map((entry) => entry.tool_id)).toEqual([]);
  });
});

describe('generated approvals migration', () => {
  it('matches the catalogue', () => {
    const sql = buildApprovalsSql();
    if (wrote(APPROVALS_FILE, sql)) return;

    expect(existsSync(APPROVALS_FILE)).toBe(true);
    expect(readFileSync(APPROVALS_FILE, 'utf8')).toBe(sql);
  });

  it('approves the eight, with the owner’s date and not the 9 Nov one', () => {
    const sql = buildApprovalsSql();
    expect(sql.match(/'approved'/g)?.length).toBe(8);
    expect(sql.match(/'2026-11-24'::timestamp/g)?.length).toBe(8);
    expect(sql).not.toContain('2026-11-09');
  });

  it('never promotes the two the owner did not approve', () => {
    const sql = buildApprovalsSql();
    expect(sql).not.toContain("'ws_unsent_letter'");
    expect(sql).not.toContain("'ws_pros_cons_change'");
  });

  it('cannot leave a row approved with no body: the copy travels with the status', () => {
    const sql = buildApprovalsSql();
    // Each approved row carries its content_en in the same statement.
    expect(sql.match(/"content_en" = EXCLUDED."content_en"/g)?.length).toBe(1);
    expect(sql).toContain('$ws_ws_weekly_load_check$');
  });
});

describe('generated revised-approvals migration', () => {
  it('matches the catalogue', () => {
    const sql = buildRevisedApprovalsSql();
    if (wrote(REVISED_APPROVALS_FILE, sql)) return;

    expect(existsSync(REVISED_APPROVALS_FILE)).toBe(true);
    expect(readFileSync(REVISED_APPROVALS_FILE, 'utf8')).toBe(sql);
  });

  it('approves exactly the two revised rows, with the owner’s date', () => {
    const sql = buildRevisedApprovalsSql();
    expect(sql).toContain("'ws_unsent_letter'");
    expect(sql).toContain("'ws_pros_cons_change'");
    expect(sql.match(/'approved'/g)?.length).toBe(2);
    expect(sql.match(/'2026-11-24'::timestamp/g)?.length).toBe(2);
    // The revised text, not the pre-revision wording.
    expect(sql).toContain('OKUVU will check in with you and may let your therapist know');
    expect(sql).toContain('Readiness can change from day to day');
    expect(sql).not.toContain('2026-11-09');
  });

  it('carries the revised body with the promotion', () => {
    const sql = buildRevisedApprovalsSql();
    expect(sql.match(/"content_en" = EXCLUDED."content_en"/g)?.length).toBe(1);
    expect(sql).toContain('$ws_ws_unsent_letter$');
    expect(sql).toContain('$ws_ws_pros_cons_change$');
  });
});
