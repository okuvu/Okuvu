/**
 * A1 (OKUVU — Plumbing Fixes & Rationale v1.0) — harness-side counterpart of
 * apps/api/src/lib/worker-health.ts. The harness reads WORKER_URL through its
 * own zod env (lib/env.ts, optional) and, unlike the API, must not crash the
 * whole app when the worker is down — instead, callers use
 * `assertWorkerHealthOrIncomplete()` to mark the affected run 'incomplete'
 * (B1: a run whose A13/A15 stage no-ops is excluded, never scored clean).
 */

import { getEnv } from './env';

const PROBE_TIMEOUT_MS = 5000;

export interface WorkerHealthResult {
  reachable: boolean;
  /** DB sub-check reported by the worker's /health (apps/worker/src/routes/health.ts). */
  db: 'ok' | 'unreachable' | 'unknown';
  error?: string;
}

export function getWorkerUrl(): string | null {
  return getEnv().WORKER_URL ?? null;
}

export async function checkWorkerHealth(workerUrl: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<WorkerHealthResult> {
  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { reachable: false, db: 'unknown', error: `worker /health responded HTTP ${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { db?: string };
    return {
      reachable: true,
      db: json.db === 'unreachable' ? 'unreachable' : 'ok',
    };
  } catch (err) {
    return {
      reachable: false,
      db: 'unknown',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type WorkerHealthVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Non-throwing assertion for run-creating routers: resolves WORKER_URL,
 * probes /health, and returns an `ok:false` verdict with a reviewable reason
 * when the summary/memory stage cannot possibly have run. Routers fold this
 * into `status: 'incomplete'` (B1) instead of crashing the request.
 */
export async function assertWorkerHealthOrIncomplete(): Promise<WorkerHealthVerdict> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    return {
      ok: false,
      reason:
        'WORKER_URL is not configured — the A13/A15 summary/memory stage cannot run (A1). This run is marked incomplete, not clean.',
    };
  }

  const health = await checkWorkerHealth(workerUrl);
  if (!health.reachable) {
    return {
      ok: false,
      reason: `Worker unreachable at ${workerUrl}/health — ${health.error ?? 'unknown error'} (A1). This run is marked incomplete, not clean.`,
    };
  }
  if (health.db === 'unreachable') {
    console.warn(
      { worker_url: workerUrl },
      '[A1] Worker is up but its database check failed — summary generation will fail',
    );
  }
  return { ok: true };
}

/** The surfaced error string agent-adapter's worker call returns when WORKER_URL is unset. */
export const WORKER_UNCONFIGURED_ERROR = 'WORKER_URL is not configured — cannot reach apps/worker from this environment.';
