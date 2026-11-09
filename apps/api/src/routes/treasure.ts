import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { checkClientText } from '../lib/safety-check.js';
import { flagSafetyEvent } from '../lib/safety-flags.js';
import { enqueueSafetyRecheck } from '../lib/safety-recheck.js';
import { sourceLabel } from '../lib/treasure-source.js';

const MAX_TITLE = 120;
const MAX_BODY = 5_000;
const MAX_COLLECTION_NAME = 60;
const MAX_TAGS = 8;
const MAX_TAG = 24;
const MAX_NOTES_PER_READ = 200;

/**
 * The four "Open when…" collections, created on the client's first read.
 *
 * Seeding on first open rather than in a migration is the owner's decision
 * (9 Nov 2026): one code path, and no rows written for accounts that never open
 * the box. `system_key` plus the unique index makes a retried seed idempotent.
 *
 * The names are the owner's approved wording, supplied 9 Nov 2026 and added to
 * `docs/exercise-library/02-approved-worksheet-copy.md`. They are the one string
 * array; changing them again is this edit plus an UPDATE on existing rows (see
 * migration `20261109180000_step7_updates_and_emails`, which applied exactly
 * that rename to boxes created before the wording arrived).
 */
export const SEEDED_COLLECTIONS = [
  { system_key: 'anxious', name: 'Open when I’m anxious', sort_order: 0 },
  { system_key: 'low', name: 'Open when I feel low', sort_order: 1 },
  { system_key: 'overwhelmed', name: 'Open when I’m overwhelmed', sort_order: 2 },
  { system_key: 'win', name: 'Open when I need a win', sort_order: 3 },
] as const;

/**
 * The sources a client's own save may claim.
 *
 * `therapist` is deliberately absent: a note the client writes is never
 * labelled as coming from their therapist. There is no therapist-to-box send
 * path yet; when one is built it will write `therapist` from the server side.
 */
const CLIENT_SOURCES = ['self', 'worksheet', 'journal', 'chat'] as const;

function normalizeTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().replace(/^#/, '').slice(0, MAX_TAG);
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

function clientSource(input: unknown): string {
  return typeof input === 'string' && (CLIENT_SOURCES as readonly string[]).includes(input)
    ? input
    : 'self';
}

/** What a client's own note text is screened as: title, body and tags. */
function noteText(title: string, body: string, tags: string[]): string {
  return [title, body, ...tags].filter((part) => part.trim().length > 0).join('\n');
}

interface NoteBody {
  title?: unknown;
  body?: unknown;
  collectionId?: unknown;
  source?: unknown;
  sourceRef?: unknown;
  tags?: unknown;
}

interface NotePatchBody {
  title?: unknown;
  body?: unknown;
  collectionId?: unknown;
  tags?: unknown;
  pinned?: unknown;
}

/**
 * The Treasure Box.
 *
 * A note is client-typed free text, so it goes through the same safety check as
 * chat on every save and every edit — a note that says the same words as a
 * crisis message must produce the same card, flag and therapist alert, or the
 * box becomes the one quiet place in the app where a disclosure goes nowhere.
 *
 * Privacy by construction mirrors worksheets: no therapist column on the row,
 * and nothing here shares implicitly. A note reaches a therapist only through
 * the per-item switch and a live link, and stopping a share takes effect on the
 * therapist's next read.
 */
export async function treasureRoute(app: FastifyInstance): Promise<void> {
  /** The client's user row, or a 401 already sent. */
  async function currentUser(uid: string) {
    return prisma.user.findUnique({ where: { auth_subject: uid }, select: { id: true } });
  }

  /** Create the four starting collections if this client has none. */
  async function seedCollections(userId: string): Promise<void> {
    await prisma.treasureCollection.createMany({
      data: SEEDED_COLLECTIONS.map((collection) => ({
        user_id: userId,
        name: collection.name,
        system_key: collection.system_key,
        sort_order: collection.sort_order,
      })),
      skipDuplicates: true,
    });
  }

  app.get<{ Querystring: { q?: string; tag?: string; collectionId?: string; pinned?: string } }>(
    '/treasure',
    {
      preHandler: [verifyCognitoJWT],
      handler: async (request, reply) => {
        const { uid } = request.user;

        const user = await currentUser(uid);
        if (!user) {
          return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
        }

        await seedCollections(user.id);

        const q = typeof request.query.q === 'string' ? request.query.q.trim() : '';
        const tag = typeof request.query.tag === 'string' ? request.query.tag.trim() : '';
        const collectionId =
          typeof request.query.collectionId === 'string' ? request.query.collectionId : '';
        const pinnedOnly = request.query.pinned === '1' || request.query.pinned === 'true';

        const where = {
          user_id: user.id,
          ...(collectionId ? { collection_id: collectionId } : {}),
          ...(tag ? { tags: { has: tag } } : {}),
          ...(pinnedOnly ? { pinned: true } : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' as const } },
                  { body: { contains: q, mode: 'insensitive' as const } },
                  { tags: { has: q } },
                ],
              }
            : {}),
        };

        const [collections, notes, tagRows] = await Promise.all([
          prisma.treasureCollection.findMany({
            where: { user_id: user.id },
            orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
            select: { id: true, name: true, system_key: true, notes: { select: { id: true } } },
          }),
          prisma.treasureNote.findMany({
            where,
            orderBy: [{ pinned: 'desc' }, { created_at: 'desc' }],
            take: MAX_NOTES_PER_READ,
            select: {
              id: true,
              title: true,
              body: true,
              source: true,
              collection_id: true,
              tags: true,
              pinned: true,
              created_at: true,
              updated_at: true,
              shared_with_therapist: true,
            },
          }),
          prisma.treasureNote.findMany({
            where: { user_id: user.id },
            select: { tags: true },
            take: 500,
          }),
        ]);

        const tags = [...new Set(tagRows.flatMap((row) => row.tags))].sort((a, b) =>
          a.localeCompare(b),
        );

        return reply.send({
          collections: collections.map((collection) => ({
            id: collection.id,
            name: collection.name,
            system_key: collection.system_key,
            count: collection.notes.length,
          })),
          tags,
          notes: notes.map((note) => ({
            ...note,
            created_at: note.created_at.toISOString(),
            updated_at: note.updated_at.toISOString(),
            sourceLabel: sourceLabel(note.source),
            // The label pair, resolved server-side (owner's Step 6 copy).
            shareLabel: note.shared_with_therapist ? 'Shared with my therapist' : 'Private',
          })),
        });
      },
    },
  );

  /**
   * GET /treasure/pick — one pinned note at random.
   *
   * Pinned only, by the owner's wording: "Pick one for me" is a way back to the
   * things the client chose to keep close, not a shuffle of everything they
   * ever wrote.
   */
  app.get('/treasure/pick', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await currentUser(uid);
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const pinned = await prisma.treasureNote.findMany({
        where: { user_id: user.id, pinned: true },
        select: { id: true },
      });

      if (pinned.length === 0) {
        return reply.status(404).send({
          error: { code: 'NO_PINNED', message: 'Pin a note you want to come back to first.' },
        });
      }

      const chosen = pinned[Math.floor(Math.random() * pinned.length)];
      const note = await prisma.treasureNote.findFirst({
        where: { id: chosen.id, user_id: user.id },
        select: {
          id: true,
          title: true,
          body: true,
          source: true,
          collection_id: true,
          tags: true,
          pinned: true,
          created_at: true,
          updated_at: true,
          shared_with_therapist: true,
        },
      });

      if (!note) {
        return reply.status(404).send({
          error: { code: 'NO_PINNED', message: 'Pin a note you want to come back to first.' },
        });
      }

      return reply.send({
        note: {
          ...note,
          created_at: note.created_at.toISOString(),
          updated_at: note.updated_at.toISOString(),
          sourceLabel: sourceLabel(note.source),
          shareLabel: note.shared_with_therapist ? 'Shared with my therapist' : 'Private',
        },
      });
    },
  });

  app.post<{ Body: NoteBody }>('/treasure/notes', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body ?? {};

      const user = await currentUser(uid);
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      const tags = normalizeTags(body.tags);

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

      const safety = await checkClientText(noteText(title, text, tags));

      const note = await prisma.treasureNote.create({
        data: {
          user_id: user.id,
          title: title.length > 0 ? title : null,
          body: text,
          tags,
          collection_id: collectionId,
          source: clientSource(body.source),
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

  /**
   * PATCH /treasure/notes/:id — edit a note the client owns.
   *
   * Text is re-screened on every edit: a note that starts harmless and is
   * rewritten into a disclosure has to raise the card then, not only when it
   * was first typed. Title, body, tags, collection and pin are the only
   * writable fields; source and share state are not (sharing is its own route).
   */
  app.patch<{ Params: { id: string }; Body: NotePatchBody }>('/treasure/notes/:id', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body ?? {};

      const user = await currentUser(uid);
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const existing = await prisma.treasureNote.findFirst({
        where: { id: request.params.id, user_id: user.id },
        select: { id: true, title: true, body: true, tags: true, source: true },
      });
      if (!existing) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'That note is not yours.' },
        });
      }

      const title =
        typeof body.title === 'string' ? body.title.trim() : (existing.title ?? '');
      const text = typeof body.body === 'string' ? body.body.trim() : existing.body;
      const tags = body.tags === undefined ? existing.tags : normalizeTags(body.tags);

      if (text.length === 0) {
        return reply.status(400).send({
          error: { code: 'EMPTY_NOTE', message: 'A note needs something in it.' },
        });
      }
      if (text.length > MAX_BODY || title.length > MAX_TITLE) {
        return reply.status(400).send({
          error: { code: 'NOTE_TOO_LONG', message: `A note can be up to ${MAX_BODY} characters.` },
        });
      }

      let collectionUpdate: { collection_id: string | null } | Record<string, never> = {};
      if (body.collectionId !== undefined) {
        if (body.collectionId === null || body.collectionId === '') {
          collectionUpdate = { collection_id: null };
        } else if (typeof body.collectionId === 'string') {
          const collection = await prisma.treasureCollection.findFirst({
            where: { id: body.collectionId, user_id: user.id },
            select: { id: true },
          });
          if (!collection) {
            return reply.status(404).send({
              error: { code: 'COLLECTION_NOT_FOUND', message: 'That collection is not yours.' },
            });
          }
          collectionUpdate = { collection_id: collection.id };
        }
      }

      // Only screen when the words can have changed. A pin or a move between
      // collections is not new text and must not produce a second flag row.
      const textChanged = title !== (existing.title ?? '') || text !== existing.body ||
        tags.join('\u0000') !== existing.tags.join('\u0000');

      const safety = textChanged ? await checkClientText(noteText(title, text, tags)) : null;

      const data: Record<string, unknown> = {
        title: title.length > 0 ? title : null,
        body: text,
        tags,
        ...collectionUpdate,
      };
      if (typeof body.pinned === 'boolean') data.pinned = body.pinned;
      if (safety) {
        data.safety_flagged = safety.flagged;
        data.safety_level = safety.flagged ? safety.level : null;
      }

      const note = await prisma.treasureNote.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          title: true,
          body: true,
          source: true,
          collection_id: true,
          tags: true,
          pinned: true,
          created_at: true,
          updated_at: true,
          shared_with_therapist: true,
        },
      });

      if (safety?.flagged) {
        await flagSafetyEvent({
          userId: user.id,
          level: safety.level,
          source: 'treasure_note',
          subjectKind: 'treasure_note',
          subjectId: note.id,
        });
      } else if (safety?.recheck) {
        await enqueueSafetyRecheck({
          userId: user.id,
          surface: 'treasure_note',
          subjectId: note.id,
        });
      }

      return reply.send({
        success: true,
        note: {
          ...note,
          created_at: note.created_at.toISOString(),
          updated_at: note.updated_at.toISOString(),
          sourceLabel: sourceLabel(note.source),
          shareLabel: note.shared_with_therapist ? 'Shared with my therapist' : 'Private',
        },
        safety: safety
          ? { showHelp: safety.showHelp, helpOffer: safety.helpOffer }
          : { showHelp: false, helpOffer: false },
      });
    },
  });

  app.delete<{ Params: { id: string } }>('/treasure/notes/:id', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await currentUser(uid);
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const result = await prisma.treasureNote.deleteMany({
        where: { id: request.params.id, user_id: user.id },
      });

      return result.count > 0
        ? reply.send({ deleted: true })
        : reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'That note is not yours.' } });
    },
  });

  app.post<{ Body: { name?: unknown } }>('/treasure/collections', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';

      const user = await currentUser(uid);
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
