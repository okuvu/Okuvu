import { describe, it, expect } from 'vitest';
import { selectSpecialists } from '../agents/a8-selection.js';
import { MAX_SPECIALISTS_PER_TURN } from '../agents/roster.js';

describe('A8 specialist selection', () => {
  it('defaults to A2 emotional regulation when no specific cue fires', () => {
    const out = selectSpecialists({ message: 'I had a long week and I feel low.', safetyState: 'S1' });
    expect(out.specialists).toEqual(['A2']);
    expect(out.blocked).toBe(false);
  });

  it('selects A3 for all-or-nothing language', () => {
    const out = selectSpecialists({ message: 'I always mess this up and everyone knows it.', safetyState: 'S1' });
    expect(out.specialists).toContain('A3');
  });

  it('selects A4 for withdrawal and no-energy language', () => {
    const out = selectSpecialists({ message: "I can't get out of bed and I have no energy at all.", safetyState: 'S1' });
    expect(out.specialists).toContain('A4');
  });

  it('selects A5 for a named relationship conflict', () => {
    const out = selectSpecialists({ message: 'My manager messages me at 11pm and I could not say no.', safetyState: 'S1' });
    expect(out.specialists).toContain('A5');
  });

  it('selects A6 for meaning and values language', () => {
    const out = selectSpecialists({ message: "I don't see the point of any of it anymore.", safetyState: 'S2' });
    expect(out.specialists).toContain('A6');
  });

  it('never selects more than two specialists', () => {
    const out = selectSpecialists({
      message: 'I always fail, everyone thinks so, I cannot move, my mother keeps pushing, and nothing matters.',
      safetyState: 'S1',
    });
    expect(out.specialists.length).toBeLessThanOrEqual(MAX_SPECIALISTS_PER_TURN);
  });

  it('returns nothing at S3 — safety gates selection, not cues', () => {
    const out = selectSpecialists({ message: 'I always fail and everyone hates me.', safetyState: 'S3' });
    expect(out.specialists).toEqual([]);
    expect(out.blocked).toBe(true);
    expect(out.rationale).toBe('safety_gated_S3');
  });

  it('returns nothing at S4', () => {
    const out = selectSpecialists({ message: 'I always fail and everyone hates me.', safetyState: 'S4' });
    expect(out.specialists).toEqual([]);
    expect(out.blocked).toBe(true);
  });

  it('returns nothing when governance is Blocked', () => {
    const out = selectSpecialists({ message: 'I need a diagnosis and medication.', safetyState: 'S1', governanceState: 'Blocked' });
    expect(out.specialists).toEqual([]);
    expect(out.blocked).toBe(true);
    expect(out.rationale).toBe('governance_blocked');
  });

  it('withholds A7 (transition) before eight sessions', () => {
    const message = 'I am getting better and we talked about fewer sessions.';
    expect(selectSpecialists({ message, safetyState: 'S1', sessionCount: 2 }).specialists).not.toContain('A7');
    expect(selectSpecialists({ message, safetyState: 'S1', sessionCount: 9 }).specialists).toContain('A7');
  });

  it('treats a missing or non-finite sessionCount as zero', () => {
    const message = 'I am getting better and we talked about fewer sessions.';
    for (const sessionCount of [undefined, NaN, Infinity]) {
      expect(selectSpecialists({ message, safetyState: 'S1', sessionCount }).specialists).not.toContain('A7');
    }
  });

  it('is deterministic — same input yields the same selection', () => {
    const args = { message: 'I always fail and my mother keeps asking.', safetyState: 'S1' as const, sessionCount: 3 };
    expect(selectSpecialists(args)).toEqual(selectSpecialists(args));
  });

  it('records why it chose, so a therapist can audit it', () => {
    const out = selectSpecialists({ message: 'I always fail.', safetyState: 'S1' });
    expect(out.rationale).toMatch(/^cues:/);
  });

  it('blocks invalid input rather than guessing', () => {
    const out = selectSpecialists({ message: undefined as unknown as string, safetyState: 'S1' });
    expect(out.blocked).toBe(true);
    expect(out.specialists).toEqual([]);
  });
});
