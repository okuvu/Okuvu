import * as anxietyWorryWorksheet from '@okuvu/shared-types/worksheets/anxiety-worry';

/**
 * The daily trigger for the worry-time reminder email.
 *
 * apps/api implements the sender as `POST /internal/worry-time/reminders`
 * (apps/api/src/routes/worry-time.ts). That endpoint is the contract, and it
 * owns every decision about *who* gets an email:
 *
 *  - it only considers active worry-time settings,
 *  - it sends nothing before the client's chosen IST time (so a late sweep
 *    catches the day up rather than skipping it),
 *  - it sends at most one email per client per IST day, keyed on
 *    `last_reminded_on`.
 *
 * This module therefore holds **no** per-client or per-day dedupe of its own.
 * A second local layer could disagree with `last_reminded_on` — for example
 * after a database restore or a timezone change — and silently drop a day. The
 * only state kept here is the scheduler's own "this slot already fired" guard,
 * which exists to make a `setInterval` tick call the endpoint once a day
 * instead of once a minute. It never decides whether an email is sent.
 *
 * There is no scheduler library in this workspace and `node-cron` is not a
 * dependency (apps/worker/package.json), so the timer is a plain `setInterval`
 * with an explicit IST guard. Every tick is cheap: it converts the clock to
 * IST and returns unless the IST time is at or past the configured hour and
 * this IST day's slot has not fired yet. Using "at or past" rather than an
 * exact hour means a worker that starts, restarts or misses a tick at 20:05
 * catches the evening up on its next tick instead of losing the day — the same
 * property the api gives each client with its chosen time. For the one tick
 * that matches, the call is awaited inside a try/catch, so a network error, a
 * non-2xx response or a timeout is logged and the process keeps running. A
 * failed run is not retried in the same process-day; the next scheduled run is
 * the next IST day, and the api's `last_reminded_on` makes that next run safe
 * (it sends at most one email per client per day).
 *
 * The email copy is not approved yet. `WORRY_REMINDER_COPY_APPROVED` in
 * packages/shared-types/worksheets/anxiety-worry.ts is the single switch the
 * api and this caller both respect; while it is false the trigger skips the
 * call entirely and says once, in the log, that it is waiting on approval.
 */

export const IST_OFFSET_MS = 330 * 60_000;
export const INTERNAL_HEADER = 'x-okuvu-internal';
export const REMINDERS_PATH = '/internal/worry-time/reminders';
export const DEFAULT_REMINDER_HOUR_IST = 20;
export const DEFAULT_TICK_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface ReminderLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

/**
 * The shape of `fetch` this module needs. Injected in tests so no network call
 * is ever made, and defaulted to the global at call time.
 */
export interface ReminderResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<ReminderResponse>;

export type WorryReminderResult =
  | { status: 'copy_not_approved' }
  | { status: 'not_configured'; missing: 'OKUVU_INTERNAL_SECRET' | 'OKUVU_API_URL' }
  | { status: 'ok'; http_status: number; sent: number | null; skipped: number | null }
  | { status: 'failed'; reason: string; http_status?: number };

