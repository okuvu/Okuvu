import { timingSafeEqual } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { checkClientText } from '../lib/safety-check.js';
import { flagSafetyEvent } from '../lib/safety-flags.js';
import { enqueueSafetyRecheck } from '../lib/safety-recheck.js';
import { startOfIstDay } from '../lib/homework.js';
import { sendWorryTimeEmail } from '../lib/email.js';

/**
 * Worry time, and its daily reminder email.
 *
 * The owner's brief (24 Nov 2026): the client picks a daily time and length,
 * parks worries during the day, and at worry time gets the usual email reminder
 * (there are no app notifications yet) and then looks at the list with a
 * still-bothering / not-anymore choice for each worry.
 *
 * Two deliberate properties:
 *
 *  - A parked worry is client-typed free text, so it goes through the same
 *    safety check as the journal on the way in. A crisis typed into the parked
 *    list is not saved quietly: the flag is written with a pointer and no
 *    content, and the therapist is alerted exactly as for a journal entry.
 *  - The reminder is idempotent per IST day. `last_reminded_on` means a sweep
 *    that runs twice, or is retried after a timeout, cannot send two emails; and
 *    the sweep sends nothing before the client's chosen time, so a late run
 *    catches up rather than skipping the day.
 *
 * The sender is the internal route at the bottom, guarded by the same shared
 * secret as the push hop and inert when the secret is unset. Nothing calls it on
 * a schedule yet: there is no scheduler in this deployment, so the endpoint and
 * its sender exist and the trigger does not. That is stated in the step report
 * rather than papered over.
 */

