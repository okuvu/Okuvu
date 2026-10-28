import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { verifyPersistedAuditChain } from '../lib/audit-log.js';

/**
 * E17-S4 — `GET /audit/verify` is the endpoint that answers "has the safety
 * record been altered?" for the persisted audit chain (`lib/audit-chain.ts`,
 * `lib/audit-log.ts`).
 *
 * `ok` is the whole contract and is deliberately conservative:
 *   • `ok: true` only when every row's `prev_hash` link holds, every `seq` is
 *     contiguous from 1, and every stored body hashes back to its own `hash`;
 *   • `count` is the number of rows examined — an empty chain verifies as
 *     `ok:true, count:0`, which is honest: nothing has been recorded, and a
 *     reader can tell "no events" apart from "events that verify".
 *
 * Authenticated like every other non-health route (E17-S3's rule: the deployed
 * API has no anonymous surface apart from `/health`). It returns counts and
 * hashes only — no event detail, no client identifiers.
 */
export async function auditRoute(app: FastifyInstance): Promise<void> {
  app.get('/audit/verify', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      try {
        const verification = await verifyPersistedAuditChain();

        request.log.info(
          {
            event: 'audit_verify',
            ok: verification.ok,
            count: verification.count,
            first_bad_seq: verification.firstBadSeq,
          },
          verification.ok ? 'Audit chain verified' : 'Audit chain FAILED verification',
        );

        // A broken chain is a 500-class fact about the service, not a 200 with a
        // flag: a monitoring probe that only looks at status codes must not read
        // a tampered chain as healthy.
        return reply.status(verification.ok ? 200 : 500).send({
          ok: verification.ok,
          count: verification.count,
          first_bad_seq: verification.firstBadSeq,
          head: verification.head,
        });
      } catch (err) {
        request.log.error({ event: 'audit_verify', err }, 'Audit chain verification could not run');
        return reply.status(503).send({
          ok: false,
          count: 0,
          error: { code: 'AUDIT_UNAVAILABLE', message: 'Audit chain could not be read' },
        });
      }
    },
  });
}
