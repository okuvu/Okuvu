import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * Portal P0 — registration is not an invite.
 *
 * The app is on Play internal testing, and internal testing only admits Google
 * accounts on the tester list. So a therapist adding a client must send
 * NOTHING: the link would not open. The operator is notified instead, and the
 * one invite email leaves from the console's "Mark tester access added".
 *
 * These tests pin that two-step handover, and the 18+ attestation that is now
 * required at registration.
 */

const { emailMock } = vi.hoisted(() => ({
  emailMock: {
    sendAdminTesterRequestEmail: vi.fn(),
    sendClientInviteEmail: vi.fn(),
    sendInviteEmail: vi.fn(),
    sendWaitlistNotification: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => emailMock);

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr Rao' };
const ADMIN_EMAIL = 'admin@okuvu.dev';

interface Options {
  existingUser?: unknown;
  assignment?: unknown;
}

function buildPrisma(options: Options = {}) {
  const tx = {
    user: { create: vi.fn().mockResolvedValue({ id: 'new_client_1' }) },
    clinicalConfig: { create: vi.fn().mockResolvedValue({}) },
    therapistClient: { create: vi.fn().mockResolvedValue({}) },
  };

  return {
    tx,
    client: {
      therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
      user: { findFirst: vi.fn().mockResolvedValue(options.existingUser ?? null) },
      therapistClient: {
        findFirst: vi.fn().mockResolvedValue(
          'assignment' in options
            ? options.assignment
            : {
                id: 'tc_1',
                client_label: 'A. (Tuesdays)',
                therapist: { name: 'Dr Rao', email: THERAPIST.email },
                client: { email: 'client@example.test' },
              },
        ),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaClient,
  };
}

function callerWith(prisma: PrismaClient, email = THERAPIST.email) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email, name: THERAPIST.name } },
    prisma,
    headers: new Headers(),
  });
}

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;
const ORIGINAL_ADMIN = process.env.ADMIN_EMAILS;

beforeEach(() => {
  delete process.env.LOCAL_DEV_BYPASS_AUTH;
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
  emailMock.sendAdminTesterRequestEmail.mockResolvedValue({ sent: true });
  emailMock.sendClientInviteEmail.mockResolvedValue({ sent: true });
});

afterEach(() => {
  if (ORIGINAL_BYPASS === undefined) delete process.env.LOCAL_DEV_BYPASS_AUTH;
  else process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
  if (ORIGINAL_ADMIN === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN;
  vi.clearAllMocks();
});

describe('clients.create — the therapist’s Add client', () => {
  it('stores the therapist’s label and their 18+ attestation, and emails nobody', async () => {
    const { client, tx } = buildPrisma();
    const caller = callerWith(client);

    const result = await caller.clients.create({
      clientLabel: 'A. (Tuesdays)',
      email: '  Client@Example.test  ',
      carePlanId: 'CP2',
      adultConfirmed: true,
    });

    expect(result).toEqual({
      success: true,
      clientId: 'new_client_1',
      email: 'client@example.test',
      status: 'waiting_app_access',
      adminNotified: true,
    });

    expect(tx.therapistClient.create).toHaveBeenCalledWith({
      data: {
        therapist_id: THERAPIST.id,
        client_user_id: 'new_client_1',
        client_label: 'A. (Tuesdays)',
        age_confirmed_by_therapist_at: expect.any(Date),
        age_confirmed_by_therapist_id: THERAPIST.id,
      },
    });

    // The whole point: no client email at registration, ever.
    expect(emailMock.sendClientInviteEmail).not.toHaveBeenCalled();
    expect(emailMock.sendInviteEmail).not.toHaveBeenCalled();

    // The operator is told to add the address to the Play tester group.
    expect(emailMock.sendAdminTesterRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        clientEmail: 'client@example.test',
        clientLabel: 'A. (Tuesdays)',
        therapistEmail: THERAPIST.email,
      }),
    );
  });

  it('refuses an add without the 18+ attestation', async () => {
    const { client } = buildPrisma();
    const caller = callerWith(client);

    await expect(
      // Deliberately invalid input, cast past the type: `adultConfirmed` is
      // z.literal(true), so a form that forgets the checkbox cannot submit.
      caller.clients.create({
        clientLabel: 'A.',
        email: 'client@example.test',
        carePlanId: 'CP2',
        adultConfirmed: false as unknown as true,
      }),
    ).rejects.toThrow();
    expect(emailMock.sendAdminTesterRequestEmail).not.toHaveBeenCalled();
  });

  it('names the address when a client with that email already exists', async () => {
    const { client, tx } = buildPrisma({ existingUser: { id: 'existing' } });
    const caller = callerWith(client);

    await expect(
      caller.clients.create({
        clientLabel: 'A.',
        email: 'dup@example.test',
        carePlanId: 'CP1',
        adultConfirmed: true,
      }),
    ).rejects.toThrow(/dup@example\.test/);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('still creates the client when the admin notification fails', async () => {
    const { client } = buildPrisma();
    emailMock.sendAdminTesterRequestEmail.mockResolvedValue({ sent: false });
    const caller = callerWith(client);

    const result = await caller.clients.create({
      clientLabel: 'A.',
      email: 'client@example.test',
      carePlanId: 'CP3',
      adultConfirmed: true,
    });

    expect(result.success).toBe(true);
    expect(result.adminNotified).toBe(false);
  });
});

describe('admin.markTesterAccessAdded', () => {
  it('records the action, sends the one invite, and stamps invite_sent_at', async () => {
    const { client } = buildPrisma();
    const caller = callerWith(client, ADMIN_EMAIL);

    const result = await caller.admin.markTesterAccessAdded({ clientUserId: 'client_1' });

    expect(result).toEqual({
      success: true,
      emailSent: true,
      clientLabel: 'A. (Tuesdays)',
    });
    expect(emailMock.sendClientInviteEmail).toHaveBeenCalledWith({
      to: 'client@example.test',
      therapistName: 'Dr Rao',
    });
    const updates = (client.therapistClient.update as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(updates[0][0].data).toHaveProperty('tester_access_added_at');
    expect(updates[1][0].data).toHaveProperty('invite_sent_at');
  });

  it('does not claim the client was invited when the send failed', async () => {
    const { client } = buildPrisma();
    emailMock.sendClientInviteEmail.mockResolvedValue({ sent: false });
    const caller = callerWith(client, ADMIN_EMAIL);

    const result = await caller.admin.markTesterAccessAdded({ clientUserId: 'client_1' });

    expect(result.emailSent).toBe(false);
    const update = client.therapistClient.update as unknown as ReturnType<typeof vi.fn>;
    // tester_access_added_at is recorded (the human did the step); invite_sent_at
    // is not, because nothing was sent.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toHaveProperty('tester_access_added_at');
  });

  it('refuses a client with no active relationship', async () => {
    const { client } = buildPrisma({ assignment: null });
    const caller = callerWith(client, ADMIN_EMAIL);

    await expect(
      caller.admin.markTesterAccessAdded({ clientUserId: 'client_1' }),
    ).rejects.toThrow(/no active therapist relationship/i);
    expect(emailMock.sendClientInviteEmail).not.toHaveBeenCalled();
  });
});
