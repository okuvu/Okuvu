import { prisma } from './prisma.js';
import {
  AUDIT_GENESIS,
  canonicalJson,
  nextAuditEvent,
  verifyAuditChain,
  type AuditEvent,
  type AuditEventInput,
  type AuditVerification,
} from './audit-chain.js';

/**
 * E17-S4 — the durable half of the audit chain: one row per event in
 * `AuditEvent`, chained to the row before it (`lib/audit-chain.ts` defines the
 * hash construction, and is the only place it is defined).
 *
 * The `body` column holds the exact canonical JSON that was hashed. Hashing a
 * re-serialised object would make the seal depend on Postgres's JSON
 * normalisation (jsonb reorders keys, reformats numbers); hashing the stored
 * text means the bytes that were sealed are the bytes that are verified. The
 * other columns (`actor`, `action`, `object`, `at`, `prev_hash`) exist to be
 * queried, and `verifyAuditChain` requires them to agree with the body, so
 * editing a column without editing the body is a verification failure too.
 *
 * Concurrency: `RecordAuditEvent` is serialised in-process (a single ECS task
 * serves every turn), and `prev_hash` is UNIQUE in the database, so two tasks
 * racing for the same head is an insert error, not a forked chain. A retry
 * re-reads the head and appends behind the winner.
 */

interface AuditRow {
  seq: number;
  actor: string;
  action: string;
  object: string;
  at: string;
  body: string;
  prev_hash: string;
  hash: string;
}

/** The canonical body text for an event — what `body` stores and what is hashed. */
export function auditBodyText(event: AuditEvent): string {
  return canonicalJson({
    seq: event.seq,
    actor: event.actor,
    action: event.action,
    object: event.object,
    detail: event.detail,
    at: event.at,
    prev_hash: event.prev_hash,
  });
}

function rowToEvent(row: AuditRow): AuditEvent {
  const parsed = JSON.parse(row.body) as {
    seq: number;
    actor: string;
    action: string;
    object: string;
    detail: Record<string, string | number | boolean | null>;
    at: string;
    prev_hash: string;
  };
  return {
    seq: parsed.seq,
    actor: parsed.actor,
    action: parsed.action,
    object: parsed.object,
    detail: parsed.detail,
    at: parsed.at,
    prev_hash: parsed.prev_hash,
    hash: row.hash,
  };
}

/**
 * Every row in `seq` order, with its stored body re-canonicalised.
 *
 * `verifyAuditChain` recomputes each hash from `prev_hash + canonical(body)`,
 * so a body that is no longer canonical fails the same way an edited one does.
 */
async function loadChain(): Promise<{ events: AuditEvent[]; rows: AuditRow[] }> {
  const rows = (await prisma.auditEvent.findMany({
    orderBy: { seq: 'asc' },
  })) as unknown as AuditRow[];

  const events = rows.map((row) => {
    const event = rowToEvent(row);
    // A body whose text is not the canonical form of its own parsed value has
    // been edited: fail the seal rather than silently re-canonicalising it.
    if (canonicalJson(JSON.parse(row.body)) !== row.body) {
      return { ...event, hash: 'non-canonical-body' };
    }
    // The queryable columns must agree with the sealed body.
    if (
      event.seq !== row.seq ||
      event.prev_hash !== row.prev_hash ||
      event.actor !== row.actor ||
      event.action !== row.action ||
      event.object !== row.object ||
      event.at !== row.at
    ) {
      return { ...event, hash: 'column-body-mismatch' };
    }
    return event;
  });

  return { events, rows };
}

let appendQueue: Promise<unknown> = Promise.resolve();

/**
 * Append one event. Serialised in-process; retried once per head race.
 *
 * Failures are logged and swallowed on purpose. The alternative — throwing —
 * would turn a turn whose safety path already succeeded into the generic error
 * this story exists to eliminate (`TURN_FAILED` / HTTP 500). The loss is not
 * silent: it logs `audit_append_failed` with the action and object, and the
 * missing row shows up as a `seq` gap that `/audit/verify` reports as not ok.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<AuditEvent | null> {
  const run = async (): Promise<AuditEvent | null> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const head = (await prisma.auditEvent.findFirst({
          orderBy: { seq: 'desc' },
          select: { seq: true, hash: true },
        })) as { seq: number; hash: string } | null;

        const event = nextAuditEvent(
          head ?? { seq: 0, hash: AUDIT_GENESIS },
          input,
        );

        await prisma.auditEvent.create({
          data: {
            seq: event.seq,
            actor: event.actor,
            action: event.action,
            object: event.object,
            at: event.at,
            body: auditBodyText(event),
            prev_hash: event.prev_hash,
            hash: event.hash,
          },
        });

        return event;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'P2002' && attempt < 4) {
          // Another task appended to the same head first. Re-read and retry.
          continue;
        }
        console.error(
          { event: 'audit_append_failed', action: input.action, object: input.object, err },
          'Audit chain append failed — the turn was served without an audit row',
        );
        return null;
      }
    }
    return null;
  };

  const queued = appendQueue.then(run, run);
  appendQueue = queued.catch(() => undefined);
  return queued;
}

/** Verify the persisted chain. `ok` is the contract the /audit/verify route serves. */
export async function verifyPersistedAuditChain(): Promise<AuditVerification> {
  const { events } = await loadChain();
  return verifyAuditChain(events);
}

/** Full chain, for diagnostics — never message text, never model output. */
export async function readPersistedAuditChain(): Promise<AuditEvent[]> {
  const { events } = await loadChain();
  return events;
}
