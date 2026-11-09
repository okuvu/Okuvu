/**
 * The committed migration must be exactly what the catalogue generates.
 *
 * Two copies of sixteen worksheets is how the portal ends up previewing a
 * sentence the client never sees. This test makes the SQL a build artifact:
 * regenerate (WRITE_WORKSHEET_SQL=1) or the build fails.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATION_PATH, buildMigrationSql, listableToolIds } from '../worksheets/emit-sql';

const ROOT = join(__dirname, '../../..');
const FILE = join(ROOT, MIGRATION_PATH);

describe('generated migration', () => {
  it('matches the catalogue', () => {
    const sql = buildMigrationSql();

    if (process.env.WRITE_WORKSHEET_SQL === '1') {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, sql, 'utf8');
      return;
    }

    expect(existsSync(FILE)).toBe(true);
    expect(readFileSync(FILE, 'utf8')).toBe(sql);
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
