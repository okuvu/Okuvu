import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { getISTDateString } from '@okuvu/shared-types';

const mockDeleteMany = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  getPrisma: () => ({
    sessionLimit: { deleteMany: mockDeleteMany },
  }),
}));

describe('POST /cleanup/session-limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  it('deletes rows using IST-based cutoff and preserves today\'s bucket', async () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mockDeleteMany.mockResolvedValue({ count: 5 });

    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/cleanup/session-limits?retention_days=30',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      deleted: number;
      retention_days: number;
      cutoff_date: string;
    };
    expect(body.deleted).toBe(5);
    expect(body.retention_days).toBe(30);

    const cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const expectedIST = getISTDateString(cutoffDate);
    expect(body.cutoff_date).toBe(expectedIST);

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { date_ist: { lt: expectedIST } },
    });

    const todayIST = getISTDateString(now);
    expect(todayIST).not.toBe(expectedIST);
    expect(todayIST > expectedIST).toBe(true);

    await app.close();
  });

  it('uses default retention of 30 days when not specified', async () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mockDeleteMany.mockResolvedValue({ count: 0 });

    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/cleanup/session-limits',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as { retention_days: number };
    expect(body.retention_days).toBe(30);

    await app.close();
  });
});
