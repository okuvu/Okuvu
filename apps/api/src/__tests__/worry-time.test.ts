/**
 * Worry time: the parked list and its daily reminder.
 *
 * Two properties matter here and both are the owner's:
 *
 *  - a parked worry is client-typed text, so it goes through the same safety
 *    check as the journal before it is stored, and a crisis writes a flag that
 *    carries a pointer and no content;
 *  - the reminder is idempotent per IST day and sends nothing early, so a retried
 *    sweep cannot double-send or skip a day.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockClassifySafety = vi.hoisted(() => vi.fn());
const mockSendWorryTimeEmail = vi.hoisted(() => vi.fn());

/**
 * The reminder copy is not approved yet, which is a real production state. These
 * tests are about the sweep's behaviour, so the flag is a switch here: approved
 * for the send tests, unapproved for the one that checks nothing is mailed.
 */
const copy = vi.hoisted(() => ({ approved: true }));

vi.mock('../agents/a1/agent.js', () => ({ classifySafety: mockClassifySafety }));
vi.mock('../lib/email.js', () => ({ sendWorryTimeEmail: mockSendWorryTimeEmail }));
vi.mock('@okuvu/shared-types/worksheets/anxiety-worry', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get WORRY_REMINDER_COPY_APPROVED() {
      return copy.approved;
    },
  };
});

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    worryTimeSetting: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    worryParked: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    safetyFlag: { create: vi.fn() },
    therapistClient: { findMany: vi.fn() },
  },
}));

import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };
const USER_ID = 'user-1';

function classified(state: string) {
  return {
    safetyState: state,
    fallbackUsed: false,
    crisis_language_detected: state === 'S4',
    basis: 'literal',
    signal_strength: 'high',
    notes: null,
  };
}

async function prismaMock() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma as unknown as Record<string, any>;
}

async function app() {
  return buildApp();
}

