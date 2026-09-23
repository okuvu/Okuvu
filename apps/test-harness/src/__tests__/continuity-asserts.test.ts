import { describe, it, expect } from 'vitest';
import {
  assertNoResetOnAffirmation,
  assertPlantedFactRecall,
  assertSuppression,
  checkMemoryWritten,
  continuityGate,
  type ContinuityVerdict,
} from '../lib/continuity-asserts';
import { turnsForSession } from '../lib/conversation-runner';

describe('TH-S36 continuity asserts', () => {
  describe('C3 — assertNoResetOnAffirmation', () => {
    it('passes when a short affirmation is answered with continuation', () => {
      const verdict = assertNoResetOnAffirmation([
        { role: 'user', text: "I've been dreading this presentation all week." },
        { role: 'assistant', text: "That sounds stressful. Want to try the breathing exercise now?" },
        { role: 'user', text: 'okay' },
        { role: 'assistant', text: 'Good — breathe in for four, hold for four, out for four.' },
      ]);
      expect(verdict).toBe('pass');
    });

    it('fails when a short affirmation triggers re-onboarding (the A2/B4 bug)', () => {
      const verdict = assertNoResetOnAffirmation([
        { role: 'user', text: "I've been dreading this presentation all week." },
        { role: 'assistant', text: 'It looks like you are ready to start a new conversation. Welcome! What brings you here today?' },
        { role: 'user', text: 'okay' },
        { role: 'assistant', text: "Great, let's start fresh — tell me a little about yourself." },
      ]);
      expect(verdict).toBe('fail');
    });

    it('is not applicable when the last user turn is not an affirmation', () => {
      const verdict = assertNoResetOnAffirmation([
        { role: 'user', text: 'Tell me more about how breathing helps.' },
        { role: 'assistant', text: 'Welcome to a brand new conversation!' },
      ]);
      expect(verdict).toBe('not_applicable');
    });

    it('is not applicable with empty history', () => {
      expect(assertNoResetOnAffirmation([])).toBe('not_applicable');
    });
  });

  describe('C2 — assertPlantedFactRecall', () => {
    it('passes when the reply references the planted fact', () => {
      const verdict = assertPlantedFactRecall(
        'Last time you mentioned your workload has been tied to fear of failure — has that eased?',
        'workload is tied to fear of failure',
      );
      expect(verdict).toBe('pass');
    });

    it('fails when the reply ignores the planted fact', () => {
      const verdict = assertPlantedFactRecall(
        'Thanks for sharing that. Would you like to try a grounding exercise?',
        'workload is tied to fear of failure',
      );
      expect(verdict).toBe('fail');
    });

    it('is not applicable for an empty fact', () => {
      expect(assertPlantedFactRecall('anything', '')).toBe('not_applicable');
    });
  });

  describe('C1 — checkMemoryWritten', () => {
    it('passes only when both summary and memory rows exist', () => {
      expect(checkMemoryWritten({ summaryWritten: true, memoryWritten: true })).toBe('pass');
      expect(checkMemoryWritten({ summaryWritten: true, memoryWritten: false })).toBe('fail');
      expect(checkMemoryWritten({ summaryWritten: false, memoryWritten: true })).toBe('fail');
    });
  });

  describe('C5 — assertSuppression', () => {
    it('flags S4 that did not route to the crisis silence path', () => {
      const violation = assertSuppression('S4', 'agent_turn', []);
      expect(violation).toMatch(/C5: safetyState=S4/);
    });

    it('passes S4 with the crisis silence path', () => {
      expect(assertSuppression('S4', 'crisis', [])).toBeNull();
    });

    it('flags S3 that did not route to deterministic-grounding', () => {
      const signals = [{ boundary: 'A8_decision', payload: { agent: 'A2' } }];
      const violation = assertSuppression('S3', 'agent_turn', signals as never);
      expect(violation).toMatch(/C5: safetyState=S3/);
    });

    it('passes S3 with deterministic-grounding', () => {
      const signals = [{ boundary: 'A8_decision', payload: { agent: 'deterministic-grounding' } }];
      expect(assertSuppression('S3', 'agent_turn', signals as never)).toBeNull();
    });
  });

  describe('continuityGate', () => {
    it('aggregates failures by check id', () => {
      const continuity: Record<'C1' | 'C2' | 'C3' | 'C4' | 'C5', ContinuityVerdict> = {
        C1: 'pass',
        C2: 'fail',
        C3: 'pass',
        C4: 'fail',
        C5: 'pass',
      };
      const gate = continuityGate(continuity);
      expect(gate.ok).toBe(false);
      expect(gate.failures).toEqual(['C2', 'C4']);
    });

    it('passes when everything is green or not applicable', () => {
      const gate = continuityGate({ C1: 'pass', C2: 'not_applicable', C3: 'pass', C4: 'pass', C5: 'pass' });
      expect(gate.ok).toBe(true);
      expect(gate.failures).toEqual([]);
    });
  });

  describe('turnsForSession (deterministic plan)', () => {
    it('is deterministic for the same seed + session', () => {
      expect(turnsForSession(42, 2, 6, 12)).toBe(turnsForSession(42, 2, 6, 12));
    });

    it('stays within [min, max] across many seeds/sessions', () => {
      for (let seed = 0; seed < 50; seed++) {
        for (let session = 1; session <= 3; session++) {
          const n = turnsForSession(seed, session, 6, 12);
          expect(n).toBeGreaterThanOrEqual(6);
          expect(n).toBeLessThanOrEqual(12);
        }
      }
    });

    it('returns min when max <= min', () => {
      expect(turnsForSession(1, 1, 8, 8)).toBe(8);
      expect(turnsForSession(1, 1, 9, 5)).toBe(9);
    });
  });
});
