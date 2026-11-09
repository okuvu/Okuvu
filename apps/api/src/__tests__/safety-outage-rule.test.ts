import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

/**
 * Owner's rule (9 Nov 2026), replacing the Step 4 fallthrough:
 *
 *   A failed or slow check is MODERATE CONCERN — never safe, never crisis.
 *   The crisis-word backstop still runs. If it fires, it is a full crisis
 *   (card, flag, alert). If it does not, the client gets a gentle "help is
 *   here if you need it" offer, the fact that the check could not run is
 *   recorded, and NO therapist alert is sent. The write is screened again once
 *   the service is back, and only that recheck can alert.
 *
 * Everything below simulates a real outage: the classifier throws, which is
 * what "the service is down" looks like from inside the write path. The
 * keyword backstop is the real one, not a mock, so these tests prove the
 * ordering as well as the outcome.
 */

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    journalEntry: { create: vi.fn(), findUnique: vi.fn() },
    worksheetResponse: { create: vi.fn(), findUnique: vi.fn() },
    treasureNote: { create: vi.fn(), findUnique: vi.fn() },
    treasureCollection: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    safetyFlag: { create: vi.fn() },
    safetyRecheck: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    therapistClient: { findMany: vi.fn() },
  },
}));

const mockClassifySafety = vi.hoisted(() => vi.fn());
vi.mock('../agents/a1/agent.js', () => ({ classifySafety: mockClassifySafety }));

const mockSendAlert = vi.hoisted(() => vi.fn());
vi.mock('../lib/email.js', () => ({
  sendSafetyAlertEmail: mockSendAlert,
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

/** What an outage looks like from inside a write: the classifier throws. */
function simulateOutage() {
  mockClassifySafety.mockRejectedValue(new Error('bedrock unavailable'));
}

describe('A failed safety check is moderate concern, never a crisis', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'entry-1' } as any);
    vi.mocked(prisma.safetyRecheck.upsert).mockResolvedValue({ id: 'recheck-1' } as any);
    vi.mocked(prisma.safetyFlag.create).mockResolvedValue({
      id: 'flag-1',
      user_id: MOCK_USER_ID,
      level: 'S4',
      occurred_at: new Date('2026-11-09T10:00:00Z'),
    } as any);
    vi.mocked(prisma.therapistClient.findMany).mockResolvedValue([
      { client_label: 'C-01', therapist: { email: 'therapist@example.com', name: 'T' } },
    ] as any);
    mockSendAlert.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('an ordinary journal entry saved during an outage: no alert, help offered, queued for recheck', async () => {
    simulateOutage();
    app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/journal',
      payload: { content: 'Long day. Tired but okay.' },
    });

    // Saved, so nothing the client wrote is lost.
    expect(response.statusCode).toBe(201);
    expect(vi.mocked((await importMocks()).journalEntry.create)).toHaveBeenCalled();

    // Moderate concern: the gentle offer, not the crisis card.
    expect(response.json().safety).toMatchObject({ showHelp: false, helpOffer: true });

    // No flag, no email. This is the whole point of the rule.
    const prisma = await importMocks();
    expect(vi.mocked(prisma.safetyFlag.create)).not.toHaveBeenCalled();
    expect(mockSendAlert).not.toHaveBeenCalled();

    // And the entry is queued, so it is screened again when the service is back.
    expect(vi.mocked(prisma.safetyRecheck.upsert)).toHaveBeenCalledTimes(1);
    const upsert = vi.mocked(prisma.safetyRecheck.upsert).mock.calls[0][0] as any;
    expect(upsert.create).toMatchObject({
      user_id: MOCK_USER_ID,
      surface: 'journal_entry',
      subject_kind: 'journal_entry',
      subject_id: 'entry-1',
    });
    // The queue holds a pointer, never the writing.
    expect(JSON.stringify(upsert)).not.toContain('Tired but okay');
  });

  it('crisis words typed during an outage: the backstop still runs, and it is a full crisis', async () => {
    simulateOutage();
    app = buildApp();

    const content = 'I want to die and I have been thinking about it all night.';
    const response = await app.inject({ method: 'POST', url: '/journal', payload: { content } });

    expect(response.statusCode).toBe(201);
    expect(response.json().safety).toMatchObject({ showHelp: true, helpOffer: false });

    const prisma = await importMocks();
    // Flag with the row it came from and none of the words.
    const flagCall = vi.mocked(prisma.safetyFlag.create).mock.calls[0][0] as any;
    expect(flagCall.data).toMatchObject({
      user_id: MOCK_USER_ID,
      level: 'S4',
      source: 'journal_entry',
      subject_id: 'entry-1',
    });
    expect(JSON.stringify(flagCall)).not.toContain('thinking about it all night');

    // The therapist is told, with no content.
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    const alert = mockSendAlert.mock.calls[0][0] as any;
    expect(alert).toMatchObject({ clientLabel: 'C-01', level: 'S4' });
    expect(JSON.stringify(alert)).not.toContain('want to die');

    // A crisis is not also queued: there is nothing left to re-decide.
    expect(vi.mocked(prisma.safetyRecheck.upsert)).not.toHaveBeenCalled();
  });
});