export interface WorryReminderDeps {
  apiBaseUrl: string | null;
  internalSecret: string | null;
  /** Defaults to `isWorryReminderCopyApproved`; a test injects either value. */
  copyApproved?: () => boolean;
  log: ReminderLogger;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export interface ReminderConfig {
  apiBaseUrl: string | null;
  internalSecret: string | null;
  hourIst: number;
  tickIntervalMs: number;
}

/**
 * Fail-closed read of the shared approval flag: only the exact boolean `true`
 * enables sending. Read at call time rather than captured at import, so a flag
 * flipped between builds/runs is observed without any other change.
 *
 * The flag is read through the module namespace rather than a named import
 * because it is being added to shared-types in parallel with this trigger; a
 * named import would make this app fail to compile until that lands, and a
 * plain "absent" must mean "not approved" anyway, never "open".
 */
export function isWorryReminderCopyApproved(): boolean {
  const module = anxietyWorryWorksheet as unknown as Record<string, unknown>;
  return module.WORRY_REMINDER_COPY_APPROVED === true;
}

/** Wall-clock parts in IST (UTC+05:30), independent of the host timezone. */
export function istParts(now: Date): { dateKey: string; hour: number; minute: number } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return {
    dateKey: `${year}-${month}-${day}`,
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function nonEmpty(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readCount(body: unknown, key: 'sent' | 'skipped'): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Resolves the trigger's configuration from the environment.
 *
 * `OKUVU_INTERNAL_SECRET` is the same shared secret the api checks on the
 * internal route. `OKUVU_API_URL` is the api's base URL reachable from the
 * worker (in AWS, the api's Cloud Map name; terraform does not set it for the
 * worker task yet — see the module note in the step report).
 */
export function reminderConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ReminderConfig {
  const rawHour = env.WORRY_TIME_REMINDER_HOUR_IST;
  let hourIst = DEFAULT_REMINDER_HOUR_IST;
  if (rawHour !== undefined && rawHour.trim() !== '') {
    const parsed = Number(rawHour);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 23) {
      hourIst = parsed;
    }
  }

  const rawTick = env.WORRY_TIME_REMINDER_TICK_MS;
  let tickIntervalMs = DEFAULT_TICK_INTERVAL_MS;
  if (rawTick !== undefined && rawTick.trim() !== '') {
    const parsed = Number(rawTick);
    if (Number.isInteger(parsed) && parsed >= 1_000) {
      tickIntervalMs = parsed;
    }
  }

  return {
    apiBaseUrl: nonEmpty(env.OKUVU_API_URL),
    internalSecret: nonEmpty(env.OKUVU_INTERNAL_SECRET),
    hourIst,
    tickIntervalMs,
  };
}

/**
 * Calls the api's sweep once. Never throws: every failure is logged and
 * returned as `failed` so the caller (the timer, or the ops route) can carry on.
 */
export async function runWorryTimeReminders(deps: WorryReminderDeps): Promise<WorryReminderResult> {
  const copyApproved = deps.copyApproved ?? isWorryReminderCopyApproved;

  if (!copyApproved()) {
    // Deliberately before the configuration checks: while the copy is
    // unapproved, no amount of configuration should cause an email.
    return { status: 'copy_not_approved' };
  }

  const secret = nonEmpty(deps.internalSecret ?? undefined);
  if (!secret) {
    deps.log.error(
      { event: 'worry_time_reminder_not_configured', missing: 'OKUVU_INTERNAL_SECRET' },
      'Worry-time reminder sweep is inert: OKUVU_INTERNAL_SECRET is not set',
    );
    return { status: 'not_configured', missing: 'OKUVU_INTERNAL_SECRET' };
  }

  const baseUrl = nonEmpty(deps.apiBaseUrl ?? undefined);
  if (!baseUrl) {
    deps.log.error(
      { event: 'worry_time_reminder_not_configured', missing: 'OKUVU_API_URL' },
      'Worry-time reminder sweep is inert: OKUVU_API_URL is not set',
    );
    return { status: 'not_configured', missing: 'OKUVU_API_URL' };
  }

  const url = `${baseUrl.replace(/\/+$/, '')}${REMINDERS_PATH}`;
  const fetchImpl: FetchLike = deps.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const started = Date.now();

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        [INTERNAL_HEADER]: secret,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // The api answers 503 when its own secret is unset and 401 when the
      // secret does not match; both are configuration errors worth a loud log,
      // and neither is allowed to take the worker down.
      deps.log.error(
        {
          event: 'worry_time_reminder_failed',
          http_status: response.status,
          url,
          elapsed_ms: Date.now() - started,
        },
        'Worry-time reminder sweep returned a non-2xx response; retrying at the next scheduled run',
      );
      return {
        status: 'failed',
        http_status: response.status,
        reason: `HTTP ${response.status}`,
      };
    }

    const sent = readCount(body, 'sent');
    const skipped = readCount(body, 'skipped');

    deps.log.info(
      {
        event: 'worry_time_reminders_sent',
        http_status: response.status,
        sent,
        skipped,
        elapsed_ms: Date.now() - started,
      },
      'Worry-time reminder sweep completed',
    );

    return { status: 'ok', http_status: response.status, sent, skipped };
  } catch (err) {
    deps.log.error(
      {
        event: 'worry_time_reminder_failed',
        url,
        err: errorMessage(err),
        elapsed_ms: Date.now() - started,
      },
      'Worry-time reminder sweep failed; retrying at the next scheduled run',
    );
    return { status: 'failed', reason: errorMessage(err) };
  }
}

export interface SchedulerOptions extends ReminderConfig {
  log: ReminderLogger;
  copyApproved?: () => boolean;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
  setIntervalImpl?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearIntervalImpl?: (handle: NodeJS.Timeout) => void;
}

/**
 * Fires `runWorryTimeReminders` once per IST day.
 *
 * The hour is configurable (`WORRY_TIME_REMINDER_HOUR_IST`, default 20:00 IST)
 * because the api only sends after each client's chosen time. One daily sweep
 * therefore serves clients whose window is at or before that hour; a client who
 * picked a later window gets that day's reminder on the following day's sweep.
 * The api's per-day guard still holds, so nothing is ever sent twice.
 */
export class WorryTimeReminderScheduler {
  private readonly apiBaseUrl: string | null;
  private readonly internalSecret: string | null;
  private readonly hourIst: number;
  private readonly tickIntervalMs: number;
  private readonly log: ReminderLogger;
  private readonly copyApproved: () => boolean;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly timeoutMs: number | undefined;
  private readonly now: () => Date;
  private readonly setIntervalImpl: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearIntervalImpl: (handle: NodeJS.Timeout) => void;

