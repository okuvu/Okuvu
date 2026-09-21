/**
 * B2 (OKUVU — Plumbing Fixes & Rationale v1.0): run identity header.
 *
 * "A result is only valid for the exact (build, model, prompt) it was
 * produced with. Without pinning, multi-day and multi-run data are not
 * comparable." Every run-creating router stamps its TestRun with:
 *
 *   - build_sha:      the git SHA this harness is running (host-provided env,
 *                     falling back to null — never a fabricated value)
 *   - corpus_version: for corpus-driven runs, the corpus lineages' max
 *                     `version` (see corpusVersionStamp); null elsewhere
 *   - run_mode:       what kind of run this was ('full_pipeline' | 'persona_script'
 *                     | 'simulator' | 'corpus_case' | 'stochastic' | 'fault_injection')
 *
 * Per-agent model/prompt provenance is recorded separately on each trace
 * entry (`model_version`/`prompt_version`/`canned`, read from the A2 result's
 * own attribution fields) and on assistant Turn rows in apps/api.
 */

import { execSync } from 'node:child_process';

export type RunMode =
  | 'full_pipeline'
  | 'persona_script'
  | 'simulator'
  | 'corpus_case'
  | 'stochastic'
  | 'fault_injection';

/**
 * Resolve the deployed build SHA. Read from environment variables that
 * deployment platforms set (VERCEL_GIT_COMMIT_SHA, and the generic
 * GIT_COMMIT_SHA as a manual override) so we never guess. When neither is
 * set — e.g. local dev — returns null; a null build_sha is honest, a wrong
 * one is worse than useless for pinning.
 */
export function getBuildSha(): string | null {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    null;
  return sha && sha.trim() !== '' ? sha.trim() : null;
}

/**
 * Best-effort git SHA for LOCAL runs only: shells out to `git rev-parse
 * HEAD` in the monorepo. Never used when a deployment-provided env var is
 * present (see getBuildSha), because on a deployed host the working tree is
 * not the source of truth for what's running. Returns null on any failure.
 */
export function getLocalBuildSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: process.cwd(),
      timeout: 3000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * The build SHA to stamp on a run: the deployment env var when present,
 * otherwise the local git HEAD, otherwise null.
 */
export function resolveBuildSha(): string | null {
  return getBuildSha() ?? getLocalBuildSha();
}

/** CorpusCase-shaped input for corpusVersionStamp. */
interface CorpusVersionLike {
  version: number;
}

/**
 * Corpus version stamp: the max `version` across the corpus cases a run was
 * drawn from. Cheap, deterministic, and comparable across runs — when the
 * corpus bumps, the stamp bumps. `null`/empty input (non-corpus runs)
 * returns null.
 */
export function corpusVersionStamp(cases: CorpusVersionLike[] | null | undefined): string | null {
  if (!cases || cases.length === 0) return null;
  return `v${Math.max(...cases.map((c) => c.version))}`;
}

export interface RunHeader {
  build_sha: string | null;
  corpus_version: string | null;
  run_mode: string;
}

/**
 * The identity header to spread into a TestRun's create data. Spread order
 * matters: place it BEFORE any field the caller overrides explicitly.
 */
export function buildRunHeader(runMode: RunMode, corpusCases?: CorpusVersionLike[] | null): RunHeader {
  return {
    build_sha: resolveBuildSha(),
    corpus_version: corpusVersionStamp(corpusCases ?? null),
    run_mode: runMode,
  };
}