const INTERNAL_HEADER = 'x-okuvu-internal';
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface SettingsBody {
  time?: unknown;
  minutes?: unknown;
  active?: unknown;
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Minutes past IST midnight, from the instant. */
function istMinutesOfDay(now: Date): number {
  const shifted = new Date(now.getTime() + 330 * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function parseTimeOfDay(value: unknown): { hours: number; minutes: number } | null {
  if (typeof value !== 'string') return null;
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export async function worryTimeRoute(app: FastifyInstance): Promise<void> {
  /** The client's own setting and their parked list. */
  app.get('/worry-time', {
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

      const [setting, parked] = await Promise.all([
        prisma.worryTimeSetting.findUnique({ where: { user_id: user.id } }),
        prisma.worryParked.findMany({
          where: { user_id: user.id, status: 'parked' },
          orderBy: { created_at: 'asc' },
          select: { id: true, text: true, created_at: true },
        }),
      ]);

      return reply.send({
        setting: setting
          ? {
              time: setting.time_ist,
              minutes: setting.minutes,
              active: setting.active,
              lastRemindedOn: setting.last_reminded_on
                ? setting.last_reminded_on.toISOString().slice(0, 10)
                : null,
            }
          : null,
        parked: parked.map((row) => ({
          id: row.id,
          text: row.text,
          createdAt: row.created_at.toISOString(),
        })),
      });
    },
  });

  /** Pick or change the daily window. */
  app.put<{ Body: SettingsBody }>('/worry-time/settings', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body ?? {};

      const time = parseTimeOfDay(body.time);
      if (!time) {
        return reply.status(400).send({
          error: { code: 'INVALID_TIME', message: 'Pick a time, like 19:00.' },
        });
      }
      if (
        body.minutes !== undefined &&
        (typeof body.minutes !== 'number' ||
          !Number.isInteger(body.minutes) ||
          body.minutes < 5 ||
          body.minutes > 60)
      ) {
        return reply.status(400).send({
          error: { code: 'INVALID_MINUTES', message: 'Choose between 5 and 60 minutes.' },
        });
      }
      if (body.active !== undefined && typeof body.active !== 'boolean') {
        return reply.status(400).send({
          error: { code: 'INVALID_ACTIVE', message: 'active must be true or false' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const saved = await prisma.worryTimeSetting.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id,
          time_ist: `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`,
          minutes: typeof body.minutes === 'number' ? body.minutes : 10,
          active: body.active === undefined ? true : body.active,
        },
        update: {
          time_ist: `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`,
          ...(typeof body.minutes === 'number' ? { minutes: body.minutes } : {}),
          ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
        },
      });

      return reply.send({
        setting: {
          time: saved.time_ist,
          minutes: saved.minutes,
          active: saved.active,
          lastRemindedOn: saved.last_reminded_on
            ? saved.last_reminded_on.toISOString().slice(0, 10)
            : null,
        },
      });
    },
  });

  /** Park a worry during the day. Screened on the way in, like any client text. */
  app.post<{ Body: { text?: unknown } }>('/worry-time/parked', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const raw = request.body?.text;
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text.length === 0) {
        return reply.status(400).send({
          error: { code: 'EMPTY_WORRY', message: 'Write the worry first.' },
        });
      }
      if (text.length > 2000) {
        return reply.status(400).send({
          error: { code: 'WORRY_TOO_LONG', message: 'That is longer than this list can hold.' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const safety = await checkClientText(text);

      const created = await prisma.worryParked.create({
        data: { user_id: user.id, text },
        select: { id: true, created_at: true },
      });

      if (safety.flagged) {
        await flagSafetyEvent({
          userId: user.id,
          level: safety.level,
          source: safety.screen === 'harm_to_someone' ? 'harm_to_someone' : 'worry_parked',
          subjectKind: 'worry_parked',
          subjectId: created.id,
          urgent: safety.urgent,
        });
      } else if (safety.recheck) {
        await enqueueSafetyRecheck({
          userId: user.id,
          surface: 'worry_parked',
          subjectId: created.id,
        });
      }

      return reply.code(201).send({
        id: created.id,
        createdAt: created.created_at.toISOString(),
        safety: {
          showHelp: safety.showHelp,
          helpOffer: safety.helpOffer,
          urgent: safety.urgent,
        },
      });
    },
  });

  /** At worry time: what happened when you came back to it. */
  app.post<{ Params: { id: string }; Body: { status?: unknown } }>(
    '/worry-time/parked/:id/resolve',
    {
      preHandler: [verifyCognitoJWT],
      handler: async (request, reply) => {
        const { uid } = request.user;
        const status = request.body?.status;
        if (status !== 'still' && status !== 'released') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_STATUS',
              message: 'status must be still or released',
            },
          });
        }

        const user = await prisma.user.findUnique({
          where: { auth_subject: uid },
          select: { id: true },
        });
        if (!user) {
          return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
        }

        // 404 for a row that is not the caller's, exactly as an unknown id —
        // a 403 would confirm the id exists.
        const row = await prisma.worryParked.findFirst({
          where: { id: request.params.id, user_id: user.id },
          select: { id: true },
        });
        if (!row) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
        }

        await prisma.worryParked.update({
          where: { id: row.id },
          data: { status, resolved_at: new Date() },
        });

        return reply.send({ id: row.id, status });
      },
    },
  );

  /** Removing a parked worry is the removal: no copy remains anywhere. */
  app.delete<{ Params: { id: string } }>('/worry-time/parked/:id', {
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

      const result = await prisma.worryParked.deleteMany({
        where: { id: request.params.id, user_id: user.id },
      });
      if (result.count === 0) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      }
      return reply.send({ deleted: true });
    },
  });

  /**
   * The daily reminder sweep.
   *
   * Inert (503) when the shared secret is unset, so a deployment that has not
   * configured it cannot be driven by anyone. Sends at most one email per
   * client per IST day, and only once their chosen time has passed — a sweep
   * that runs late catches the day up rather than skipping it.
   */
  app.post('/internal/worry-time/reminders', {
    handler: async (request, reply) => {
      const expected = process.env.OKUVU_INTERNAL_SECRET;
      if (!expected) {
        return reply.status(503).send({ error: { code: 'NOT_CONFIGURED', message: 'Not configured' } });
      }
      if (!secretMatches(request.headers[INTERNAL_HEADER] as string | undefined, expected)) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      }

      const now = new Date();
      const today = startOfIstDay(now);
      const nowMinutes = istMinutesOfDay(now);

      const settings = await prisma.worryTimeSetting.findMany({
        where: { active: true },
        select: {
          user_id: true,
          time_ist: true,
          minutes: true,
          last_reminded_on: true,
          user: { select: { email: true, full_name: true } },
        },
      });

      let sent = 0;
      let skipped = 0;

      for (const setting of settings) {
        const chosen = parseTimeOfDay(setting.time_ist);
        if (!chosen) {
          skipped += 1;
          continue;
        }
        const chosenMinutes = chosen.hours * 60 + chosen.minutes;
        if (nowMinutes < chosenMinutes) {
          skipped += 1;
          continue;
        }
        const alreadyToday =
          setting.last_reminded_on !== null && setting.last_reminded_on.getTime() >= today.getTime();
        if (alreadyToday) {
          skipped += 1;
          continue;
        }
        const email = setting.user?.email;
        if (!email) {
          skipped += 1;
          continue;
        }

        const parked = await prisma.worryParked.count({
          where: { user_id: setting.user_id, status: 'parked' },
        });

        const result = await sendWorryTimeEmail({
          to: email,
          name: setting.user?.full_name ?? null,
          minutes: setting.minutes,
          parkedCount: parked,
        });

        if (result.sent) {
          await prisma.worryTimeSetting.update({
            where: { user_id: setting.user_id },
            data: { last_reminded_on: today },
          });
          sent += 1;
        } else {
          skipped += 1;
        }
      }

      return reply.send({ sent, skipped });
    },
  });
}