describe('worry time', () => {
  let db: Record<string, any>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    db = await prismaMock();
    for (const group of Object.values(db)) {
      if (group && typeof group === 'object') {
        for (const fn of Object.values(group as Record<string, unknown>)) {
          if (typeof fn === 'function' && 'mockReset' in fn) (fn as any).mockReset();
        }
      }
    }
    db.user.findUnique.mockResolvedValue({ id: USER_ID });
    db.therapistClient.findMany.mockResolvedValue([]);
    mockClassifySafety.mockReset();
    mockClassifySafety.mockResolvedValue(classified('S1'));
    mockSendWorryTimeEmail.mockReset();
    mockSendWorryTimeEmail.mockReset();
    mockSendWorryTimeEmail.mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns the setting and the parked list, and nothing else', async () => {
    db.worryTimeSetting.findUnique.mockResolvedValue({
      time_ist: '19:00',
      minutes: 10,
      active: true,
      last_reminded_on: null,
    });
    db.worryParked.findMany.mockResolvedValue([
      { id: 'w1', text: 'the email I have not sent', created_at: new Date('2026-11-24T10:00:00Z') },
    ]);

    const server = await app();
    const response = await server.inject({ method: 'GET', url: '/worry-time' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.setting).toMatchObject({ time: '19:00', minutes: 10, active: true });
    expect(body.parked).toHaveLength(1);
    expect(body.parked[0].text).toBe('the email I have not sent');
    // Only parked rows: a resolved worry is not on today's list.
    expect(db.worryParked.findMany.mock.calls[0][0].where).toMatchObject({
      user_id: USER_ID,
      status: 'parked',
    });
  });

  it('refuses a time it cannot send at, and keeps the old setting', async () => {
    const server = await app();
    for (const time of ['7pm', '25:00', '19:60', '']) {
      const response = await server.inject({
        method: 'PUT',
        url: '/worry-time/settings',
        payload: { time },
      });
      expect(response.statusCode, time).toBe(400);
    }
    expect(db.worryTimeSetting.upsert).not.toHaveBeenCalled();
  });

  it('saves a daily time and length', async () => {
    db.worryTimeSetting.upsert.mockResolvedValue({
      time_ist: '19:00',
      minutes: 15,
      active: true,
      last_reminded_on: null,
    });

    const server = await app();
    const response = await server.inject({
      method: 'PUT',
      url: '/worry-time/settings',
      payload: { time: '19:00', minutes: 15 },
    });

    expect(response.statusCode).toBe(200);
    expect(db.worryTimeSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID },
        create: expect.objectContaining({ time_ist: '19:00', minutes: 15 }),
      }),
    );
  });

  it('parks a worry and stores exactly what the client wrote', async () => {
    db.worryParked.create.mockResolvedValue({ id: 'w1', created_at: new Date() });

    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/worry-time/parked',
      payload: { text: '  money  ' },
    });

    expect(response.statusCode).toBe(201);
    expect(db.worryParked.create).toHaveBeenCalledWith({
      data: { user_id: USER_ID, text: 'money' },
      select: { id: true, created_at: true },
    });
    expect(response.json().safety.showHelp).toBe(false);
  });

  it('screens a parked worry exactly as the journal screens an entry', async () => {
    mockClassifySafety.mockResolvedValue(classified('S3'));
    db.worryParked.create.mockResolvedValue({ id: 'w1', created_at: new Date() });
    db.safetyFlag.create.mockResolvedValue({
      id: 'flag-1',
      user_id: USER_ID,
      level: 'S3',
      occurred_at: new Date(),
      urgent: false,
    });

    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/worry-time/parked',
      payload: { text: "I don't want to be here anymore" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.safety.showHelp).toBe(true);
    expect(db.safetyFlag.create).toHaveBeenCalledTimes(1);
    const data = db.safetyFlag.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      user_id: USER_ID,
      level: 'S3',
      subject_kind: 'worry_parked',
      subject_id: 'w1',
    });
    // The flag points at the row and never carries the client's words.
    expect(JSON.stringify(data)).not.toContain('anymore');
  });

  it('answers an empty worry with a question rather than a saved row', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/worry-time/parked',
      payload: { text: '   ' },
    });
    expect(response.statusCode).toBe(400);
    expect(db.worryParked.create).not.toHaveBeenCalled();
  });

  it('marks a worry still bothering or not anymore, and refuses anything else', async () => {
    db.worryParked.findFirst.mockResolvedValue({ id: 'w1' });

    const server = await app();
    const bad = await server.inject({
      method: 'POST',
      url: '/worry-time/parked/w1/resolve',
      payload: { status: 'gone' },
    });
    expect(bad.statusCode).toBe(400);

    const good = await server.inject({
      method: 'POST',
      url: '/worry-time/parked/w1/resolve',
      payload: { status: 'released' },
    });
    expect(good.statusCode).toBe(200);
    expect(db.worryParked.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: expect.objectContaining({ status: 'released' }),
    });
  });

  it('answers 404 for a worry that is not the caller’s', async () => {
    db.worryParked.findFirst.mockResolvedValue(null);
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/worry-time/parked/someone-elses/resolve',
      payload: { status: 'still' },
    });
    expect(response.statusCode).toBe(404);
    expect(db.worryParked.update).not.toHaveBeenCalled();
  });

  it('deletes a parked worry outright, and 404s an unknown one', async () => {
    db.worryParked.deleteMany.mockResolvedValue({ count: 0 });
    const server = await app();
    const missing = await server.inject({ method: 'DELETE', url: '/worry-time/parked/nope' });
    expect(missing.statusCode).toBe(404);

    db.worryParked.deleteMany.mockResolvedValue({ count: 1 });
    const ok = await server.inject({ method: 'DELETE', url: '/worry-time/parked/w1' });
    expect(ok.statusCode).toBe(200);
  });
});

