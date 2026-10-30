import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Kept in sync with the filename by hand — there is no other source of truth
 * for this version string (see prompt-hash.ts's manifest, which duplicates it
 * the same way).
 *
 * v2.0 → v2.1 (OKUVU — Plumbing Fixes & Rationale v1.0, fix A2): §3.1 added —
 * continuity is the default; short affirmations never trigger a
 * new-session/onboarding branch. The doc also fixes the underlying WIRING:
 * the orchestrator now passes the current session's own turns into
 * `recentHistory` (see orchestrator.ts), which this version pairs with.
 */
export const A2_PROMPT_VERSION = 'v2.2';

export const A2_PROMPT = readFileSync(
  join(__dirname, 'a2-okuvu-v2.2.txt'),
  'utf-8',
);
