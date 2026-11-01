/**
 * E17-S4 — worker copy of `apps/api/src/lib/llm-failure.ts`.
 *
 * `apps/api` and `apps/worker` are separate deployables that share only
 * `packages/prisma` and `packages/shared-types` (the same reason the whole
 * `llm-types` contract is duplicated), so this cannot be a cross-app import.
 * The two tables must stay identical: a failure the api calls throttled and the
 * worker calls unavailable would make the runbooks disagree about the same
 * incident.
 */

export type LlmFailureKind = 'timeout' | 'throttled' | 'unavailable';

const THROTTLE_NAMES: ReadonlySet<string> = new Set([
  'ThrottlingException',
  'Throttling',
  'TooManyRequestsException',
  'ServiceQuotaExceededException',
  'LimitExceededException',
  'ModelNotReadyException',
]);

export function classifyLlmFailure(err: unknown, timedOut = false): LlmFailureKind {
  if (timedOut) return 'timeout';
  if (typeof err !== 'object' || err === null) return 'unavailable';

  const candidate = err as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
    statusCode?: number;
  };

  for (const name of [candidate.name, candidate.code]) {
    if (typeof name === 'string' && THROTTLE_NAMES.has(name)) return 'throttled';
  }

  const status = candidate.$metadata?.httpStatusCode ?? candidate.statusCode;
  if (status === 429 || status === 503) return 'throttled';

  return 'unavailable';
}
