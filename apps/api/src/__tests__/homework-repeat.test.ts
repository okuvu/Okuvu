import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    homework: { findUnique: vi.fn(), update: vi.fn() },
    homeworkCompletion: { create: vi.fn() },
  },
}));

const CLIENT_ID = 'client-1';
const HOMEWORK_ID = 'hw-1';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    client_user_id: CLIENT_ID,
    status: 'active',
    frequency: null,
    reminder_time: null,
    due_at: null,
    ...overrides,
  };
}

describe('repeating assignments — the owner’s Step 6 correction', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const prisma = await importMocks();
    vi.mocked(prisma.homework.update).mockResolvedValue({ status: 'active' } as any);
    vi.mocked(prisma.homeworkCompletion.create).mockResolvedValue({} as any);
  });

  it('closes a one-off assignment when it is finished', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findUnique).mockResolvedValue(row() as any);
    vi.mocked(prisma.homework.update).mockResolvedValue({ status: 'completed' } as any);

    const { completeHomework } = await import('../lib/homework.js');
    const result = await completeHomework(CLIENT_ID, HOMEWORK_ID);

    expect(result).toMatchObject({
      status: 'ok',
      homeworkStatus: 'completed',
      repeats: false,
      nextDueAt: null,
    });
    const update = vi.mocked(prisma.homework.update).mock.calls[0][0] as any;
    expect(update.data.status).toBe('completed');
  });

  it('keeps a repeating assignment active, marks today done, and sets the next day', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findUnique).mockResolvedValue(
      row({ frequency: 'once_daily', reminder_time: '21:00' }) as any,
    );

    const { completeHomework } = await import('../lib/homework.js');
    const result = await completeHomework(CLIENT_ID, HOMEWORK_ID, 'worksheet');

    expect(result).toMatchObject({ status: 'ok', homeworkStatus: 'active', repeats: true });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.nextDueAt).not.toBeNull();

    const update = vi.mocked(prisma.homework.update).mock.calls[0][0] as any;
    expect(update.data.status).toBe('active');
    expect(update.data.last_completed_at).toBeInstanceOf(Date);
    expect(update.data.due_at).toBeInstanceOf(Date);

    // The next showing is tomorrow at the therapist's 21:00 IST = 15:30 UTC.
    const next = update.data.due_at as Date;
    expect(next.getUTCHours()).toBe(15);
    expect(next.getUTCMinutes()).toBe(30);

    expect(prisma.homeworkCompletion.create).toHaveBeenCalledWith({
      data: { homework_id: HOMEWORK_ID, client_user_id: CLIENT_ID, source: 'worksheet' },
    });
  });

  it('is idempotent for an assignment that is already closed', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findUnique).mockResolvedValue(row({ status: 'completed' }) as any);

    const { completeHomework } = await import('../lib/homework.js');
    const result = await completeHomework(CLIENT_ID, HOMEWORK_ID);

    expect(result).toMatchObject({ status: 'ok', homeworkStatus: 'completed', repeats: false });
    expect(prisma.homework.update).not.toHaveBeenCalled();
  });

  it('refuses an assignment that belongs to another client', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findUnique).mockResolvedValue(
      row({ client_user_id: 'someone-else' }) as any,
    );

    const { completeHomework } = await import('../lib/homework.js');
    const result = await completeHomework(CLIENT_ID, HOMEWORK_ID);

    expect(result).toEqual({ status: 'not_found' });
    expect(prisma.homework.update).not.toHaveBeenCalled();
  });

  it('treats only the repeating vocabulary as repeating', async () => {
    const { isRepeatingFrequency } = await import('../lib/homework.js');

    expect(isRepeatingFrequency('once_daily')).toBe(true);
    expect(isRepeatingFrequency('twice_daily')).toBe(true);
    expect(isRepeatingFrequency('thrice_daily')).toBe(true);
    expect(isRepeatingFrequency('as_needed')).toBe(true);
    expect(isRepeatingFrequency('once')).toBe(false);
    expect(isRepeatingFrequency(null)).toBe(false);
    expect(isRepeatingFrequency('off')).toBe(false);
  });

  it('measures "today" in the client’s IST day, not UTC', async () => {
    const { startOfIstDay } = await import('../lib/homework.js');

    // 2026-11-09 23:30 IST is 18:00 UTC on the 9th; its IST day began at
    // 00:00 IST = 18:30 UTC on the 8th. A UTC midnight would have said the
    // 9th, three and a half hours later than the client's day.
    const lateEveningIst = new Date('2026-11-09T18:00:00Z');
    expect(startOfIstDay(lateEveningIst).toISOString()).toBe('2026-11-08T18:30:00.000Z');
  });
});