describe('The recheck: screened again once the service answers', () => {
  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.safetyRecheck.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.safetyRecheck.delete).mockResolvedValue({} as any);
    vi.mocked(prisma.safetyRecheck.update).mockResolvedValue({} as any);
    vi.mocked(prisma.safetyFlag.create).mockResolvedValue({
      id: 'flag-1',
      user_id: MOCK_USER_ID,
      level: 'S4',
      occurred_at: new Date('2026-11-09T10:00:00Z'),
    } as any);
    vi.mocked(prisma.therapistClient.findMany).mockResolvedValue([
      { client_label: 'C-01', therapist: { email: 'therapist@example.com', name: 'T' } },
    ] as any);
    mockSendAlert.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  function queuedRow() {
    return {
      id: 'recheck-1',
      user_id: MOCK_USER_ID,
      surface: 'journal_entry',
      subject_kind: 'journal_entry',
      subject_id: 'entry-1',
      attempts: 0,
    };
  }

  it('alerts the therapist when the recheck finds risk', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.safetyRecheck.findMany).mockResolvedValue([queuedRow()] as any);
    // The service is back, and it reads the stored entry.
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      user_id: MOCK_USER_ID,
      content: 'I want to die and I have been thinking about it all night.',
    } as any);

    const { runSafetyRecheckSweep } = await import('../lib/safety-recheck.js');
    const result = await runSafetyRecheckSweep({ now: new Date('2026-11-09T12:00:00Z') });

    expect(result).toMatchObject({ checked: 1, flagged: 1, cleared: 0 });
    expect(vi.mocked(prisma.safetyFlag.create)).toHaveBeenCalledTimes(1);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    const alert = mockSendAlert.mock.calls[0][0] as any;
    expect(JSON.stringify(alert)).not.toContain('want to die');
    // The queue row is done with.
    expect(vi.mocked(prisma.safetyRecheck.delete)).toHaveBeenCalledWith({
      where: { id: 'recheck-1' },
    });
  });

  it('clears the row and alerts nobody when the recheck finds nothing', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.safetyRecheck.findMany).mockResolvedValue([queuedRow()] as any);
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      user_id: MOCK_USER_ID,
      content: 'Long day. Tired but okay.',
    } as any);
    mockClassifySafety.mockResolvedValue({
      safetyState: 'S1',
      fallbackUsed: false,
      crisis_language_detected: false,
      basis: 'literal',
      signal_strength: 'high',
      notes: null,
    });

    const { runSafetyRecheckSweep } = await import('../lib/safety-recheck.js');
    const result = await runSafetyRecheckSweep({ now: new Date('2026-11-09T12:00:00Z') });

    expect(result).toMatchObject({ checked: 1, flagged: 0, cleared: 1 });
    expect(vi.mocked(prisma.safetyFlag.create)).not.toHaveBeenCalled();
    expect(mockSendAlert).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.safetyRecheck.delete)).toHaveBeenCalledTimes(1);
  });

  it('leaves the row queued with a backoff while the check still cannot run', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.safetyRecheck.findMany).mockResolvedValue([queuedRow()] as any);
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      user_id: MOCK_USER_ID,
      content: 'Long day. Tired but okay.',
    } as any);
    simulateOutage();

    const { runSafetyRecheckSweep } = await import('../lib/safety-recheck.js');
    const result = await runSafetyRecheckSweep({ now: new Date('2026-11-09T12:00:00Z') });

    expect(result).toMatchObject({ checked: 1, stillUnscreened: 1, flagged: 0 });
    expect(vi.mocked(prisma.safetyRecheck.update)).toHaveBeenCalledTimes(1);
    const update = vi.mocked(prisma.safetyRecheck.update).mock.calls[0][0] as any;
    expect(update.data).toMatchObject({ attempts: 1 });
    expect(update.data.next_attempt_at.getTime()).toBeGreaterThan(
      new Date('2026-11-09T12:00:00Z').getTime(),
    );
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it('drops the row when the client deleted what it pointed at', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.safetyRecheck.findMany).mockResolvedValue([queuedRow()] as any);
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);

    const { runSafetyRecheckSweep } = await import('../lib/safety-recheck.js');
    const result = await runSafetyRecheckSweep({ now: new Date('2026-11-09T12:00:00Z') });

    expect(result).toMatchObject({ checked: 1, missing: 1 });
    expect(vi.mocked(prisma.safetyRecheck.delete)).toHaveBeenCalledTimes(1);
    expect(mockSendAlert).not.toHaveBeenCalled();
  });
});
