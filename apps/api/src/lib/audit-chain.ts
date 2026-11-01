import { createHash } from 'node:crypto';

/**
 * E17-S4 — append-only, hash-chained audit log.
 *
 * Port of `reference/python-core/okuvu/audit.py` (the demoted Python core's
 * E12 audit log, `docs/AGENT-CODE-STANDARD.md` §10 item 1). The construction is
 * deliberately byte-identical, so a chain written by either implementation
 * verifies under the other:
 *
 *     hash = sha256( prev_hash + canonical_json({ seq, actor, action,
 *                                                object, detail, at, prev_hash }) )
 *
 * `canonical_json` matches Python's
 * `json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)`:
 * keys sorted at every level, no insignificant whitespace, non-ASCII kept
 * literal.
 *
 * Tamper-evident, not tamper-proof: editing any row breaks the chain from that
 * point forward, which `verifyAuditChain` reports as `ok:false` plus the first
 * bad `seq`. Truncating the *tail* is not detectable from the chain alone (the
 * same property the Python core has) — that needs an external head witness and
 * is recorded as a gap rather than pretended.
 *
 * Why this exists here: a crisis turn and a fail-closed fallback turn are the
 * two most consequential things the pipeline does, and until now the only
 * record of either was a mutable `Turn` row. Nothing in this repo could answer
 * "has the safety record been altered?"
 */

/** Python core's `GENESIS = "0" * 64` — the prev_hash of the first event. */
export const AUDIT_GENESIS = '0'.repeat(64);

export interface AuditEventInput {
  /** Who caused the event, in the pipeline's own vocabulary: 'A1', 'A8', 'system'. */
  actor: string;
  /** What happened, upper snake case: 'SAFETY_CRISIS_ROUTED'. */
  action: string;
  /** The subject — an opaque row id (`turn:<uuid>`), never message text. */
  object: string;
  /** Small, reviewable, text-only detail. Never message text or model output. */
  detail?: Record<string, string | number | boolean | null>;
}

export interface AuditEvent extends Required<AuditEventInput> {
  seq: number;
  /** ISO-8601 UTC. Stored as text, not a timestamp column: the exact string is
   * part of the hashed body, and a `timestamptz` round-trip would rewrite it. */
  at: string;
  prev_hash: string;
  hash: string;
}

/** The exact object that gets hashed — field order is irrelevant (canonicalised). */
function eventBody(event: Omit<AuditEvent, 'hash'>): Record<string, unknown> {
  return {
    seq: event.seq,
    actor: event.actor,
    action: event.action,
    object: event.object,
    detail: event.detail,
    at: event.at,
    prev_hash: event.prev_hash,
  };
}

/**
 * Canonical JSON: sorted keys, no whitespace, unicode literal.
 *
 * `JSON.stringify` preserves insertion order, so the sort has to be explicit
 * and recursive — a top-level-only sort would produce different bytes for two
 * events with the same detail in a different key order, which is exactly the
 * kind of drift that would make one implementation's chain unverifiable by the
 * other.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function computeAuditHash(prevHash: string, body: Record<string, unknown>): string {
  return createHash('sha256').update(prevHash + canonicalJson(body), 'utf-8').digest('hex');
}

export interface AuditVerification {
  ok: boolean;
  /** Number of events examined — 0 is a valid, verifying, empty chain. */
  count: number;
  /** First row whose hash or link does not check out; null when ok. */
  firstBadSeq: number | null;
  /** Hash of the last event (the chain head), or the genesis hash when empty. */
  head: string;
}

/**
 * Verify a chain, in `seq` order. Two independent checks per row:
 *   1. the link — `prev_hash` must equal the previous row's `hash`;
 *   2. the seal  — `hash` must equal sha256(prev_hash + canonical(body)).
 * A row whose `seq` is not exactly one more than the previous row's is also a
 * failure: a dropped append must not be able to hide by renumbering.
 */
export function verifyAuditChain(events: readonly AuditEvent[]): AuditVerification {
  let prev = AUDIT_GENESIS;
  let expectedSeq = 1;

  for (const event of events) {
    if (event.seq !== expectedSeq) {
      return { ok: false, count: events.length, firstBadSeq: event.seq, head: prev };
    }
    if (event.prev_hash !== prev) {
      return { ok: false, count: events.length, firstBadSeq: event.seq, head: prev };
    }
    const expectedHash = computeAuditHash(prev, eventBody(event));
    if (event.hash !== expectedHash) {
      return { ok: false, count: events.length, firstBadSeq: event.seq, head: prev };
    }
    prev = event.hash;
    expectedSeq += 1;
  }

  return { ok: true, count: events.length, firstBadSeq: null, head: prev };
}

/**
 * In-memory chain. The production wiring persists each event
 * (`lib/audit-log.ts`); this class is what tests and offline verification use,
 * and what defines "append" for both.
 */
export class AuditChain {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  append(input: AuditEventInput): AuditEvent {
    const seq = this.events.length + 1;
    const prev_hash = this.events.at(-1)?.hash ?? AUDIT_GENESIS;
    const at = this.now().toISOString();
    const body = eventBody({
      seq,
      actor: input.actor,
      action: input.action,
      object: input.object,
      detail: input.detail ?? {},
      at,
      prev_hash,
    });
    const event: AuditEvent = {
      seq,
      actor: input.actor,
      action: input.action,
      object: input.object,
      detail: (input.detail ?? {}) as Required<AuditEventInput>['detail'],
      at,
      prev_hash,
      hash: computeAuditHash(prev_hash, body),
    };
    this.events.push(event);
    return event;
  }

  verify(): AuditVerification {
    return verifyAuditChain(this.events);
  }

  get all(): readonly AuditEvent[] {
    return this.events;
  }
}

/** Build the next event for a chain whose head is known (used by the DB store). */
export function nextAuditEvent(
  head: { seq: number; hash: string },
  input: AuditEventInput,
  at: string = new Date().toISOString(),
): AuditEvent {
  const seq = head.seq + 1;
  const prev_hash = head.hash;
  const body = eventBody({
    seq,
    actor: input.actor,
    action: input.action,
    object: input.object,
    detail: input.detail ?? {},
    at,
    prev_hash,
  });
  return {
    seq,
    actor: input.actor,
    action: input.action,
    object: input.object,
    detail: (input.detail ?? {}) as Required<AuditEventInput>['detail'],
    at,
    prev_hash,
    hash: computeAuditHash(prev_hash, body),
  };
}
