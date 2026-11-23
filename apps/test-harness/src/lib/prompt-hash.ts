import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

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
 * Resolve A2's prompt file from the api's own constants.
 *
 * The filename used to be hardcoded here as `a2-okuvu-v2.1.txt`, which drifted
 * to six versions behind the pipeline: a TestRun then recorded a `promptHash`
 * of a prompt no model had been sent, so the provenance stamp proved nothing.
 * `apps/api/src/prompts/index.ts` is the single source of truth (the same file
 * `scripts/generate-prompt-shim.mjs` builds the harness copy from). If its
 * shape changes, fail loudly rather than hash a guess.
 */
export function resolveA2PromptEntry(root: string): PromptManifestEntry {
  const indexPath = path.join(root, 'apps', 'api', 'src', 'prompts', 'index.ts');
  let indexSrc: string;
  try {
    indexSrc = readFileSync(indexPath, 'utf-8');
  } catch {
    throw new Error(`prompt-hash: cannot read ${indexPath} — the A2 prompt manifest cannot be built.`);
  }

  const version = indexSrc.match(/A2_PROMPT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const file = indexSrc.match(/join\(__dirname,\s*['"]([^'"]+\.txt)['"]\)/)?.[1];
  if (!version || !file) {
    throw new Error(
      'prompt-hash: apps/api/src/prompts/index.ts no longer exposes A2_PROMPT_VERSION and a prompt .txt path.',
    );
  }

  const fileVersion = file.match(/a2-okuvu-(v[\d.]+)\.txt/)?.[1];
  if (fileVersion && fileVersion !== version) {
    throw new Error(`prompt-hash: A2_PROMPT_VERSION=${version} but the prompt file is ${file}.`);
  }

  return { agentId: 'A2', version, path: path.join(root, 'apps', 'api', 'src', 'prompts', file) };
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
