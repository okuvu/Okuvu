import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;
const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
const TWENTY_NINE_DAYS_MS = 29 * 24 * 60 * 60 * 1000;

function buildPrisma(overrides: { chatAccessRequestedAt?: Date | null } = {}) {
  return {
    therapist: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue({
        chat_access_requested_at:
          'chatAccessRequestedAt' in overrides ? overrides.chatAccessRequestedAt : null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    clinicalAccessLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

function callerWith(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: 'irrelevant-in-bypass', email: 'irrelevant@okuvu.dev', name: 'Therapist' } },
    prisma,
    headers: new Headers(),
  });
}

// Decisions doc round, 15 Sep 2026 §9 — a re-ask is capped at once per 30
// days, regardless of whether the client has answered.
describe('clients.requestChatAccess — 30-day cap', () => {
  beforeEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
  });

  afterEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
    vi.clearAllMocks();
  });

  it('succeeds when no prior request was ever made', async () => {
    const prisma = buildPrisma({ chatAccessRequestedAt: null });
    const caller = callerWith(prisma);

    const result = await caller.clients.requestChatAccess({ clientUserId: 'client_1' });

    expect(result).toEqual({ success: true });
    expect(prisma.therapistClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { chat_access_requested_at: expect.any(Date) } }),
    );
  });

  it('succeeds when the last request was more than 30 days ago', async () => {
    const prisma = buildPrisma({
      chatAccessRequestedAt: new Date(Date.now() - THIRTY_ONE_DAYS_MS),
    });
    const caller = callerWith(prisma);

    const result = await caller.clients.requestChatAccess({ clientUserId: 'client_1' });

    expect(result).toEqual({ success: true });
  });

  it('rejects when the last request was less than 30 days ago', async () => {
    const prisma = buildPrisma({
      chatAccessRequestedAt: new Date(Date.now() - TWENTY_NINE_DAYS_MS),
    });
    const caller = callerWith(prisma);

    await expect(
      caller.clients.requestChatAccess({ clientUserId: 'client_1' }),
    ).rejects.toThrow(/already asked recently/i);
    expect(prisma.therapistClient.update).not.toHaveBeenCalled();
  });

  it('rejects regardless of whether the client already answered (no grant-state carve-out)', async () => {
    // The cap applies purely off chat_access_requested_at's recency — a
    // client declining doesn't reset the timer any earlier than a real
    // 30-day wait, matching the "capped at once per 30 days" rule as
    // written (not "once per 30 days unless declined").
    const prisma = buildPrisma({
      chatAccessRequestedAt: new Date(Date.now() - TWENTY_NINE_DAYS_MS),
    });
    const caller = callerWith(prisma);

    await expect(
      caller.clients.requestChatAccess({ clientUserId: 'client_1' }),
    ).rejects.toThrow();
  });
});
