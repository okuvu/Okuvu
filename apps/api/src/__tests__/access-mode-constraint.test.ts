/**
 * The database's allowed `access_mode` values must include everything the code
 * and the migrations actually use.
 *
 * `schema.prisma` models `access_mode` as a bare `String`, so `prisma db push`
 * (what the api suites build their database with) creates the column with no
 * CHECK at all. A migration that inserts a value the real database forbids then
 * passes every test and dies in `migrate deploy` with
 * `23514 violates check constraint "ToolRegistryEntry_access_mode_check"` —
 * which is exactly how the release once stopped on its sixth folder, against
 * production, after the backup and the merge.
 *
 * Two invariants, both static so they need no database:
 *   1. the last CHECK definition on `access_mode` allows every value in
 *      WORKSHEET_ACCESS_MODES;
 *   2. no migration uses a value before the migration that makes it legal.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKSHEET_ACCESS_MODES } from '@okuvu/shared-types/worksheet';

const ROOT = join(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'packages/prisma/migrations');

const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

function sql(folder: string): string {
  return readFileSync(join(MIGRATIONS, folder, 'migration.sql'), 'utf8');
}

/** Every ADD CONSTRAINT ... access_mode_check with the literals it allows. */
function checks(folder: string): string[][] {
  const out: string[][] = [];
  const re =
    /ADD CONSTRAINT "ToolRegistryEntry_access_mode_check"\s+CHECK \("access_mode" IN \(([^)]*)\)\)/g;
  for (const m of sql(folder).matchAll(re)) {
    out.push([...m[1].matchAll(/'([a-z_]+)'/g)].map((v) => v[1]));
  }
  return out;
}

describe('access_mode CHECK constraint', () => {
  it('allows every value the code defines', () => {
    let allowed: string[] | null = null;
    for (const folder of folders) {
      for (const values of checks(folder)) allowed = values;
    }

    expect(allowed, 'no access_mode CHECK found in any migration').not.toBeNull();
    for (const mode of WORKSHEET_ACCESS_MODES) {
      expect(allowed, `access_mode CHECK does not allow '${mode}'`).toContain(mode);
    }
  });

  it('never uses a value before the migration that makes it legal', () => {
    // The folder that first widens the constraint to include therapist_only.
    const widening = folders.find((f) => (checks(f).at(-1) ?? []).includes('therapist_only'));
    expect(widening, 'no migration widens access_mode to therapist_only').toBeDefined();

    // The first folder that actually WRITES the value as a row value — comment
    // lines and the constraint definition itself do not count as a use.
    const uses = (folder: string): boolean =>
      sql(folder)
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .filter((line) => !line.includes('access_mode'))
        .some((line) => line.includes("'therapist_only'"));

    const firstUse = folders.find(uses);
    expect(firstUse).toBeDefined();

    expect(firstUse! < widening!).toBe(false);

    // And the widening must sit before the first use, not merely exist.
    expect(folders.indexOf(widening!)).toBeLessThan(folders.indexOf(firstUse!));
  });
});
