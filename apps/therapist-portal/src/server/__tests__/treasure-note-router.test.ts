import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * A therapist writing into a client's Treasure Box.
 *
 * Two properties, both of them the difference between a gift and a breach:
 * the note lands as a *waiting* update rather than straight into the box, and
 * only a live link can send one.
 */

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const CLIENT_ID = 'client_1';

function buildPrisma(overrides: { link?: unknown; recipient?: unknown } = {}) {
  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: {
      findFirst: vi.fn().mockResolvedValue('link' in overrides ? overrides.link : { id: 'tc_1' }),
    },
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          'recipient' in overrides
            ? overrides.recipient
            : {
                email: null,
                appointment_reminders_enabled: true,
                update_emails_enabled: true,
                email_update_token: null,
              },
        ),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
    notification: { create: vi.fn().mockResolvedValue({ id: 'ntf_1' }) },
    // Nothing in this path may write the note into the client's box.
    treasureNote: { create: vi.fn() },
  } as unknown as PrismaClient;
}

function callerFor(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
    prisma,
    headers: new Headers(),
  });
}

describe('treasureBox.send', () => {
  beforeEach(() => {
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    delete process.env.BREVO_API_KEY;
  });

  it('writes a waiting update, not a note in the box', async () => {
    const prisma = buildPrisma();

    await callerFor(prisma).treasureBox.send({
      clientId: CLIENT_ID,
      body: 'You handled that call better than you think.',
    });

    const row = (prisma.notification.create as any).mock.calls[0][0].data;
    expect(row).toMatchObject({
      user_id: CLIENT_ID,
      kind: 'treasure_note_waiting',
      title: 'Your therapist sent you something for your Treasure Box.',
      body: '',
      note_body: 'You handled that call better than you think.',
    });
    // The client's box is theirs: nothing appears in it until they tap Keep.
    expect(prisma.treasureNote.create).not.toHaveBeenCalled();
  });

  it('trims the note and refuses an empty one', async () => {
    const prisma = buildPrisma();
    const caller = callerFor(prisma);

    await expect(caller.treasureBox.send({ clientId: CLIENT_ID, body: '   ' })).rejects.toThrow(
      /Write something first/,
    );
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('refuses a therapist who is no longer linked to the client', async () => {
    const prisma = buildPrisma({ link: null });

    await expect(
      callerFor(prisma).treasureBox.send({ clientId: CLIENT_ID, body: 'A line to keep.' }),
    ).rejects.toThrow(/not linked to your caseload/);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('checks the link against the live row, not a past assignment', async () => {
    const prisma = buildPrisma();

    await callerFor(prisma).treasureBox.send({ clientId: CLIENT_ID, body: 'A line to keep.' });

    expect((prisma.therapistClient.findFirst as any).mock.calls[0][0].where).toMatchObject({
      therapist_id: THERAPIST.id,
      client_user_id: CLIENT_ID,
      ended_at: null,
    });
  });
});