  private timer: NodeJS.Timeout | null = null;
  private lastSlot: string | null = null;
  private inFlight: Promise<WorryReminderResult> | null = null;
  private approvalNoticeLogged = false;

  constructor(options: SchedulerOptions) {
    this.apiBaseUrl = options.apiBaseUrl;
    this.internalSecret = options.internalSecret;
    this.hourIst = options.hourIst;
    this.tickIntervalMs = options.tickIntervalMs;
    this.log = options.log;
    this.copyApproved = options.copyApproved ?? isWorryReminderCopyApproved;
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs;
    this.now = options.now ?? (() => new Date());
    this.setIntervalImpl = options.setIntervalImpl ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalImpl = options.clearIntervalImpl ?? ((handle) => clearInterval(handle));
  }

  /**
   * Starts the timer. Inert when either half of the internal hop is
   * unconfigured: it logs why once and schedules nothing, so a deployment
   * without the secret cannot call the api (and, with the api itself inert when
   * its secret is unset, cannot send anything either).
   */
  start(): void {
    if (this.timer) return;

    const missing: string[] = [];
    if (!this.internalSecret) missing.push('OKUVU_INTERNAL_SECRET');
    if (!this.apiBaseUrl) missing.push('OKUVU_API_URL');

    if (missing.length > 0) {
      this.log.error(
        { event: 'worry_time_reminder_disabled', missing },
        `Worry-time reminder trigger is inert: ${missing.join(' and ')} not set — no daily sweep is scheduled`,
      );
      return;
    }

    this.log.info(
      {
        event: 'worry_time_reminder_scheduler_started',
        hour_ist: this.hourIst,
        tick_ms: this.tickIntervalMs,
      },
      `Worry-time reminder scheduler started; sweeping daily at ${String(this.hourIst).padStart(2, '0')}:00 IST`,
    );

    if (!this.copyApproved() && !this.approvalNoticeLogged) {
      this.approvalNoticeLogged = true;
      this.log.info(
        { event: 'worry_time_reminder_waiting_for_copy_approval' },
        'Worry-time reminder is waiting on copy approval (WORRY_REMINDER_COPY_APPROVED=false); nothing will be sent',
      );
    }

    this.timer = this.setIntervalImpl(() => {
      // tick() handles its own errors, but the void here makes explicit that
      // the interval callback never returns a promise to ignore.
      void this.tick();
    }, this.tickIntervalMs);
  }

  /** Stops the timer and waits for an in-flight sweep, bounded by the caller. */
  async stop(): Promise<void> {
    if (this.timer) {
      this.clearIntervalImpl(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.inFlight.catch(() => undefined);
    }
    this.log.info({ event: 'worry_time_reminder_scheduler_stopped' }, 'Worry-time reminder scheduler stopped');
  }

  /**
   * One timer tick. Returns null when this tick is not the daily slot, so a
   * test can drive it with an injected clock; otherwise returns the sweep's
   * result. Never rejects.
   */
  async tick(now: Date = this.now()): Promise<WorryReminderResult | null> {
    const { dateKey, hour, minute } = istParts(now);
    if (hour * 60 + minute < this.hourIst * 60) return null;

    // One slot per IST day per process. A restart is a new process with no
    // memory of the earlier call — that is fine, and deliberate: the api's
    // `last_reminded_on` is the authority on whether an email has gone out.
    const slot = dateKey;
    if (slot === this.lastSlot) return null;
    if (this.inFlight) return null;

    this.lastSlot = slot;
    this.log.info(
      { event: 'worry_time_reminder_run_started', ist_slot: slot },
      'Worry-time reminder sweep starting',
    );

    this.inFlight = this.runOnce();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async runOnce(): Promise<WorryReminderResult> {
    try {
      const result = await runWorryTimeReminders({
        apiBaseUrl: this.apiBaseUrl,
        internalSecret: this.internalSecret,
        copyApproved: this.copyApproved,
        log: this.log,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
      });

      if (result.status === 'copy_not_approved' && !this.approvalNoticeLogged) {
        this.approvalNoticeLogged = true;
        this.log.info(
          { event: 'worry_time_reminder_waiting_for_copy_approval' },
          'Worry-time reminder is waiting on copy approval (WORRY_REMINDER_COPY_APPROVED=false); nothing has been sent',
        );
      }

      return result;
    } catch (err) {
      // runWorryTimeReminders already catches, so this is belt and braces: a
      // timer callback that rejects would surface as an unhandled rejection.
      this.log.error(
        { event: 'worry_time_reminder_crashed', err: errorMessage(err) },
        'Worry-time reminder sweep threw unexpectedly; the scheduler keeps running',
      );
      return { status: 'failed', reason: errorMessage(err) };
    }
  }
}
