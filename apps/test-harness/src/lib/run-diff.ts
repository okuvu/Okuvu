import type { FrozenTripleMetadata } from '@evia/shared-types';

/**
 * TH-S25 — pure diff helper for the results/trace viewer's compare view.
 *
 * No diff library exists in this workspace (checked apps/test-harness and
 * apps/therapist-portal package.json — neither has `deep-diff`,
 * `fast-json-patch`, or similar), and the required comparisons are small and
 * shallow enough that hand-rolling is simpler than adding a new dependency
 * for this scope.
 */

const FROZEN_TRIPLE_FIELDS: (keyof FrozenTripleMetadata)[] = [
  'modelVersion',
  'promptHash',
  'temperature',
  'safetySettings',
  'suiteVersion',
  'inputId',
  'timestamp',
  'rawOutput',
];

/** Minimal shape this module needs from a TestRun row — kept structural so
 * callers can pass either a real Prisma `TestRun` or a plain test fixture. */
export interface DiffableRun {
  frozen_triple: unknown;
  results: unknown;
}

export interface OutputDiffEntry {
  path: string;
  a: unknown;
  b: unknown;
}

export interface RunDiff {
  frozenTripleDiff: Record<string, { a: unknown; b: unknown }>;
  outputDiff: OutputDiffEntry[];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Recursive structural diff. For each key present in either side of a
 * plain-object pair, recurse; anything else (primitives, arrays, mismatched
 * types, or a value only present on one side) is compared via
 * `JSON.stringify` and — if different — recorded as one itemized entry.
 * This is intentionally an itemized list of differences, not a full
 * patch/merge algorithm.
 */
function diffValues(a: unknown, b: unknown, path: string, out: OutputDiffEntry[]): void {
  if (a === b) return;

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      diffValues(a[key], b[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }

  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path: path || '(root)', a, b });
  }
}

export function diffRuns(a: DiffableRun, b: DiffableRun): RunDiff {
  const tripleA = asRecord(a.frozen_triple);
  const tripleB = asRecord(b.frozen_triple);

  const frozenTripleDiff: Record<string, { a: unknown; b: unknown }> = {};
  for (const field of FROZEN_TRIPLE_FIELDS) {
    const va = tripleA[field];
    const vb = tripleB[field];
    if (JSON.stringify(va) !== JSON.stringify(vb)) {
      frozenTripleDiff[field] = { a: va, b: vb };
    }
  }

  const outputDiff: OutputDiffEntry[] = [];
  diffValues(a.results, b.results, '', outputDiff);

  return { frozenTripleDiff, outputDiff };
}
