import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

vi.mock('@/lib/email', () => ({
  sendInviteEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

const ADMIN = { id: 'admin_1', email: 'admin@okuvu.in', name: 'Admin' };
const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const CLIENT = { id: 'client_1', phone_number: '+919876543210' };

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

interface PrismaOverrides {
  existingAssignment?: unknown;
  client?: unknown;
  existingUserForInvite?: unknown;
}

function buildTxClient() {
  return {
    user: { create: vi.fn().mockResolvedValue({ id: 'new_client_1' }) },
    clinicalConfig: { create: vi.fn().mockResolvedValue({}) },
    therapistClient: { create: vi.fn().mockResolvedValue({}) },
    inviteToken: { create: vi.fn().mockResolvedValue({ token: 'GENERATED1' }) },
  };
}

function buildPrisma(overrides: PrismaOverrides = {}) {
  const txClient = buildTxClient();
  return {
    user: {
      findFirst: vi.fn().mockImplementation((args) => {
        // assignClient's phone-only lookup vs. createClientWithInvite's
        // phone-OR-email dedupe check share this mock; distinguish by args.
        if (args?.where?.OR) {
          return Promise.resolve('existingUserForInvite' in overrides ? overrides.existingUserForInvite : null);
        }
        return Promise.resolve('client' in overrides ? overrides.client : CLIENT);
      }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ email: 'client@example.com', full_name: 'Shubhangi' }),
    },
    therapist: {
      findUnique: vi.fn().mockResolvedValue(THERAPIST),
      findMany: vi.fn().mockResolvedValue([]),
    },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue(overrides.existingAssignment ?? null),
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    inviteToken: {
      create: vi.fn().mockResolvedValue({ token: 'STANDALONE1' }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txClient)),
    __txClient: txClient,
  } as unknown as PrismaClient & { __txClient: ReturnType<typeof buildTxClient> };
}

function callerWith(prisma: PrismaClient, asAdmin = true) {
  const identity = asAdmin ? ADMIN : THERAPIST;
  return appRouter.createCaller({
    session: { user: { id: identity.id, email: identity.email, name: identity.name } },
    prisma,
    headers: new Headers(),
  });
}

describe('admin.assignClient (okuvu-remaining-changes.md — Add-Client flow + consent capture)', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ADMIN.email;
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
  });

  it('throws FORBIDDEN for a non-admin caller', async () => {
    const caller = callerWith(buildPrisma(), false);
    await expect(
      caller.admin.assignClient({
        therapistId: THERAPIST.id,
        clientPhoneNumber: CLIENT.phone_number,
        chatAccessGranted: true,
      }),
    ).rejects.toThrow(/admin access required/i);
  });

  it('creates a new assignment with chat_access_granted set from input', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    const result = await caller.admin.assignClient({
      therapistId: THERAPIST.id,
      clientPhoneNumber: CLIENT.phone_number,
      chatAccessGranted: true,
    });

    expect(result).toEqual({
      success: true,
      therapistEmail: THERAPIST.email,
      clientId: CLIENT.id,
      wasAlreadyAssigned: false,
    });
    expect(prisma.therapistClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
        create: expect.objectContaining({ chat_access_granted: true }),
      }),
    );
  });

  it('sets user.language_mode when languageMode is provided', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await caller.admin.assignClient({
      therapistId: THERAPIST.id,
      clientPhoneNumber: CLIENT.phone_number,
      chatAccessGranted: false,
      languageMode: 'mirror',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: CLIENT.id },
      data: { language_mode: 'mirror' },
    });
  });

  it('does not call user.update when languageMode is omitted', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await caller.admin.assignClient({
      therapistId: THERAPIST.id,
      clientPhoneNumber: CLIENT.phone_number,
      chatAccessGranted: false,
    });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('marks wasAlreadyAssigned true and never overwrites consent on a repeat assignment', async () => {
    const prisma = buildPrisma({ existingAssignment: { id: 'tc_1' } });
    const caller = callerWith(prisma);

    const result = await caller.admin.assignClient({
      therapistId: THERAPIST.id,
      clientPhoneNumber: CLIENT.phone_number,
      chatAccessGranted: true,
    });

    expect(result.wasAlreadyAssigned).toBe(true);
    expect(prisma.therapistClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  it('throws NOT_FOUND when no client exists with that phone number', async () => {
    const prisma = buildPrisma({ client: null });
    const caller = callerWith(prisma);

    await expect(
      caller.admin.assignClient({
        therapistId: THERAPIST.id,
        clientPhoneNumber: '+910000000000',
        chatAccessGranted: false,
      }),
    ).rejects.toThrow(/no client found/i);
  });
});

describe('admin.createClientWithInvite (therapist-portal wireframes C-01..C-06)', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ADMIN.email;
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
    vi.clearAllMocks();
  });

  const BASE_INPUT = {
    therapistId: THERAPIST.id,
    fullName: 'Shubhangi Rao',
    phoneNumber: '+919876500000',
    email: 'shubhangi@example.com',
    carePlanId: 'CP2' as const,
  };

  it('throws FORBIDDEN for a non-admin caller', async () => {
    const caller = callerWith(buildPrisma(), false);
    await expect(caller.admin.createClientWithInvite(BASE_INPUT)).rejects.toThrow(/admin access required/i);
  });

  it('throws CONFLICT when a client with this phone or email already exists', async () => {
    const prisma = buildPrisma({ existingUserForInvite: { id: 'already_here' } });
    const caller = callerWith(prisma);

    await expect(caller.admin.createClientWithInvite(BASE_INPUT)).rejects.toThrow(/already exists/i);
  });

  it('throws NOT_FOUND for an unknown therapist', async () => {
    const prisma = buildPrisma();
    vi.mocked(prisma.therapist.findUnique).mockResolvedValue(null);
    const caller = callerWith(prisma);

    await expect(caller.admin.createClientWithInvite(BASE_INPUT)).rejects.toThrow(/therapist not found/i);
  });

  it('creates User/ClinicalConfig/TherapistClient/InviteToken in one transaction and sends the invite email', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);
    const { sendInviteEmail } = await import('@/lib/email');

    const result = await caller.admin.createClientWithInvite({
      ...BASE_INPUT,
      dateOfBirth: '1995-04-12',
      gender: 'female',
      presentingIssues: ['anxiety', 'sleep'],
      welcomeNote: 'Looking forward to working with you.',
      displayAbbreviation: 'S.',
    });

    expect(result.success).toBe(true);
    expect(result.clientId).toBe('new_client_1');
    expect(result.inviteCode).toBe('GENERATED1');
    expect(result.emailSent).toBe(true);

    const tx = (prisma as unknown as { __txClient: ReturnType<typeof buildTxClient> }).__txClient;
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone_number: BASE_INPUT.phoneNumber,
          email: BASE_INPUT.email,
          full_name: BASE_INPUT.fullName,
        }),
      }),
    );
    expect(tx.clinicalConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'new_client_1',
          care_plan_id: 'CP2',
          assignment_state: 'confirmed',
          presenting_issues: ['anxiety', 'sleep'],
          welcome_note: 'Looking forward to working with you.',
          display_abbreviation: 'S.',
        }),
      }),
    );
    expect(tx.therapistClient.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'new_client_1' },
    });
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: BASE_INPUT.email, clientName: BASE_INPUT.fullName }),
    );
  });
});

