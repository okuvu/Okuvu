import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import {
  SHARE_LABEL_PRIVATE,
  SHARE_LABEL_SHARED,
  isShareableKind,
  type ShareState,
  type ShareableKind,
} from '@okuvu/shared-types/sharing';

interface ShareBody {
  kind?: unknown;
  id?: unknown;
  shared?: unknown;
}

function stateFor(kind: ShareableKind, id: string, row: {
  shared_with_therapist: boolean;
  shared_at: Date | null;
  unshared_at: Date | null;
}): ShareState {
  return {
    kind,
    id,
    shared: row.shared_with_therapist,
    sharedAt: row.shared_at ? row.shared_at.toISOString() : null,
    unsharedAt: row.unshared_at ? row.unshared_at.toISOString() : null,
    label: row.shared_with_therapist ? SHARE_LABEL_SHARED : SHARE_LABEL_PRIVATE,
  };
}

/**
 * One share switch for every item a client can share.
 *
 * The owner's rule (Step 6): each entry and note has its own share, with its
 * own revoke, and stopping a share must take effect on the therapist's next
 * read. That is why visibility is the boolean on the row and not a copy: one
 * UPDATE is the whole revoke.
 *
 * Three properties this route deliberately has:
 *  - it never reads or logs the item's text (a share is metadata);
 *  - it answers 404 for someone else's row, so the route cannot be used to
 *    probe which ids exist;
 *  - it is the ONLY write path for `shared_with_therapist`, so chat access and
 *    a per-item share cannot be conflated. A shared item is visible without
 *    chat access (owner decision 6).
 */
export async function sharingRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ShareBody }>('/sharing', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body ?? {};

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      if (!isShareableKind(body.kind)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_KIND',
            message: 'kind must be one of journal_entry, worksheet_response, treasure_note',
          },
        });
      }
      if (typeof body.id !== 'string' || body.id.length === 0) {
        return reply.status(400).send({
          error: { code: 'INVALID_ID', message: 'id is required' },
        });
      }
      if (typeof body.shared !== 'boolean') {
        return reply.status(400).send({
          error: { code: 'INVALID_SHARED', message: 'shared must be true or false' },
        });
      }

      const kind = body.kind;
      const id = body.id;
      const shared = body.shared;
      const now = new Date();

      // The same three values on every surface: the boolean decides
      // visibility, `shared_at` records the last grant, `unshared_at` the last
      // stop. Never `shared_at: null` on an unshare — the audit trail is the
      // point of having both.
      const data = shared
        ? { shared_with_therapist: true, shared_at: now, unshared_at: null }
        : { shared_with_therapist: false, unshared_at: now };

      try {
        if (kind === 'journal_entry') {
          const row = await prisma.journalEntry.findFirst({
            where: { id, user_id: user.id },
            select: { id: true },
          });
          if (!row) throw new NotFound();
          const updated = await prisma.journalEntry.update({
            where: { id },
            data,
            select: { shared_with_therapist: true, shared_at: true, unshared_at: true },
          });
          return reply.send(stateFor(kind, id, updated));
        }

        if (kind === 'worksheet_response') {
          const row = await prisma.worksheetResponse.findFirst({
            where: { id, user_id: user.id },
            select: { id: true },
          });
          if (!row) throw new NotFound();
          const updated = await prisma.worksheetResponse.update({
            where: { id },
            data,
            select: { shared_with_therapist: true, shared_at: true, unshared_at: true },
          });
          return reply.send(stateFor(kind, id, updated));
        }

        const row = await prisma.treasureNote.findFirst({
          where: { id, user_id: user.id },
          select: { id: true },
        });
        if (!row) throw new NotFound();
        const updated = await prisma.treasureNote.update({
          where: { id },
          data,
          select: { shared_with_therapist: true, shared_at: true, unshared_at: true },
        });
        return reply.send(stateFor(kind, id, updated));
      } catch (err) {
        if (err instanceof NotFound) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'That item is not yours.' },
          });
        }
        request.log.error({
          event: 'share_write_failed',
          kind,
          err: err instanceof Error ? err.message : String(err),
        });
        return reply.status(503).send({
          error: { code: 'SHARE_FAILED', message: 'Could not change sharing. Please try again.' },
        });
      }
    },
  });
}

class NotFound extends Error {}
