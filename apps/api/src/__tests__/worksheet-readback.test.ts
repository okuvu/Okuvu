/**
 * The read-back is screened before it is drawn (owner's decision, 24 Nov 2026).
 *
 * The Unhooking from a thought worksheet shows the client's own sentence back
 * inside "I'm having the thought that …". Before this route existed the screen
 * built those frames itself, from the answer it already held, so the words
 * appeared with no check at all. These tests are about the three properties that
 * make the new behaviour safe:
 *
 *   1. a clean thought comes back verbatim, in the approved frames;
 *   2. a thought that raises anything is withheld — no frames, the safety
 *      response instead, and a flag with no content on it;
 *   3. nothing unreachable can be asked: a draft, a therapist-only row, or a
 *      piece that is not a read-back answers as if it did not exist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { entryById } from '@okuvu/shared-types/worksheets';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    toolRegistryEntry: { findUnique: vi.fn() },
    safetyState: { findUnique: vi.fn() },
    safetyFlag: { create: vi.fn() },
    safetyRecheck: { upsert: vi.fn() },
    therapistClient: { findMany: vi.fn() },
  },
}));

// The real check runs. Only the model verdict is stubbed; the deterministic
// crisis floor is not stubbed at all, so a crisis is caught without the model.
const mockClassifySafety = vi.hoisted(() => vi.fn());
vi.mock('../agents/a1/agent.js', () => ({ classifySafety: mockClassifySafety }));

vi.mock('../lib/email.js', () => ({
  sendSafetyAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOOL_ID = 'ws_unhooking';

function rowFor(toolId: string, overrides: Record<string, unknown> = {}) {
  const entry = entryById(toolId) as CatalogueEntry;
  return {
    tool_id: entry.tool_id,
    kind: 'worksheet',
    status: entry.status,
    label: entry.label,
    summary: entry.summary,
    section: entry.section,
    access_mode: entry.access_mode,
    load_level: entry.load_level,
    est_minutes: entry.est_minutes,
    library_group: entry.library_group ?? null,
    content_en: entry.content_en,
    content_hi: entry.content_hi,
    therapy_modality: entry.therapy_modality,
    therapist_note: entry.therapist_note,
    care_plans: entry.care_plans,
    sensitive_check: entry.sensitive_check,
    ...overrides,
  };
}

function classified(state: string) {
  return {
    safetyState: state,
    fallbackUsed: false,
    crisis_language_detected: state === 'S4',
    basis: 'literal',
  };
}

describe('POST /worksheets/:toolId/readback', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    vi.clearAllMocks();
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.user.findUnique.mockResolvedValue({ id: MOCK_USER_ID });
    p.toolRegistryEntry.findUnique.mockResolvedValue(rowFor(TOOL_ID));
    p.safetyState.findUnique.mockResolvedValue({ safety_state_current: 'S0' });
    // A realistic row: Prisma's `select` returns these six fields, so the double
    // must too. A bare `{ id }` used to hand `notifyTherapistsOfSafetyFlag` a
    // flag with no user id, which turned the "no assignment" warning into a
    // thrown error — the alerting path was right, the double was not.
    p.safetyFlag.create.mockResolvedValue({
      id: 'flag-1',
      user_id: MOCK_USER_ID,
      level: 'S3',
      occurred_at: new Date('2026-11-24T09:00:00Z'),
      urgent: false,
      source: 's3_grounding',
    });
    p.safetyRecheck.upsert.mockResolvedValue({ id: 'recheck-1' });
    p.therapistClient.findMany.mockResolvedValue([]);
    mockClassifySafety.mockResolvedValue(classified('S0'));
    app = await buildApp();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  const post = (body: Record<string, unknown>, toolId = TOOL_ID) =>
    app.inject({ method: 'POST', url: `/worksheets/${toolId}/readback`, payload: body });

  it('returns the approved frames with the client’s own words, unchanged', async () => {
    const response = await post({ fieldId: 'readback', text: '  I will fail at this  ' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.withheld).toBe(false);
    // Trimmed at the edges, never reworded inside: the substitution is the only
    // change the piece makes.
    expect(body.frames).toEqual([
      "I'm having the thought that I will fail at this",
      "I notice I'm having the thought that I will fail at this",
    ]);
    expect(body.safety).toBeUndefined();
  });

  it('withholds the frames when the thought raises a crisis, and flags it without content', async () => {
    // The deterministic floor, not the model: this must work when the classifier
    // does not.
    const response = await post({ fieldId: 'readback', text: 'I want to kill myself' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.withheld).toBe(true);
    expect(body.frames).toEqual([]);
    expect(body.safety.showHelp).toBe(true);

    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    expect(p.safetyFlag.create).toHaveBeenCalledTimes(1);
    const flag = p.safetyFlag.create.mock.calls[0][0].data;
    expect(flag.subject_kind).toBe('worksheet_readback');
    expect(flag.subject_id).toBe(`${MOCK_USER_ID}:${TOOL_ID}:readback`);
    // No client text anywhere on the flag: this is the same rule as every other
    // write path, and it is the reason the row is checked here rather than
    // trusted.
    expect(JSON.stringify(flag)).not.toContain('kill myself');
  });

  it('withholds when the check is unavailable, and queues a recheck instead of a verdict', async () => {
    mockClassifySafety.mockRejectedValue(new Error('model down'));

    const response = await post({ fieldId: 'readback', text: 'I am not sure this is working' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // An unavailable check is moderate concern, never crisis and never safe.
    expect(body.withheld).toBe(true);
    expect(body.safety.urgent).toBe(false);

    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    expect(p.safetyRecheck.upsert).toHaveBeenCalledTimes(1);
    expect(p.safetyFlag.create).not.toHaveBeenCalled();
  });

  it('shows nothing back for an empty thought, and asks the check nothing', async () => {
    const response = await post({ fieldId: 'readback', text: '   ' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ frames: [], withheld: false });
    expect(mockClassifySafety).not.toHaveBeenCalled();
  });

  it('answers 404 for a piece that is not a read-back', async () => {
    const response = await post({ fieldId: 'thought', text: 'anything' });
    expect(response.statusCode).toBe(404);
  });

  it('answers 404 for a worksheet the client cannot reach', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;

    // The exposure ladder is approved but therapist-only.
    p.toolRegistryEntry.findUnique.mockResolvedValue(rowFor('ws_exposure_ladder'));
    expect((await post({ fieldId: 'readback', text: 'x' }, 'ws_exposure_ladder')).statusCode).toBe(404);

    // A draft does not exist as far as the client app is concerned.
    p.toolRegistryEntry.findUnique.mockResolvedValue(
      rowFor(TOOL_ID, { status: 'draft' }),
    );
    expect((await post({ fieldId: 'readback', text: 'x' })).statusCode).toBe(404);
  });

  it('withholds on a moderate concern too, not only on a flag', async () => {
    // "Any concern" is the owner's wording, so S2 withholds as well. Nothing is
    // flagged at S2 — there is nothing to alert a therapist about — but the
    // words are still not drawn back.
    mockClassifySafety.mockResolvedValue(classified('S2'));

    const response = await post({ fieldId: 'readback', text: 'everything is a bit much' });
    const body = response.json();
    expect(body.withheld).toBe(true);
    expect(body.frames).toEqual([]);

    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    expect(p.safetyFlag.create).not.toHaveBeenCalled();
  });
});