describe('admin.resendInvite (therapist-portal wireframes C-07 dashboard "Resend")', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ADMIN.email;
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
    vi.clearAllMocks();
  });

  it('throws FORBIDDEN for a non-admin caller', async () => {
    const caller = callerWith(buildPrisma(), false);
    await expect(
      caller.admin.resendInvite({ clientUserId: 'client_1', therapistId: THERAPIST.id }),
    ).rejects.toThrow(/admin access required/i);
  });

  it('throws NOT_FOUND when the client has no email on file', async () => {
    const prisma = buildPrisma();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: null, full_name: null } as never);
    const caller = callerWith(prisma);

    await expect(
      caller.admin.resendInvite({ clientUserId: 'client_1', therapistId: THERAPIST.id }),
    ).rejects.toThrow(/not found/i);
  });

  it('creates a new InviteToken and sends the invite email', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);
    const { sendInviteEmail } = await import('@/lib/email');

    const result = await caller.admin.resendInvite({ clientUserId: 'client_1', therapistId: THERAPIST.id });

    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(prisma.inviteToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ therapist_id: THERAPIST.id, client_user_id: 'client_1' }),
      }),
    );
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'client@example.com', clientName: 'Shubhangi' }),
    );
  });
});

describe('admin.listPendingInvites (therapist-portal wireframes C-07)', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ADMIN.email;
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
    vi.clearAllMocks();
  });

  it('throws FORBIDDEN for a non-admin caller', async () => {
    const caller = callerWith(buildPrisma(), false);
    await expect(caller.admin.listPendingInvites()).rejects.toThrow(/admin access required/i);
  });

  it('filters out pending clients with no email (only wizard-created clients can be resent)', async () => {
    const prisma = buildPrisma();
    vi.mocked(prisma.therapistClient.findMany).mockResolvedValue([
      {
        therapist_id: THERAPIST.id,
        client_user_id: 'client_with_email',
        created_at: new Date('2026-09-01T00:00:00Z'),
        therapist: { name: THERAPIST.name, email: THERAPIST.email },
        client: { full_name: 'Shubhangi Rao', email: 'shubhangi@example.com', phone_number: '+919876500000' },
      },
      {
        therapist_id: THERAPIST.id,
        client_user_id: 'client_no_email',
        created_at: new Date('2026-09-02T00:00:00Z'),
        therapist: { name: THERAPIST.name, email: THERAPIST.email },
        client: { full_name: null, email: null, phone_number: '+919876500001' },
      },
    ] as never);
    const caller = callerWith(prisma);

    const result = await caller.admin.listPendingInvites();

    expect(result).toHaveLength(1);
    expect(result[0].clientUserId).toBe('client_with_email');
    expect(result[0].clientEmail).toBe('shubhangi@example.com');
  });
});
