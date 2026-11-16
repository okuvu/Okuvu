import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  compactHistory,
  compactionEnabled,
  DEFAULT_KEEP_LAST,
  type ConversationTurn,
} from '../agents/a2/history-compaction.js';

/**
 * A2 re-sends the whole session on every turn, so history is the one input that
 * grows without bound. These tests pin the three rules that make bounding it
 * safe — risk-pinned, crisis-pinned, no paraphrase — because the failure mode of
 * a summariser on a therapy transcript is that a disclosure quietly becomes
 * small talk.
 */

function turns(count: number, prefix = 'message'): ConversationTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `${prefix} ${i + 1}`,
  }));
}

describe('A2 history compaction', () => {
  const saved = { OKUVU_A2_HISTORY_COMPRESSION: process.env.OKUVU_A2_HISTORY_COMPRESSION };

  beforeEach(() => {
    delete process.env.OKUVU_A2_HISTORY_COMPRESSION;
  });

  afterEach(() => {
    if (saved.OKUVU_A2_HISTORY_COMPRESSION === undefined) delete process.env.OKUVU_A2_HISTORY_COMPRESSION;
    else process.env.OKUVU_A2_HISTORY_COMPRESSION = saved.OKUVU_A2_HISTORY_COMPRESSION;
  });

  it('is on by default and turned off only by exactly "off"', () => {
    expect(compactionEnabled({})).toBe(true);
    expect(compactionEnabled({ OKUVU_A2_HISTORY_COMPRESSION: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(compactionEnabled({ OKUVU_A2_HISTORY_COMPRESSION: 'off' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('leaves a short history alone', () => {
    const history = turns(4);
    const outcome = compactHistory(history, { safetyState: 'S0' });

    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('short');
    expect(outcome.turns).toEqual(history);
  });

  it('does not compact a session that is not at S0', () => {
    for (const safetyState of ['S1', 'S2'] as const) {
      const history = turns(20);
      const outcome = compactHistory(history, { safetyState });
      expect(outcome.compacted).toBe(false);
      expect(outcome.reason).toBe('risk-pinned');
      expect(outcome.turns).toEqual(history);
    }
  });

  it('does not compact a history that contains a crisis disclosure, however old', () => {
    const history = turns(20);
    // Turn 1 of 20 — deep inside what would be folded.
    history[0] = { role: 'user', content: 'I want to die' };

    const outcome = compactHistory(history, { safetyState: 'S0' });

    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('crisis-in-history');
    expect(outcome.turns).toEqual(history);
  });

  it('does not compact a history with third-party risk language either', () => {
    const history = turns(20);
    history[1] = { role: 'user', content: 'my brother wants to kill himself' };

    const outcome = compactHistory(history, { safetyState: 'S0' });

    expect(outcome.reason).toBe('crisis-in-history');
  });

  it('folds the older turns into one digest and keeps the tail verbatim', () => {
    const history = turns(20, 'week');
    const outcome = compactHistory(history, { safetyState: 'S0' });

    expect(outcome.compacted).toBe(true);
    expect(outcome.reason).toBe('compacted');
    expect(outcome.omitted).toBe(20 - DEFAULT_KEEP_LAST);

    // digest turn + the untouched tail
    expect(outcome.turns).toHaveLength(1 + DEFAULT_KEEP_LAST);
    expect(outcome.turns[0]?.role).toBe('user');
    expect(outcome.turns[0]?.content).toContain('14 earlier turns');
    expect(outcome.turns.slice(1)).toEqual(history.slice(-DEFAULT_KEEP_LAST));
  });

  it('truncates rather than paraphrases — the client’s own words survive at the head of each line', () => {
    const long = 'x'.repeat(500);
    const history: ConversationTurn[] = [
      { role: 'user', content: `start-of-the-disclosure ${long}` },
      ...turns(12),
    ];

    const outcome = compactHistory(history, { safetyState: 'S0' });
    const digest = outcome.turns[0]?.content ?? '';

    expect(digest).toContain('start-of-the-disclosure');
    // Truncation marker, and no sentence of the model's own invention.
    expect(digest).toContain('…');
    expect(digest).not.toContain(long);
  });

  it('respects the digest character cap so a long history cannot become the thing it was meant to shrink', () => {
    const history = turns(60, 'x'.repeat(300));
    const outcome = compactHistory(history, { safetyState: 'S0', maxDigestChars: 300 });

    expect(outcome.compacted).toBe(true);
    expect((outcome.turns[0]?.content ?? '').length).toBeLessThan(600);
    expect(outcome.omitted).toBe(60 - DEFAULT_KEEP_LAST);
  });

  it('does nothing when the flag is off, even for a compactable history', () => {
    const history = turns(20);
    const outcome = compactHistory(history, { safetyState: 'S0', enabled: false });

    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('disabled');
    expect(outcome.turns).toEqual(history);
  });
});
