import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { checkClientText } from '../lib/safety-check.js';
import { flagSafetyEvent } from '../lib/safety-flags.js';
import { enqueueSafetyRecheck } from '../lib/safety-recheck.js';

const MAX_TITLE = 120;
const MAX_BODY = 5_000;
const MAX_COLLECTION_NAME = 60;

interface NoteBody {
  title?: unknown;
  body?: unknown;
  collectionId?: unknown;
  source?: unknown;
  sourceRef?: unknown;
}

/**
 * The Treasure Box.
 *
 * A note is client-typed free text, so it goes through the same safety check as
 * chat on every save — a note that says the same words as a crisis message must
 * produce the same card, flag and therapist alert, or the box becomes the one
 * quiet place in the app where a disclosure goes nowhere.
 *
 * Privacy by construction mirrors worksheets: no therapist column on the row,
 * and nothing here shares. There is no read path a therapist can reach.
 */
export async function treasureRoute(app: FastifyInstance): Promise<void> {
  app.get('/treasure', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const [collections, notes] = await Promise.all([
        prisma.treasureCollection.findMany({
          where: { user_id: user.id },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
          select: { id: true, name: true, system_key: true },
        }),
        prisma.treasureNote.findMany({
          where: { user_id: user.id },
          orderBy: [{ pinned: 'desc' }, { created_at: 'desc' }],
          take: 200,
          select: {
            id: true,
            title: true,
            body: true,
            collection_id: true,
            pinned: true,
            created_at: true,
            shared_with_therapist: true,
          },
        }),
      ]);

      return reply.send({
        collections,
        notes: notes.map((note) => ({
          ...note,
          created_at: note.created_at.toISOString(),
        })),
      });
    },
  });

  app.post<{ Body: NoteBody }>('/treasure/notes', {
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

      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const text = typeof body.body === 'string' ? body.body.trim() : '';

      if (text.length === 0) {
        return reply.status(400).send({
          error: { code: 'EMPTY_NOTE', message: 'Write something to keep first.' },
        });
      }
      if (text.length > MAX_BODY || title.length > MAX_TITLE) {
        return reply.status(400).send({
          error: { code: 'NOTE_TOO_LONG', message: `A note can be up to ${MAX_BODY} characters.` },
        });
      }

      let collectionId: string | null = null;
      if (typeof body.collectionId === 'string' && body.collectionId.length > 0) {
        const collection = await prisma.treasureCollection.findFirst({
          where: { id: body.collectionId, user_id: user.id },
          select: { id: true },
        });
        if (!collection) {
          return reply.status(404).send({
            error: { code: 'COLLECTION_NOT_FOUND', message: 'That collection is not yours.' },
          });
        }
        collectionId = collection.id;
      }

      const safety = await checkClientText([title, text].filter((part) => part.length > 0).join('\n'));

      const note = await prisma.treasureNote.create({
        data: {
          user_id: user.id,
          title: title.length > 0 ? title : null,
          body: text,
          collection_id: collectionId,
          source: typeof body.source === 'string' ? body.source : 'self',
          source_ref: typeof body.sourceRef === 'string' ? body.sourceRef : null,
          safety_flagged: safety.flagged,
          safety_level: safety.flagged ? safety.level : null,
        },
        select: { id: true },
      });

      if (safety.flagged) {
        await flagSafetyEvent({
          userId: user.id,
          level: safety.level,
          source: 'treasure_note',
          subjectKind: 'treasure_note',
          subjectId: note.id,
        });
      } else if (safety.recheck) {
        // Unscreened: moderate concern, no alert. The note is queued and
        // screened again when the classifier answers.
        await enqueueSafetyRecheck({
          userId: user.id,
          surface: 'treasure_note',
          subjectId: note.id,
        });
      }

      request.log.info({
        event: 'treasure_note_created',
        user_id: user.id,
        safety_level: safety.level,
        safety_flagged: safety.flagged,
        safety_reason: safety.reason,
      });

      return reply.code(201).send({
        success: true,
        id: note.id,
        safety: { showHelp: safety.showHelp, helpOffer: safety.helpOffer },
      });
    },
  });

  app.post<{ Body: { name?: unknown } }>('/treasure/collections', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      if (name.length === 0) {
        return reply.status(400).send({
          error: { code: 'EMPTY_NAME', message: 'Give the collection a name.' },
        });
      }
      if (name.length > MAX_COLLECTION_NAME) {
        return reply.status(400).send({
          error: { code: 'NAME_TOO_LONG', message: `A name can be up to ${MAX_COLLECTION_NAME} characters.` },
        });
      }

      // A collection name is client-typed text that is shown back on their own
      // screen, so it goes through the same check rather than around it.
      const safety = await checkClientText(name);
      const count = await prisma.treasureCollection.count({ where: { user_id: user.id } });

      const collection = await prisma.treasureCollection.create({
        data: { user_id: user.id, name, sort_order: count },
        select: { id: true, name: true, system_key: true },
      });

      return reply.code(201).send({
        success: true,
        collection,
        safety: { showHelp: safety.showHelp, helpOffer: safety.helpOffer },
      });
    },
  });
}
