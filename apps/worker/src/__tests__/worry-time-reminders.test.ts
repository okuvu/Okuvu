import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWorryReminderCopyApproved,
  istParts,
  reminderConfigFromEnv,
  runWorryTimeReminders,
  WorryTimeReminderScheduler,
  type FetchLike,
  type ReminderLogger,
  type ReminderResponse,
} from '../lib/worry-time-reminders.js';
import { buildApp } from '../app.js';

/**
 * The worry-time reminder trigger: it must be as boring as possible.
 *
 * The api owns who gets an email and whether they already got one today
 * (`last_reminded_on`), so these tests deliberately assert that this side
 * calls the endpoint and does *not* invent its own dedupe. The only state the
 * scheduler keeps is the slot it already fired, which is a timer concern.
 */

const IST_2000 = new Date('2026-11-25T14:30:00Z'); // 20:00 IST
const IST_2030 = new Date('2026-11-25T15:00:00Z'); // 20:30 IST

function mockLogger(): ReminderLogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

interface RecordedCall {
  url: string;
  init: Parameters<FetchLike>[1];
}

function stubFetch(body: unknown = { sent: 2, skipped: 3 }): {
  fetchImpl: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const response: ReminderResponse = {
      ok: true,
      status: 200,
      json: async () => body,
    };
    return response;
  };
  return { fetchImpl, calls };
}

function baseDeps(overrides: Partial<Parameters<typeof runWorryTimeReminders>[0]> = {}) {
  return {
    apiBaseUrl: 'http://api.okuvu.local:8080',
    internalSecret: 'shared-secret',
    copyApproved: () => true,
    log: mockLogger(),
    ...overrides,
  };
}

