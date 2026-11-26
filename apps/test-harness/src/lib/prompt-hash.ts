import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

import { PROMPT_GATE, isEligibleAsDefault } from '@okuvu/api/src/prompts/gate';

/**
 * Hash a prompt file's contents with SHA-256, returned as a hex digest.
 * Pure/sync so it can be called from a tRPC procedure or a unit test alike.
 */
export function hashPromptFile(absolutePath: string): string {
  const content = readFileSync(absolutePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Resolve the monorepo root from this app's runtime working directory.
 *
 * Next.js (dev server, `next build`, and the production `next start`) always
 * launches with `process.cwd()` set to the app directory that was started
 * (i.e. `apps/test-harness`), not the pnpm workspace root — this holds for
 * both the App Router server components/route handlers and any Node.js
 * script invoked via `pnpm --filter`. This repo's `apps/test-harness` is a
 * fixed two-levels-deep workspace member (`<root>/apps/test-harness`), so
 * walking up two directories from `process.cwd()` is a reliable, dependency
 * -free way to reach the repo root at runtime, mirroring what the story spec
 * suggests. We don't use `import.meta.url`/`__dirname` here because Next's
 * bundler rewrites server files into `.next/server/...`, which would make a
 * path relative to the compiled file location unstable across build vs dev.
 *
 * If this ever needs to be more robust (e.g. running test-harness from a
 * different working directory), set MONOREPO_ROOT explicitly and this will
 * prefer it.
 */
export function getMonorepoRoot(): string {
  if (process.env.MONOREPO_ROOT && process.env.MONOREPO_ROOT.trim() !== '') {
    return process.env.MONOREPO_ROOT;
  }
  return path.join(process.cwd(), '..', '..');
}

export interface PromptManifestEntry {
  /** Logical agent identifier this prompt belongs to (e.g. 'A2'). */
  agentId: string;
  /** Short version label parsed from the filename (e.g. 'v1.0'). */
  version: string;
  /** Absolute path to the prompt file, resolved from the monorepo root. */
  path: string;
}

/**
 * The known, committed prompt files this registry hashes today.
 *
 * agent_id mapping (documented per story spec — no external prompt file
 * exists yet for A1/A8/A9/A9-post, whose prompts are inline TS, so they
 * are intentionally out of scope for this manifest; A12 was retired
 * entirely in OKUVU v2.0 — dead code, never wired in; the onboarding-flow
 * variant prompt (a2-onboarding-v1.0.txt) was retired alongside the
 * onboarding-scoring machinery it served — see
 * okuvu-remaining-changes.md §B.1):
 *   - a2-okuvu-v<current>.txt -> 'A2'   (A2's main OKUVU conversation prompt;
 *      resolved from apps/api/src/prompts/index.ts, not written here)
 *   - memory-extraction-v2.0.txt -> 'A15' (memory extraction agent, worker-side)
 */

/**
 * Resolve A2's prompt file from the api's own gate.
 *
 * The filename used to be hardcoded here as `a2-okuvu-v2.1.txt`, which drifted
 * to six versions behind the pipeline: a TestRun then recorded a `promptHash`
 * of a prompt no model had been sent, so the provenance stamp proved nothing.
 *
 * It then parsed the pair out of `apps/api/src/prompts/index.ts` with a regex —
 * `A2_PROMPT_VERSION = '<literal>'` and a literal `.txt` filename. That worked
 * until the strict gate made the default a decision: `index.ts` now exports
 * `A2_PROMPT_VERSION = defaultPromptVersion()` and builds the filename from it,
 * so there is no literal left to match and every harness run failed to resolve
 * the prompt at all (five tests, while every product suite stayed green).
 *
 * There is no literal to parse and no need for one: `src/prompts/gate.ts`
 * already owns "which version is the default", and `index.ts` reads the answer
 * from it. Importing that module (it is pure data — no filesystem access, so it
 * costs nothing at runtime and brings none of the Vercel packaging problem the
 * shim exists for) means the harness cannot disagree with the api about which
 * prompt is live. If nothing is eligible the gate throws its own error, which is
 * the right failure: a build with no default prompt has nothing to hash.
 */
export function resolveA2PromptEntry(root: string): PromptManifestEntry {
  const eligible = PROMPT_GATE.filter(isEligibleAsDefault);
  if (eligible.length === 0) {
    throw new Error('prompt-hash: no A2 prompt is eligible to be the default — see apps/api/src/prompts/gate.ts');
  }

  // Promotion order is append order, and the newest eligible entry wins — the
  // same rule `defaultPromptVersion()` applies.
  const version = eligible[eligible.length - 1].version;
  const file = `a2-okuvu-${version}.txt`;
  const promptPath = path.join(root, 'apps', 'api', 'src', 'prompts', file);

  if (!existsSync(promptPath)) {
    throw new Error(`prompt-hash: the default A2 prompt is ${version} but ${file} does not exist.`);
  }

  return { agentId: 'A2', version, path: promptPath };
}

export function getPromptManifest(): PromptManifestEntry[] {
  const root = getMonorepoRoot();
  return [
    resolveA2PromptEntry(root),
    {
      agentId: 'A15',
      version: 'v2.0',
      path: path.join(root, 'apps', 'worker', 'src', 'prompts', 'memory-extraction-v2.0.txt'),
    },
  ];
}

/**
 * Combine the per-file hashes of the whole prompt manifest into one
 * manifest-level hash, for callers (like `getFrozenTripleMetadata`) that
 * need a single `promptHash` value representing "current state of all
 * tracked prompts" rather than any one file. Sorted by path first so the
 * result is stable regardless of manifest array ordering.
 */
export function hashPromptManifest(manifest: PromptManifestEntry[]): string {
  const sorted = [...manifest].sort((a, b) => a.path.localeCompare(b.path));
  const combined = sorted.map((entry) => `${entry.path}:${hashPromptFile(entry.path)}`).join('\n');
  return createHash('sha256').update(combined).digest('hex');
}
