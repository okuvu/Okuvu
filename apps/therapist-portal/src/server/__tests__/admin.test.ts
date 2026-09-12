import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const ADMIN = { id: 'admin_1', email: 'admin@okuvu.in', name: 'Admin' };
const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const CLIENT = { id: 'client_1', phone_number: '+919876543210' };

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

interface PrismaOverrides {
  existingAssignment?: unknown;
  client?: unknown;
}

function buildPrisma(overrides: PrismaOverrides = {}) {
  return {
    user: {
      findFirst: vi.fn().mockResolvedValue('client' in overrides ? overrides.client : CLIENT),
      update: vi.fn().mockResolvedValue({}),
    },
    therapist: {
      findUnique: vi.fn().mockResolvedValue(THERAPIST),
      findMany: vi.fn().mockResolvedValue([]),
    },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue(overrides.existingAssignment ?? null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
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
