import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockClassifySafety = vi.hoisted(() => vi.fn());

vi.mock('../agents/a1/agent.js', () => ({ classifySafety: mockClassifySafety }));

import { answersToText, checkClientText } from '../lib/safety-check.js';

function classified(state: string, extra: Record<string, unknown> = {}) {
  return {
    safetyState: state,
    fallbackUsed: false,
    crisis_language_detected: state === 'S4',
    basis: 'literal',
    signal_strength: 'high',
    notes: null,
    ...extra,
  };
}

describe('checkClientText — one check, used by every client write', () => {
  beforeEach(() => {
    mockClassifySafety.mockReset();
  });

  it('raises an explicit disclosure to S4 with no model call at all', async () => {
    const result = await checkClientText('I want to die.');

    expect(result).toMatchObject({ level: 'S4', flagged: true, showHelp: true, degraded: false });
    expect(result.reason).toBe('crisis_keyword_floor');
    expect(mockClassifySafety).not.toHaveBeenCalled();
  });

  it('flags an S3 verdict from the classifier', async () => {
    mockClassifySafety.mockResolvedValue(classified('S3'));

    const result = await checkClientText('I keep snapping at everyone and I hate it.');

    expect(result).toMatchObject({ level: 'S3', flagged: true, showHelp: true });
  });

  it('does not flag S0-S2', async () => {
    mockClassifySafety.mockResolvedValue(classified('S1'));

    const result = await checkClientText('A hard day at work.');

    expect(result).toMatchObject({ level: 'S1', flagged: false, showHelp: false });
  });

  // Owner's rule, 9 Nov 2026: a failed or slow check is MODERATE CONCERN —
  // never safe, never crisis. It must not flag, must not alert, and must ask
  // for a recheck instead. A crisis card on every outage is how therapists
  // learn to ignore the real ones.
  it('treats a thrown classifier as moderate concern, never a crisis', async () => {
    mockClassifySafety.mockRejectedValue(new Error('bedrock unavailable'));

    const result = await checkClientText('Nothing much to report.');

    expect(result).toMatchObject({
      level: 'S2',
      flagged: false,
      showHelp: false,
      helpOffer: true,
      recheck: true,
      degraded: true,
    });
  });

  it('treats A1 fallback (no verdict) as moderate concern', async () => {
    mockClassifySafety.mockResolvedValue(
      classified('S2', { fallbackUsed: true, notes: 'llm_timeout' }),
    );

    const result = await checkClientText('Nothing much to report.');

    expect(result).toMatchObject({
      level: 'S2',
      flagged: false,
      helpOffer: true,
      recheck: true,
      degraded: true,
    });
    expect(result.reason).toContain('llm_timeout');
  });

  it('treats a classifier that takes too long as moderate concern', async () => {
    mockClassifySafety.mockImplementation(() => new Promise(() => {}));

    const result = await checkClientText('Nothing much to report.', { timeoutMs: 20 });

    expect(result).toMatchObject({
      level: 'S2',
      flagged: false,
      showHelp: false,
      helpOffer: true,
      recheck: true,
      degraded: true,
    });
    expect(result.reason).toContain('safety_check_timeout');
  });

  it('a clean verdict carries no help offer and no recheck', async () => {
    mockClassifySafety.mockResolvedValue(classified('S1'));

    const result = await checkClientText('A hard day at work.');

    expect(result).toMatchObject({ helpOffer: false, recheck: false, degraded: false });
  });

  it('treats empty text as nothing to screen', async () => {
    const result = await checkClientText('   ');

    expect(result).toMatchObject({ level: 'S0', flagged: false, showHelp: false });
    expect(mockClassifySafety).not.toHaveBeenCalled();
  });

  it('still finds a disclosure when the model is down (the floor runs first)', async () => {
    mockClassifySafety.mockRejectedValue(new Error('offline'));

    const result = await checkClientText('honestly I want to end my life');

    // A full crisis, not the moderate floor: the backstop ran before the
    // classifier was ever asked.
    expect(result.level).toBe('S4');
    expect(result.flagged).toBe(true);
    expect(result.showHelp).toBe(true);
    expect(result.recheck).toBe(false);
    expect(result.reason).toBe('crisis_keyword_floor');
  });
});

describe('answersToText — every string a worksheet holds, at any depth', () => {
  it('collects row-list answers, not just top-level fields', () => {
    const text = answersToText({
      signs: [{ item: 'not sleeping' }, { item: 'snapping at people' }],
      one_reason: 'my sister',
      scale: 7,
      picked: { picked: ['a', 'b'], strength: { a: 8 } },
    });

    expect(text).toContain('not sleeping');
    expect(text).toContain('snapping at people');
    expect(text).toContain('my sister');
    expect(text).toContain('a');
  });
});
