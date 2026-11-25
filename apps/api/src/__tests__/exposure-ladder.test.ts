/**
 * The exposure ladder's client door.
 *
 * The rule this file defends (owner, 24 Nov 2026) is that the ladder is the
 * therapist's tool: a client sees only steps that have been unlocked, a step
 * that has not been unlocked answers exactly as an unknown id does, and a
 * before-rating of 80 or more brings up grounding and a pause line instead of
 * carrying on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    exposureStep: { findMany: vi.fn(), findFirst: vi.fn() },
    exposureStepRun: { create: vi.fn() },
  },
}));

import { buildApp } from '../app.js';
import {
  EXPOSURE_PAUSE_GROUNDING_TOOL_ID,
  EXPOSURE_PAUSE_MESSAGE,
  EXPOSURE_PAUSE_THRESHOLD,
  exposurePauseNeeded,
} from '@okuvu/shared-types/safety';

const ORIGINAL_ENV = { ...process.env };
const USER_ID = 'user-1';

async function prismaMock() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma as unknown as Record<string, any>;
}

describe('the client’s exposure ladder', () => {
  let db: Record<string, any>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    db = await prismaMock();
    db.user.findUnique.mockReset();
    db.exposureStep.findMany.mockReset();
    db.exposureStep.findFirst.mockReset();
    db.exposureStepRun.create.mockReset();
    db.user.findUnique.mockResolvedValue({ id: USER_ID });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('lists only unlocked steps, and never the therapist’s difficulty as a verdict', async () => {
    db.exposureStep.findMany.mockResolvedValue([
      {
        id: 's1',
        label: 'walk to the end of the road',
        difficulty: 40,
        position: 0,
        runs: [],
      },
    ]);

    const server = await buildApp();
    const response = await server.inject({ method: 'GET', url: '/exposure-ladder' });

    expect(response.statusCode).toBe(200);
    expect(db.exposureStep.findMany.mock.calls[0][0].where).toMatchObject({
      client_user_id: USER_ID,
      unlocked_at: { not: null },
    });
    expect(response.json().steps).toHaveLength(1);
  });

  it('refuses a rating that is not a whole number 0-100', async () => {
    const server = await buildApp();
    for (const before of [-1, 101, 4.5, '80', null]) {
      const response = await server.inject({
        method: 'POST',
        url: '/exposure-ladder/s1/run',
        payload: { before },
      });
      expect(response.statusCode, String(before)).toBe(400);
    }
    expect(db.exposureStepRun.create).not.toHaveBeenCalled();
  });

  it('answers 404 for a locked step, exactly as an unknown id', async () => {
    db.exposureStep.findFirst.mockResolvedValue(null);

    const server = await buildApp();
    const response = await server.inject({
      method: 'POST',
      url: '/exposure-ladder/locked/run',
      payload: { before: 30 },
    });

    expect(response.statusCode).toBe(404);
    // The query is what enforces it: unlocked and theirs, or nothing.
    expect(db.exposureStep.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'locked',
      client_user_id: USER_ID,
      unlocked_at: { not: null },
    });
  });

  it('records a rating and stays quiet below 80', async () => {
    db.exposureStep.findFirst.mockResolvedValue({ id: 's1' });
    db.exposureStepRun.create.mockResolvedValue({ id: 'run-1', created_at: new Date() });

    const server = await buildApp();
    const response = await server.inject({
      method: 'POST',
      url: '/exposure-ladder/s1/run',
      payload: { before: 79, after: 60 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.pause).toBe(false);
    expect(body.pauseMessage).toBeNull();
    expect(body.groundingToolId).toBeNull();
  });

  it('offers grounding and a pause at 80, and does not grade the step', async () => {
    db.exposureStep.findFirst.mockResolvedValue({ id: 's1' });
    db.exposureStepRun.create.mockResolvedValue({ id: 'run-1', created_at: new Date() });

    const server = await buildApp();
    const response = await server.inject({
      method: 'POST',
      url: '/exposure-ladder/s1/run',
      payload: { before: 80 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.pause).toBe(true);
    expect(body.pauseMessage).toBe(EXPOSURE_PAUSE_MESSAGE);
    expect(body.groundingToolId).toBe(EXPOSURE_PAUSE_GROUNDING_TOOL_ID);
    // The run is still recorded: the client's number is theirs, and a pause is
    // not a refusal.
    expect(db.exposureStepRun.create).toHaveBeenCalledTimes(1);
  });

  it('reads the threshold from one constant, so the screen and the route agree', () => {
    expect(EXPOSURE_PAUSE_THRESHOLD).toBe(80);
    expect(exposurePauseNeeded(79)).toBe(false);
    expect(exposurePauseNeeded(80)).toBe(true);
    expect(exposurePauseNeeded(100)).toBe(true);
    // A value it cannot read is not a pause, and it is not a pass either.
    expect(exposurePauseNeeded(null)).toBe(false);
    expect(exposurePauseNeeded(Number.NaN)).toBe(false);
    expect(exposurePauseNeeded(80.5)).toBe(false);
  });
});