describe('the worry-time reminder sweep', () => {
  let db: Record<string, any>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    db = await prismaMock();
    for (const group of Object.values(db)) {
      if (group && typeof group === 'object') {
        for (const fn of Object.values(group as Record<string, unknown>)) {
          if (typeof fn === 'function' && 'mockReset' in fn) (fn as any).mockReset();
        }
      }
    }
    mockClassifySafety.mockReset();
    mockSendWorryTimeEmail.mockReset();
    copy.approved = true;
    mockSendWorryTimeEmail.mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('sends nothing at all while the wording is unapproved', async () => {
    // The owner approves every client-facing string. A reminder arrives on a
    // phone by itself, so an unapproved sentence is a sentence nobody signed.
    copy.approved = false;
    process.env.OKUVU_INTERNAL_SECRET = 'secret';
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/internal/worry-time/reminders',
      headers: { 'x-okuvu-internal': 'secret' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sent: 0, skipped: 0, waitingForApproval: true });
    expect(db.worryTimeSetting.findMany).not.toHaveBeenCalled();
    expect(mockSendWorryTimeEmail).not.toHaveBeenCalled();
  });

  it('is inert when no secret is configured', async () => {
    delete process.env.OKUVU_INTERNAL_SECRET;
    const server = await app();
    const response = await server.inject({ method: 'POST', url: '/internal/worry-time/reminders' });
    expect(response.statusCode).toBe(503);
    expect(db.worryTimeSetting.findMany).not.toHaveBeenCalled();
  });

  it('refuses a caller without the shared secret', async () => {
    process.env.OKUVU_INTERNAL_SECRET = 'secret';
    const server = await app();
    const response = await server.inject({ method: 'POST', url: '/internal/worry-time/reminders' });
    expect(response.statusCode).toBe(401);
  });

  it('sends once the client’s time has passed, and records the day', async () => {
    process.env.OKUVU_INTERNAL_SECRET = 'secret';
    db.worryTimeSetting.findMany.mockResolvedValue([
      {
        user_id: USER_ID,
        time_ist: '00:00',
        minutes: 10,
        last_reminded_on: null,
        user: { email: 'client@example.com', name: null },
      },
    ]);
    db.worryParked.count.mockResolvedValue(2);
    db.worryTimeSetting.update.mockResolvedValue({});

    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/internal/worry-time/reminders',
      headers: { 'x-okuvu-internal': 'secret' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sent: 1, skipped: 0 });
    expect(mockSendWorryTimeEmail).toHaveBeenCalledWith({
      to: 'client@example.com',
      name: null,
      minutes: 10,
      parkedCount: 2,
    });
    expect(db.worryTimeSetting.update).toHaveBeenCalledWith({
      where: { user_id: USER_ID },
      data: { last_reminded_on: expect.any(Date) },
    });
  });

  it('does not send a second time on the same day', async () => {
    process.env.OKUVU_INTERNAL_SECRET = 'secret';
    const today = new Date();
    db.worryTimeSetting.findMany.mockResolvedValue([
      {
        user_id: USER_ID,
        time_ist: '00:00',
        minutes: 10,
        last_reminded_on: today,
        user: { email: 'client@example.com', name: null },
      },
    ]);

    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/internal/worry-time/reminders',
      headers: { 'x-okuvu-internal': 'secret' },
    });

    expect(response.json()).toEqual({ sent: 0, skipped: 1 });
    expect(mockSendWorryTimeEmail).not.toHaveBeenCalled();
  });

  it('sends nothing before the time the client chose', async () => {
    process.env.OKUVU_INTERNAL_SECRET = 'secret';
    db.worryTimeSetting.findMany.mockResolvedValue([
      {
        user_id: USER_ID,
        time_ist: '23:59',
        minutes: 10,
        last_reminded_on: null,
        user: { email: 'client@example.com', name: null },
      },
    ]);
    // Pin the clock so the assertion cannot flip at 23:59.
    const fixed = new Date('2026-11-24T02:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixed);
    try {
      const server = await app();
      const response = await server.inject({
        method: 'POST',
        url: '/internal/worry-time/reminders',
        headers: { 'x-okuvu-internal': 'secret' },
      });
      expect(response.json()).toEqual({ sent: 0, skipped: 1 });
      expect(mockSendWorryTimeEmail).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
