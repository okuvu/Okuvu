import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    blindedReviewItem: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    reviewRating: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');
const { reviewRouter } = await import('../server/routers/review');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(reviewRouter);

function buildCtx(role: 'RATER' | 'PI' | 'ENGINEER', userId = 'rater-1') {
  return {
    session: {
      user: {
        id: userId,
        email: `${userId}@evia.dev`,
        name: 'Test User',
        role,
        environments: ['sandbox', 'staging', 'beta'],
      },
    },
    user: {
      id: userId,
      email: `${userId}@evia.dev`,
      name: 'Test User',
      role,
      environments: ['sandbox', 'staging', 'beta'],
    },
    prisma,
  } as any;
}

describe('reviewRouter.getBlindedItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only { id, output } — no run_id, rater_id, or unblinded_at keys present', async () => {
    (prisma!.reviewRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma!.blindedReviewItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'item-1', output: 'some model output text' },
      { id: 'item-2', output: 'another output' },
    ]);

    const caller = createCaller(buildCtx('RATER'));
    const items = await caller.getBlindedItems({});

    expect(items.length).toBe(2);
    for (const item of items) {
      const keys = Object.keys(item);
      expect(keys).not.toContain('run_id');
      expect(keys).not.toContain('rater_id');
      expect(keys).not.toContain('unblinded_at');
      expect(keys).not.toContain('rubric_scores');
      expect(keys.sort()).toEqual(['id', 'output']);
    }

    // Confirm the Prisma select itself never asked for those fields.
    const call = (prisma!.blindedReviewItem.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.select).toEqual({ id: true, output: true });
  });

  it('excludes items the current rater has already rated', async () => {
    (prisma!.reviewRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { item_id: 'item-1' },
    ]);
    (prisma!.blindedReviewItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'item-2', output: 'another output' },
    ]);

    const caller = createCaller(buildCtx('RATER'));
    await caller.getBlindedItems({});

    const call = (prisma!.blindedReviewItem.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toEqual({ id: { notIn: ['item-1'] } });
  });

  it('produces a stable order across repeated calls for the same rater', async () => {
    (prisma!.reviewRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const rawItems = [
      { id: 'item-a', output: 'a' },
      { id: 'item-b', output: 'b' },
      { id: 'item-c', output: 'c' },
      { id: 'item-d', output: 'd' },
    ];
    (prisma!.blindedReviewItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rawItems);

    const caller = createCaller(buildCtx('RATER', 'rater-xyz'));
    const first = await caller.getBlindedItems({});
    const second = await caller.getBlindedItems({});

    expect(first.map((i) => i.id)).toEqual(second.map((i) => i.id));
  });

  it('rejects users with role ENGINEER', async () => {
    const caller = createCaller(buildCtx('ENGINEER'));
    await expect(caller.getBlindedItems({})).rejects.toThrow(TRPCError);
  });
});

describe('reviewRouter.submitRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts on the (item_id, rater_id) compound key', async () => {
    (prisma!.reviewRating.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'rating-1',
      item_id: 'item-1',
      rater_id: 'rater-1',
      scores: { clarity: 4 },
    });

    const caller = createCaller(buildCtx('RATER'));
    await caller.submitRating({ itemId: 'item-1', scores: { clarity: 4 } });

    expect(prisma!.reviewRating.upsert).toHaveBeenCalledTimes(1);
    const call = (prisma!.reviewRating.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toEqual({
      item_id_rater_id: { item_id: 'item-1', rater_id: 'rater-1' },
    });
    expect(call.create.scores).toEqual({ clarity: 4 });
    expect(call.update.scores).toEqual({ clarity: 4 });
  });
});

describe('reviewRouter.computeKappa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes kappa between two raters who rated the same items', async () => {
    (prisma!.reviewRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { item_id: 'item-1', rater_id: 'rater-A', scores: { clarity: 5 } },
      { item_id: 'item-1', rater_id: 'rater-B', scores: { clarity: 5 } },
      { item_id: 'item-2', rater_id: 'rater-A', scores: { clarity: 3 } },
      { item_id: 'item-2', rater_id: 'rater-B', scores: { clarity: 3 } },
    ]);

    const caller = createCaller(buildCtx('PI'));
    const result = await caller.computeKappa({});

    expect(result.raterPairs.length).toBe(1);
    expect(result.raterPairs[0].n).toBe(2);
    expect(result.raterPairs[0].kappa).toBeCloseTo(1.0, 10);
    expect(result.overallKappa).toBeCloseTo(1.0, 10);
  });

  it('returns an empty raterPairs array when fewer than two raters overlap', async () => {
    (prisma!.reviewRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { item_id: 'item-1', rater_id: 'rater-A', scores: { clarity: 5 } },
    ]);

    const caller = createCaller(buildCtx('PI'));
    const result = await caller.computeKappa({});

    expect(result.raterPairs).toEqual([]);
    expect(result.overallKappa).toBeUndefined();
  });

  it('rejects users with role ENGINEER', async () => {
    const caller = createCaller(buildCtx('ENGINEER'));

    await expect(caller.computeKappa({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prisma!.reviewRating.findMany).not.toHaveBeenCalled();
  });
});

describe('reviewRouter.unblindResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows PI to unblind and sets unblinded_at', async () => {
    (prisma!.blindedReviewItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'item-1',
      run_id: 'run-42',
      output: 'output text',
      rubric_scores: {},
      rater_id: null,
      unblinded_at: new Date('2026-08-19T00:00:00Z'),
      created_at: new Date('2026-01-01T00:00:00Z'),
    });

    const caller = createCaller(buildCtx('PI'));
    const result = await caller.unblindResults({ itemId: 'item-1' });

    expect(prisma!.blindedReviewItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { unblinded_at: expect.any(Date) },
    });
    expect(result.run_id).toBe('run-42');
    expect(result.unblinded_at).toBeInstanceOf(Date);
  });

  it('rejects non-PI users with FORBIDDEN', async () => {
    const caller = createCaller(buildCtx('RATER'));
    await expect(caller.unblindResults({ itemId: 'item-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
