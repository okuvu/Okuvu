/**
 * A1 (OKUVU — Plumbing Fixes & Rationale v1.0): the summary/memory worker was
 * silently unreachable in every environment — "WORKER_URL is not configured",
 * processed:false, nothing noticed, and A2 had no continuity to read. This
 * module is the loud counterpart: resolve the worker URL, check its /health,
 * and FAIL STARTUP if it's not reachable. Without summary/memory, continuity
 * is structurally impossible — not merely degraded — so a deployment that
 * can't reach the worker must not come up quietly.
 */

const ASSERT_TIMEOUT_MS = 5000;

export interface WorkerHealthResult {
  reachable: boolean;
  /** DB sub-check reported by the worker's /health (apps/worker/src/routes/health.ts). */
  db: 'ok' | 'unreachable' | 'unknown';
  error?: string;
}

/**
 * The worker base URL. `CLOUD_TASKS_WORKER_URL` is accepted as an alias so an
 * environment that already configured the Cloud Tasks enqueue path (which
 * points at the same service) doesn't need a second variable — same service,
 * same base URL.
 */
export function getWorkerUrl(): string | null {
  return process.env.WORKER_URL ?? process.env.CLOUD_TASKS_WORKER_URL ?? null;
}

/** One health probe with a hard timeout — never hangs startup. */
export async function checkWorkerHealth(workerUrl: string, timeoutMs = ASSERT_TIMEOUT_MS): Promise<WorkerHealthResult> {
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

/** Minimal logger shape so this module doesn't need the Fastify types. */
interface LoggerLike {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Startup assertion — throws (kills boot) when the worker cannot be reached.
 * Called from apps/api/src/server.ts. Deliberately a hard failure, not a
 * warning: an API that serves chat turns without summary/memory writes every
 * session into a continuity hole and tells nobody. A config error surfaced at
 * boot is recoverable in seconds; silently shipping the A1 bug for another
 * month is not.
 */
export async function assertWorkerReachable(log?: LoggerLike): Promise<void> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error(
      'FATAL: WORKER_URL is not configured — the summary/memory worker is unreachable, so session summaries and memory extraction can never run (A1). Set WORKER_URL to the apps/worker base URL.',
    );
  }

  const health = await checkWorkerHealth(workerUrl);
  if (!health.reachable) {
    throw new Error(
      `FATAL: worker is not reachable at ${workerUrl}/health — ${health.error ?? 'unknown error'}. Session summary/memory (A13/A15) cannot run without it (A1). Fix the worker deployment or WORKER_URL before starting the API.`,
    );
  }

  if (health.db === 'unreachable' && log) {
    log.warn(
      { event: 'worker_health', worker_url: workerUrl },
      'Worker process is up but its database check failed — summary generation will fail until its DB is reachable',
    );
  } else if (log) {
    log.info({ event: 'worker_health', worker_url: workerUrl }, 'Worker health assertion passed');
  }
}
