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
 * The A2 version actually live, read from the one place that declares it —
 * `apps/api/src/prompts/index.ts`'s `A2_PROMPT_VERSION`.
 *
 * This manifest used to name `a2-okuvu-v2.1.txt` by hand and never moved
 * again, so the harness's "Frozen Triple" reported a v2.1 hash while the api
 * had been serving v2.4 for weeks — the exact drift a frozen triple exists to
 * detect, printed by the detector's own inscription. Reading the constant
 * (rather than importing the module, which does `readFileSync` on the prompt
 * and is aliased to a shim in this app's webpack build) keeps one source of
 * truth; the fallback only fires when the file is unreadable, and an
 * unreadable source file is already a broken deployment.
 */
const A2_VERSION_FALLBACK = 'v2.6';

function readA2PromptVersion(root: string): string {
  try {
    const source = readFileSync(
      path.join(root, 'apps', 'api', 'src', 'prompts', 'index.ts'),
      'utf-8',
    );
    const match = source.match(/A2_PROMPT_VERSION\s*=\s*'([^']+)'/);
    return match ? match[1] : A2_VERSION_FALLBACK;
  } catch {
    return A2_VERSION_FALLBACK;
  }
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
 *   - a2-okuvu-v{live}.txt   -> 'A2'  (A2's main OKUVU conversation prompt,
 *      version taken from apps/api/src/prompts/index.ts — see
 *      readA2PromptVersion above for why it is not a literal here)
 *   - memory-extraction-v2.0.txt -> 'A15' (memory extraction agent, worker-side)
 */
export function getPromptManifest(): PromptManifestEntry[] {
  const root = getMonorepoRoot();
  const a2Version = readA2PromptVersion(root);
  return [
    {
      agentId: 'A2',
      version: a2Version,
      path: path.join(root, 'apps', 'api', 'src', 'prompts', `a2-okuvu-${a2Version}.txt`),
    },
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
