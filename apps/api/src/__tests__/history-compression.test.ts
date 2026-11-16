import { describe, it, expect } from 'vitest';

import {
  compressHistory,
  isHistoryCompressionEnabled,
} from '../lib/history-compression.js';

const turn = (content: string, role: 'user' | 'assistant' = 'user') => ({ role, content });

describe('history compression — the short path is free', () => {
  it('returns the same array reference when there is nothing old enough', () => {
    const turns = Array.from({ length: 8 }, (_, i) => turn(`message ${i}`));
    const result = compressHistory(turns, { keepRecent: 8 });
    expect(result.turns).toBe(turns);
    expect(result.stats.clipped).toBe(0);
    expect(result.stats.charsOut).toBe(result.stats.charsIn);
  });

  it('is off unless explicitly switched on', () => {
    expect(isHistoryCompressionEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isHistoryCompressionEnabled({ OKUVU_A2_HISTORY_COMPRESSION: 'on' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe('history compression — what it keeps', () => {
  it('keeps the newest turns word for word', () => {
    const long = 'x'.repeat(400);
    const turns = [turn(`old ${long}`), turn(long), turn('recent one'), turn('recent two')];
    const result = compressHistory(turns, { keepRecent: 2, maxCharsPerOldTurn: 80 });

    expect(result.turns.slice(-2).map((t) => t.content)).toEqual(['recent one', 'recent two']);
  });

  it('clips an older turn to its first clause rather than paraphrasing it', () => {
    const body = `I could not sleep last night. ${'and then a long rambling story '.repeat(20)}`;
    const result = compressHistory([turn(body), turn('a'), turn('b')], {
      keepRecent: 2,
      maxCharsPerOldTurn: 60,
    });

    const first = result.turns[0].content;
    expect(first.startsWith('I could not sleep last night.')).toBe(true);
    expect(first.length).toBeLessThan(body.length);
    expect(first.endsWith('…')).toBe(true);
  });

  it('never invents text — every compressed turn begins with its own words', () => {
    const turns = [
      turn('Work has been impossible since the reorg happened in March.'),
      turn('So I stopped answering their messages entirely.'),
      turn('now'),
      turn('now2'),
    ];
    const result = compressHistory(turns, { keepRecent: 2, maxCharsPerOldTurn: 30 });

    for (let i = 0; i < 2; i++) {
      expect(turns[i].content.startsWith(result.turns[i].content.replace(/…$/, ''))).toBe(true);
    }
  });

  it('preserves turn order and role', () => {
    const turns = [
      turn('a'.repeat(300), 'user'),
      turn('b'.repeat(300), 'assistant'),
      turn('c'),
      turn('d'),
    ];
    const result = compressHistory(turns, { keepRecent: 2 });
    expect(result.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'user']);
  });
});

describe('history compression — safety history is never summarised away', () => {
  it('keeps a crisis disclosure word for word even when it is old', () => {
    const disclosure = 'I want to kill myself. I have been saving my father\'s sleeping pills for a week.';
    const turns = [turn(disclosure), ...Array.from({ length: 10 }, (_, i) => turn(`filler ${i}`))];
    const result = compressHistory(turns, { keepRecent: 4, maxCharsPerOldTurn: 40 });

    expect(result.turns[0].content).toBe(disclosure);
    expect(result.stats.pinnedForSafety).toBe(1);
  });

  it('keeps pinned history even when the character budget is already spent', () => {
    // A form the deterministic screen catches (it requires a quantity word —
    // "I took my pills" is deliberately not a crisis, "a bunch of" is).
    const disclosure = 'I already took a bunch of my sleeping pills.';
    const turns = [
      turn('z'.repeat(500)),
      turn(disclosure),
      turn('tail'),
      turn('tail2'),
    ];
    // A 10-character budget is already exhausted by the first clip.
    const result = compressHistory(turns, { keepRecent: 2, maxCharsPerOldTurn: 10, maxTotalChars: 10 });

    expect(result.turns.map((t) => t.content)).toContain(disclosure);
  });

  it('documents the limit: only what the crisis screen catches is pinned', () => {
    // "I already took something" has no quantity word, so `crisis-keywords.ts`
    // deliberately does not match it (it would fire on "I took my pills this
    // morning"). Compression therefore clips it. This is the pinned-history
    // boundary, asserted rather than assumed, so widening the screen is a
    // visible decision rather than a silent change in what survives.
    const vague = 'I already took something. I do not know how much.';
    const turns = [turn(vague), turn('a'), turn('b')];
    const result = compressHistory(turns, { keepRecent: 2, maxCharsPerOldTurn: 20 });

    expect(result.stats.pinnedForSafety).toBe(0);
  });
});

describe('history compression — the saving is real', () => {
  it('cuts a 60-turn transcript to a fraction of its characters', () => {
    const turns = Array.from({ length: 60 }, (_, i) =>
      turn(`Turn ${i}: ${'I keep going over the same argument with my mother. '.repeat(6)}`),
    );
    const result = compressHistory(turns, { keepRecent: 8 });

    expect(result.stats.charsOut).toBeLessThan(result.stats.charsIn * 0.35);
    expect(result.turns.length).toBe(60);
  });
});
