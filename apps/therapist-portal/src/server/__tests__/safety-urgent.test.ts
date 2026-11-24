/**
 * The Safety card's urgent harm-to-someone row (owner's instruction, 24 Nov 2026).
 *
 * Three properties:
 *
 *  1. **Urgent flags come first**, whatever the times say — the row a therapist
 *     needs must not be below five ordinary ones.
 *  2. **The client's own words are shown, and only for that row.** Every other
 *     source keeps the old rule: an event, a level, a time, a source.
 *  3. **Reading the words is audited**, because the client has not shared the
 *     answer — this is the one read of content the owner asked for.
 *
 * Plus the privacy-by-construction half: the flag row itself still carries no
 * text, and a flag pointing at a deleted answer degrades to "no words" rather
 * than failing the card.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';
import { answersToReadableText } from '../answer-text';

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Therapist One' };
const CLIENT_ID = 'client_1';

function flagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flag_1',
    user_id: CLIENT_ID,
    level: 'S3' as const,
    occurred_at: new Date('2026-11-24T09:00:00Z'),
    crisis_screen_shown: true,
    source: 'harm_to_someone',
    acknowledged_at: null,
    urgent: true,
    subject_kind: 'worksheet_response',
    subject_id: 'resp_1',
    ...overrides,
  };
}

interface Overrides {
  flags?: unknown[];
  answer?: unknown;
}

function buildPrisma(overrides: Overrides = {}) {
  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue({ id: 'tc_1' }),
      findMany: vi.fn().mockResolvedValue([{ client_user_id: CLIENT_ID }]),
    },
    safetyFlag: {
      findMany: vi.fn().mockResolvedValue(overrides.flags ?? []),
      groupBy: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    worksheetResponse: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.answer === undefined
            ? { worksheet_id: 'ws_unsent_letter', answers: { letter: 'I want to hurt him.' } }
            : overrides.answer,
        ),
    },
    // Chat-sourced urgent flags resolve the user turn beside the assistant turn
    // the flag names.
    turn: { findFirst: vi.fn().mockResolvedValue(null) },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
}

function callerWith(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
    prisma,
    headers: new Headers(),
  });
}

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;

beforeEach(() => {
  delete process.env.LOCAL_DEV_BYPASS_AUTH;
});

afterEach(() => {
  if (ORIGINAL_BYPASS === undefined) delete process.env.LOCAL_DEV_BYPASS_AUTH;
  else process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('safety.flagsForClient — the urgent row', () => {
  it('orders urgent first, then newest', async () => {
    const prisma = buildPrisma({ flags: [flagRow()] });
    await callerWith(prisma).safety.flagsForClient({ clientUserId: CLIENT_ID });

    const query = vi.mocked(prisma.safetyFlag.findMany).mock.calls[0][0] as any;
    expect(query.orderBy).toEqual([{ urgent: 'desc' }, { occurred_at: 'desc' }]);
  });

  it('shows the client’s own words for the urgent harm-to-someone flag', async () => {
    const prisma = buildPrisma({
      flags: [flagRow()],
      answer: { worksheet_id: 'ws_unsent_letter', answers: { to: 'my brother', letter: 'I want to hurt him.' } },
    });

    const rows = await callerWith(prisma).safety.flagsForClient({ clientUserId: CLIENT_ID });

    expect(rows[0]).toMatchObject({
      urgent: true,
      source: 'harm_to_someone',
      wordsFrom: 'ws_unsent_letter',
    });
    expect(rows[0].words).toContain('my brother');
    expect(rows[0].words).toContain('I want to hurt him.');

    // The read is scoped to this client's row: the flag pointer is a pointer,
    // not a way to read somebody else's answer.
    const answerQuery = vi.mocked(prisma.worksheetResponse.findFirst).mock.calls[0][0] as any;
    expect(answerQuery.where).toEqual({ id: 'resp_1', user_id: CLIENT_ID });
  });

  it('records the content read in the clinical access log', async () => {
    const prisma = buildPrisma({ flags: [flagRow()] });
    await callerWith(prisma).safety.flagsForClient({ clientUserId: CLIENT_ID });

    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: {
        therapist_id: THERAPIST.id,
        client_user_id: CLIENT_ID,
        action: 'READ_HARM_TO_SOMEONE_WORDS',
      },
    });
  });

  it('shows no words for any other flag, even when it points at an answer', async () => {
    const prisma = buildPrisma({
      flags: [
        flagRow({ id: 'flag_2', source: 'worksheet_answer', urgent: false }),
        flagRow({ id: 'flag_3', source: 'journal_entry', urgent: false, subject_kind: 'journal_entry' }),
      ],
    });

    const rows = await callerWith(prisma).safety.flagsForClient({ clientUserId: CLIENT_ID });

    expect(rows.map((row) => row.words)).toEqual([null, null]);
    // No content read at all for an ordinary flag.
    expect(prisma.worksheetResponse.findFirst).not.toHaveBeenCalled();
  });

  it('degrades to no words when the answer is gone, without failing the card', async () => {
    const prisma = buildPrisma({ flags: [flagRow()], answer: null });

    const rows = await callerWith(prisma).safety.flagsForClient({ clientUserId: CLIENT_ID });

    expect(rows).toHaveLength(1);
    expect(rows[0].words).toBeNull();
    expect(rows[0].urgent).toBe(true);
  });

  it('shows the client’s own words for a chat-sourced urgent flag too', async () => {
    // Owner's rule, 24 Nov 2026: the same disclosure typed into chat must reach
    // the same screen — so it must also be readable here, or the therapist gets
    // an urgent alert with nothing to judge.
    const prisma = buildPrisma({
      flags: [
        flagRow({
          source: 'harm_to_someone',
          subject_kind: null,
          subject_id: null,
          turn_id: 'turn_assistant_1',
          session_id: 'sess_1',
        }),
      ],
    });

    // The flag names the assistant turn; the words are the user turn with the
    // same number in the same session.
    vi.mocked(prisma.turn.findFirst)
      .mockResolvedValueOnce({ session_id: 'sess_1', turn_number: 7 } as any)
      .mockResolvedValueOnce({ content: 'I want to hurt my brother.' } as any);

    const rows = await callerWith(prisma).safety.flagsForClient({ clientUserId: CLIENT_ID });

    expect(rows[0].words).toBe('I want to hurt my brother.');
    expect(rows[0].wordsFrom).toBe('chat');
    expect(rows[0].urgent).toBe(true);

    const second = vi.mocked(prisma.turn.findFirst).mock.calls[1][0] as any;
    expect(second.where).toEqual({
      session_id: 'sess_1',
      turn_number: 7,
      user_id: CLIENT_ID,
      role: 'user',
    });

    // Reading it is a clinical access, exactly like the worksheet path.
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalled();
  });

  it('still refuses a client the therapist is not assigned to', async () => {
    const prisma = buildPrisma({ flags: [] });
    vi.mocked(prisma.therapistClient.findUnique).mockResolvedValue(null as any);

    await expect(
      callerWith(prisma).safety.flagsForClient({ clientUserId: CLIENT_ID }),
    ).rejects.toThrow();

    expect(prisma.safetyFlag.findMany).not.toHaveBeenCalled();
  });
});

describe('answersToReadableText', () => {
  it('keeps the client’s sentences in order and drops numbers and option values', () => {
    const text = answersToReadableText({
      to: 'my brother',
      letter: 'I want to hurt him.',
      feeling: { picked: ['angry'], strength: { angry: 8 } },
      rows: [{ task: 'Work', plan: 'must_do' }],
    });

    expect(text).toBe('my brother\n\nI want to hurt him.\n\nangry\n\nWork\n\nmust_do');
  });

  it('answers null when there is no text at all', () => {
    expect(answersToReadableText({ ready: 7 })).toBeNull();
    expect(answersToReadableText(null)).toBeNull();
  });

  it('says so rather than truncating in silence', () => {
    const long = 'a'.repeat(7000);
    const text = answersToReadableText({ letter: long })!;
    expect(text).toContain('longer than this card shows');
    expect(text.length).toBeLessThan(long.length + 100);
  });
});