describe('runWorryTimeReminders', () => {
  it('does not call the api while the reminder copy is unapproved', async () => {
    const { fetchImpl, calls } = stubFetch();
    const log = mockLogger();

    const result = await runWorryTimeReminders(
      baseDeps({ copyApproved: () => false, fetchImpl, log }),
    );

    expect(result).toEqual({ status: 'copy_not_approved' });
    expect(calls).toHaveLength(0);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('calls the sweep once with the internal header when the copy is approved', async () => {
    const { fetchImpl, calls } = stubFetch({ sent: 4, skipped: 1 });

    const result = await runWorryTimeReminders(baseDeps({ fetchImpl }));

    expect(result).toEqual({ status: 'ok', http_status: 200, sent: 4, skipped: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://api.okuvu.local:8080/internal/worry-time/reminders');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['x-okuvu-internal']).toBe('shared-secret');
  });

  it('logs an api error and stays alive for the next run', async () => {
    const log = mockLogger();
    let call = 0;
    const fetchImpl: FetchLike = async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
      }
      return { ok: true, status: 200, json: async () => ({ sent: 1, skipped: 0 }) };
    };

    const failed = await runWorryTimeReminders(baseDeps({ fetchImpl, log }));

    expect(failed).toEqual({ status: 'failed', http_status: 500, reason: 'HTTP 500' });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toMatchObject({
      event: 'worry_time_reminder_failed',
      http_status: 500,
    });

    // The next scheduled run still works: the failure was contained.
    const recovered = await runWorryTimeReminders(baseDeps({ fetchImpl, log }));
    expect(recovered).toEqual({ status: 'ok', http_status: 200, sent: 1, skipped: 0 });
  });

  it('contains a network failure and logs it instead of rejecting', async () => {
    const log = mockLogger();
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };

    const result = await runWorryTimeReminders(baseDeps({ fetchImpl, log }));

    expect(result).toEqual({ status: 'failed', reason: 'ECONNREFUSED' });
    expect(log.error.mock.calls[0][0]).toMatchObject({
      event: 'worry_time_reminder_failed',
      err: 'ECONNREFUSED',
    });
  });

  it('invokes the api once per run on the same IST day — the api owns per-day dedupe', async () => {
    const { fetchImpl, calls } = stubFetch();

    const first = await runWorryTimeReminders(baseDeps({ fetchImpl }));
    const second = await runWorryTimeReminders(baseDeps({ fetchImpl }));

    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    // Two runs, two calls, no local "already reminded today" suppression.
    expect(calls).toHaveLength(2);
  });

  it('is inert and logs clearly when the internal secret is unset', async () => {
    const { fetchImpl, calls } = stubFetch();
    const log = mockLogger();

    const result = await runWorryTimeReminders(
      baseDeps({ internalSecret: null, fetchImpl, log }),
    );

    expect(result).toEqual({ status: 'not_configured', missing: 'OKUVU_INTERNAL_SECRET' });
    expect(calls).toHaveLength(0);
    expect(log.error.mock.calls[0][0]).toMatchObject({
      event: 'worry_time_reminder_not_configured',
      missing: 'OKUVU_INTERNAL_SECRET',
    });
  });

  it('is inert when the api base url is unset', async () => {
    const { fetchImpl, calls } = stubFetch();

    const result = await runWorryTimeReminders(baseDeps({ apiBaseUrl: null, fetchImpl }));

    expect(result).toEqual({ status: 'not_configured', missing: 'OKUVU_API_URL' });
    expect(calls).toHaveLength(0);
  });
});

describe('WorryTimeReminderScheduler', () => {
  it('logs once that it is waiting on copy approval and never calls the api', async () => {
    const { fetchImpl, calls } = stubFetch();
    const log = mockLogger();
    const scheduler = new WorryTimeReminderScheduler({
      apiBaseUrl: 'http://api.okuvu.local:8080',
      internalSecret: 'shared-secret',
      hourIst: 20,
      tickIntervalMs: 60_000,
      copyApproved: () => false,
      fetchImpl,
      log,
    });

    expect(await scheduler.tick(IST_2000)).toEqual({ status: 'copy_not_approved' });
    // A later tick in the same IST hour is not the daily slot again.
    expect(await scheduler.tick(IST_2030)).toBeNull();

    const notices = log.info.mock.calls.filter(
      (call) => call[0]?.event === 'worry_time_reminder_waiting_for_copy_approval',
    );
    expect(notices).toHaveLength(1);
    expect(notices[0][1]).toContain('WORRY_REMINDER_COPY_APPROVED=false');
    expect(calls).toHaveLength(0);
  });

  it('fires once in the configured IST hour and ignores ticks outside it', async () => {
    const { fetchImpl, calls } = stubFetch({ sent: 1, skipped: 0 });
    const scheduler = new WorryTimeReminderScheduler({
      apiBaseUrl: 'http://api.okuvu.local:8080',
      internalSecret: 'shared-secret',
      hourIst: 20,
      tickIntervalMs: 60_000,
      copyApproved: () => true,
      fetchImpl,
      log: mockLogger(),
    });

    expect(await scheduler.tick(new Date('2026-11-25T10:00:00Z'))).toBeNull(); // 15:30 IST
    expect(calls).toHaveLength(0);

    expect((await scheduler.tick(IST_2000))?.status).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(await scheduler.tick(IST_2030)).toBeNull();
    expect(calls).toHaveLength(1);

    // The next IST day is a new slot.
    expect((await scheduler.tick(new Date('2026-11-26T14:30:00Z')))?.status).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('catches the day up when the first tick is after the configured hour', async () => {
    const { fetchImpl, calls } = stubFetch({ sent: 2, skipped: 0 });
    const scheduler = new WorryTimeReminderScheduler({
      apiBaseUrl: 'http://api.okuvu.local:8080',
      internalSecret: 'shared-secret',
      hourIst: 20,
      tickIntervalMs: 60_000,
      copyApproved: () => true,
      fetchImpl,
      log: mockLogger(),
    });

    // 22:00 IST — a process that started after 20:00 still runs the sweep.
    expect((await scheduler.tick(new Date('2026-11-25T16:30:00Z')))?.status).toBe('ok');
    // 23:00 IST, same day — the slot has fired, so no second call.
    expect(await scheduler.tick(new Date('2026-11-25T17:30:00Z'))).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('schedules nothing and logs why when the secret is unset', () => {
    const log = mockLogger();
    const setIntervalImpl = vi.fn();
    const scheduler = new WorryTimeReminderScheduler({
      apiBaseUrl: 'http://api.okuvu.local:8080',
      internalSecret: null,
      hourIst: 20,
      tickIntervalMs: 60_000,
      copyApproved: () => true,
      log,
      setIntervalImpl: setIntervalImpl as never,
    });

    scheduler.start();

    expect(setIntervalImpl).not.toHaveBeenCalled();
    expect(log.error.mock.calls[0][0]).toMatchObject({
      event: 'worry_time_reminder_disabled',
      missing: ['OKUVU_INTERNAL_SECRET'],
    });
  });

  it('starts the timer but says once that it is waiting on copy approval', async () => {
    const { fetchImpl, calls } = stubFetch();
    const log = mockLogger();
    const setIntervalImpl = vi.fn();
    const scheduler = new WorryTimeReminderScheduler({
      apiBaseUrl: 'http://api.okuvu.local:8080',
      internalSecret: 'shared-secret',
      hourIst: 20,
      tickIntervalMs: 60_000,
      copyApproved: () => false,
      fetchImpl,
      log,
      setIntervalImpl: setIntervalImpl as never,
    });

    scheduler.start();
    expect(setIntervalImpl).toHaveBeenCalledTimes(1);

    await scheduler.tick(IST_2000);

    const notices = log.info.mock.calls.filter(
      (call) => call[0]?.event === 'worry_time_reminder_waiting_for_copy_approval',
    );
    expect(notices).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it('never rejects when the injected fetch throws', async () => {
    const log = mockLogger();
    const scheduler = new WorryTimeReminderScheduler({
      apiBaseUrl: 'http://api.okuvu.local:8080',
      internalSecret: 'shared-secret',
      hourIst: 20,
      tickIntervalMs: 60_000,
      copyApproved: () => true,
      fetchImpl: async () => {
        throw new Error('socket hang up');
      },
      log,
    });

    await expect(scheduler.tick(IST_2000)).resolves.toMatchObject({ status: 'failed' });
    expect(log.error).toHaveBeenCalled();
  });
});

describe('reminderConfigFromEnv / helpers', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('defaults to 20:00 IST and reads the url and secret', () => {
    process.env.OKUVU_API_URL = 'http://api.okuvu.local:8080';
    process.env.OKUVU_INTERNAL_SECRET = 'shared-secret';
    delete process.env.WORRY_TIME_REMINDER_HOUR_IST;

    const config = reminderConfigFromEnv();
    expect(config).toEqual({
      apiBaseUrl: 'http://api.okuvu.local:8080',
      internalSecret: 'shared-secret',
      hourIst: 20,
      tickIntervalMs: 60_000,
    });
  });

  it('falls back to the default hour when the override is invalid', () => {
    process.env.WORRY_TIME_REMINDER_HOUR_IST = '25';
    expect(reminderConfigFromEnv().hourIst).toBe(20);
    process.env.WORRY_TIME_REMINDER_HOUR_IST = '6';
    expect(reminderConfigFromEnv().hourIst).toBe(6);
  });

  it('treats blank env values as unset', () => {
    process.env.OKUVU_API_URL = '   ';
    process.env.OKUVU_INTERNAL_SECRET = '';
    const config = reminderConfigFromEnv();
    expect(config.apiBaseUrl).toBeNull();
    expect(config.internalSecret).toBeNull();
  });

  it('computes IST wall-clock parts independent of the host timezone', () => {
    expect(istParts(new Date('2026-11-25T18:29:00Z'))).toEqual({
      dateKey: '2026-11-25',
      hour: 23,
      minute: 59,
    });
    // 18:30 UTC is already the next IST day.
    expect(istParts(new Date('2026-11-25T18:30:00Z')).dateKey).toBe('2026-11-26');
  });

  it('is fail-closed on the shared copy flag until it is exported as true', async () => {
    // The owner adds WORRY_REMINDER_COPY_APPROVED to shared-types; until it is
    // exactly true, the trigger must report "not approved".
    const flag = (await import('@okuvu/shared-types/worksheets/anxiety-worry')) as Record<
      string,
      unknown
    >;
    if (flag.WORRY_REMINDER_COPY_APPROVED === undefined) {
      expect(isWorryReminderCopyApproved()).toBe(false);
    } else {
      expect(isWorryReminderCopyApproved()).toBe(flag.WORRY_REMINDER_COPY_APPROVED === true);
    }
  });
});

describe('POST /tasks/worry-time-reminders (ops trigger)', () => {
  const ORIGINAL = { ...process.env };
  let app: ReturnType<typeof buildApp> | undefined;

  beforeEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
    process.env.OKUVU_API_URL = 'http://api.okuvu.local:8080';
    process.env.OKUVU_INTERNAL_SECRET = 'shared-secret';
    app = buildApp();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env = { ...ORIGINAL };
  });

  it('answers with the sweep result instead of throwing', async () => {
    // Never touch the network from a unit test, whichever way the copy flag
    // currently stands.
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ sent: 0, skipped: 0 }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    try {
      const response = await app!.inject({
        method: 'POST',
        url: '/tasks/worry-time-reminders',
      });

      expect(response.statusCode).toBe(200);
      expect(['copy_not_approved', 'ok']).toContain(response.json().status);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
