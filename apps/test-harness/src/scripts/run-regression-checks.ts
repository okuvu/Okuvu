// TH-S27 — standalone CI regression-check script.
//
// Runs the DB-free A8 router state-space regression check (the same
// enumerateA8Cells() used by determinism.ts's enumerateA8StateSpace
// procedure) directly against the real production routeTurn, with no
// Next.js/tRPC/HTTP server involved — appropriate for a CI job step
// (.github/workflows/regression.yml) that just needs a pass/fail exit code.
//
// Scope note (v1, per the TH-S27 story spec): this script intentionally
// does NOT run validateSilencePath's regression check. That check calls
// processTurn, which needs a live Prisma-backed synthetic session (a real
// DATABASE_URL and DB state) — running it reliably in CI hasn't been
// verified as part of this story, so it's scoped out for now. A fuller
// regression suite (silence-path, canned-mode sampling) is a natural
// follow-up once this DB-free check has proven stable in CI.
//
// Invocation: `npx tsx src/scripts/run-regression-checks.ts` from
// apps/test-harness/, or via the "Run regression checks" step in
// .github/workflows/regression.yml.

import { enumerateA8Cells } from '../lib/a8-state-space';

function main(): void {
  console.log('[regression] Running A8 router state-space check (15 cells)...');

  const cells = enumerateA8Cells();
  const failures = cells.filter((cell) => !cell.pass);

  for (const cell of cells) {
    const marker = cell.pass ? 'PASS' : 'FAIL';
    console.log(
      `[regression]   ${marker}  safety=${cell.safety_state} governance=${cell.governance_state}`,
    );
  }

  if (cells.length !== 15) {
    console.error(
      `[regression] HALT: expected exactly 15 cells (5 safety states x 3 governance states), got ${cells.length}.`,
    );
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error(
      `[regression] HALT: ${failures.length}/${cells.length} A8 router cells diverged from the expected decision table.`,
    );
    for (const failure of failures) {
      console.error(
        `[regression]   safety=${failure.safety_state} governance=${failure.governance_state} expected=${JSON.stringify(
          failure.expected,
        )} actual=${JSON.stringify(failure.actual)}`,
      );
    }
    process.exit(1);
  }

  console.log('[regression] PASS: all 15 A8 router cells match the expected decision table.');
  process.exit(0);
}

main();
