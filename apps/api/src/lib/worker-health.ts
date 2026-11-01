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

/**
 * How long startup may wait for a worker that is *mid-rollout*.
 *
 * A pipeline that rolls the worker and the API from the same build makes the
 * worker briefly absent: ECS drains the old worker task before the new one is
 * listening, so an API task that probes once dies with `fetch failed` and the
 * deployment replaces it (seen 2026-11-01, exit 1 four seconds after start).
 * The assertion still fails closed — it just gives a sibling rollout, which is
 * measured in tens of seconds, a bounded window instead of one 5s probe.
 */
const WAIT_MS = Number(process.env.WORKER_HEALTH_WAIT_MS ?? 60_000);
const POLL_MS = Number(process.env.WORKER_HEALTH_POLL_MS ?? 3_000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WorkerHealthResult {
  reachable: boolean;
  /** DB sub-check reported by the worker's /health (apps/worker/src/routes/health.ts). */
  db: 'ok' | 'unreachable' | 'unknown';
  error?: string;
}

/**
 * The worker base URL used by the health probe. `WORKER_URL` is the only
 * name — the retired queue vendor's variable is not accepted as an alias,
 * because a stale value there would silently point the probe at a host that
 * no longer exists.
 */
export function getWorkerUrl(): string | null {
  return process.env.WORKER_URL ?? null;
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

/** Caller-supplied bounds, so tests never wait on a real clock. */
export interface WorkerWaitOptions {
  /** Total time to keep probing before failing startup. 0 = single probe. */
  waitMs?: number;
  /** Delay between probes. */
  pollMs?: number;
}

/**
 * Startup assertion — throws (kills boot) when the worker cannot be reached.
 * Called from apps/api/src/server.ts. Deliberately a hard failure, not a
 * warning: an API that serves chat turns without summary/memory writes every
 * session into a continuity hole and tells nobody. A config error surfaced at
 * boot is recoverable in seconds; silently shipping the A1 bug for another
 * month is not.
 *
 * The probe is retried for a bounded window (`WORKER_HEALTH_WAIT_MS`, default
 * 60s) because the sibling worker is legitimately unreachable for part of its
 * own rollout. Exhausting the window is still fatal, and the error names every
 * attempt so a real outage is not mistaken for slowness.
 */
export async function assertWorkerReachable(
  log?: LoggerLike,
  opts: WorkerWaitOptions = {},
): Promise<void> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error(
      'FATAL: WORKER_URL is not configured — the summary/memory worker is unreachable, so session summaries and memory extraction can never run (A1). Set WORKER_URL to the apps/worker base URL.',
    );
  }

  const waitMs = opts.waitMs ?? WAIT_MS;
  const pollMs = opts.pollMs ?? POLL_MS;
  const deadline = Date.now() + waitMs;

  let attempts = 0;
  let lastError: string | undefined;
  let health = await checkWorkerHealth(workerUrl);
  attempts = 1;

  while (!health.reachable) {
    lastError = health.error;
    const nextProbeAt = Date.now() + pollMs;
    if (nextProbeAt > deadline) break;

    if (log) {
      log.warn(
        {
          event: 'worker_health_retry',
          worker_url: workerUrl,
          attempt: attempts,
          error: health.error,
        },
        'Worker is not reachable yet (it may be mid-rollout) — retrying before failing startup',
      );
    }

    await sleep(pollMs);
    health = await checkWorkerHealth(workerUrl);
    attempts += 1;
  }

  if (!health.reachable) {
    throw new Error(
      `FATAL: worker is not reachable at ${workerUrl}/health after ${attempts} attempt(s) over ${waitMs}ms — ${lastError ?? 'unknown error'}. Session summary/memory (A13/A15) cannot run without it (A1). Fix the worker deployment or WORKER_URL before starting the API.`,
    );
  }

  if (attempts > 1 && log) {
    log.info(
      { event: 'worker_health', worker_url: workerUrl, attempts },
      'Worker became reachable during the startup window — assertion passed',
    );
  }

  if (health.db === 'unreachable' && log) {
    log.warn(
      { event: 'worker_health', worker_url: workerUrl },
      'Worker process is up but its database check failed — summary generation will fail until its DB is reachable',
    );
  } else if (log && attempts === 1) {
    log.info({ event: 'worker_health', worker_url: workerUrl }, 'Worker health assertion passed');
  }
}
