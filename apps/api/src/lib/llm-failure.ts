/**
 * E17-S4 — why a model call failed, in the only three shapes that change what
 * the pipeline does next.
 *
 * E17-S1 and E17-S2 both logged the same gap from opposite ends: every
 * technical failure degraded to one generic supportive sentence, so
 * "Bedrock is throttling us" and "the model id does not exist" were
 * indistinguishable in the user's reply and in the logs. A quota problem is
 * transient and recoverable in seconds; a missing model is an incident. They
 * still must fail closed identically — the user must never see a difference in
 * *safety* — but the failure has to be nameable.
 *
 * Classification is deliberately by AWS error identity first and status code
 * second, because Bedrock returns throttling as a modelled exception with its
 * own `__type`, not only as HTTP 429.
 */

export type LlmFailureKind = 'timeout' | 'throttled' | 'unavailable';

/** Bedrock/Bedrock-runtime exception names that mean "retry later, we are rate limiting you". */
const THROTTLE_NAMES: ReadonlySet<string> = new Set([
  'ThrottlingException',
  'Throttling',
  'TooManyRequestsException',
  'ServiceQuotaExceededException',
  'LimitExceededException',
  'ModelNotReadyException',
]);

/** Statuses the service uses for overload / rate limiting. */
const THROTTLE_STATUSES: ReadonlySet<number> = new Set([429, 503]);

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
  if (typeof status === 'number' && THROTTLE_STATUSES.has(status)) return 'throttled';

  return 'unavailable';
}
