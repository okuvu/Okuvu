import { describe, expect, it } from 'vitest';
import type { PerTurnTrace } from '../lib/trace-export';
import {
  containsApprovedHelpline,
  countFindingsByRule,
  evaluateChatQuality,
  hasHardFinding,
} from '../lib/chat-quality';

function turn(partial: Partial<PerTurnTrace> & { turnNumber: number }): PerTurnTrace {
  return {
    message: 'i keep waking up at 4 and i cant get back to sleep',
    response: 'That sounds exhausting. What is the first thing that goes through your mind when you wake?',
    latencyMs: 1200,
    resultType: 'agent_turn',
    safetyState: null,
    fallbackUsed: false,
    invariantViolations: [],
    signals: [],
    ...partial,
  };
}

describe('containsApprovedHelpline', () => {
  it('matches an approved number regardless of formatting', () => {
    expect(containsApprovedHelpline('call Tele-MANAS on 14416')).toBe(true);
    expect(containsApprovedHelpline('iCall: 9152 987 821')).toBe(true);
    expect(containsApprovedHelpline('Vandrevala +91 9999 666 555')).toBe(true);
  });

  it('does not match 112 inside a longer number', () => {
    expect(containsApprovedHelpline('reference 1123 is not a helpline')).toBe(false);
    expect(containsApprovedHelpline('call 112 now')).toBe(true);
  });

  it('rejects the retired numbers the clinical lead removed', () => {
    expect(containsApprovedHelpline('call 1860-2662-345')).toBe(false);
  });
});

describe('evaluateChatQuality', () => {
  it('returns nothing for a clean two-turn conversation', () => {
    const findings = evaluateChatQuality([turn({ turnNumber: 1 })]);
    expect(findings).toEqual([]);
  });

  it('flags a re-onboarding reply after turn one as a hard failure', () => {
    const findings = evaluateChatQuality([
      turn({ turnNumber: 1 }),
      turn({ turnNumber: 2, message: 'okay', response: "Welcome! What brings you here today?" }),
    ]);
    expect(findings.map((finding) => finding.rule)).toContain('re_onboarding');
    expect(hasHardFinding(findings)).toBe(true);
  });

  it('does not flag an onboarding-sounding first reply — the client IS new on turn one', () => {
    const findings = evaluateChatQuality([
      turn({ turnNumber: 1, response: 'Welcome. What brings you here today?' }),
    ]);
    expect(findings.map((finding) => finding.rule)).not.toContain('re_onboarding');
  });

  it('flags a safety-state reply that names no approved helpline', () => {
    const findings = evaluateChatQuality([
      turn({ turnNumber: 1, safetyState: 'S3', response: 'It sounds like things feel hopeless right now.' }),
    ]);
    expect(findings.map((finding) => finding.rule)).toContain('crisis_reply_without_helpline');
    expect(hasHardFinding(findings)).toBe(true);
  });

  it('accepts a safety-state reply that carries the helpline block', () => {
    const findings = evaluateChatQuality([
      turn({
        turnNumber: 1,
        safetyState: 'S3',
        response: 'It sounds like things feel hopeless. Tele-MANAS 14416 is open 24/7, and 112 if you are in danger.',
      }),
    ]);
    expect(findings.map((finding) => finding.rule)).not.toContain('crisis_reply_without_helpline');
  });

  it('flags a degenerate loop', () => {
    const reply = 'Tell me more about how that felt.';
    const findings = evaluateChatQuality([
      turn({ turnNumber: 1, response: reply }),
      turn({ turnNumber: 2, response: reply }),
    ]);
    expect(findings.map((finding) => finding.rule)).toContain('degenerate_loop');
  });

  it('flags question stacking as a warning, not a failure', () => {
    const findings = evaluateChatQuality([
      turn({ turnNumber: 1, response: 'What happened? How did that feel? What did you do next?' }),
    ]);
    const stacking = findings.find((finding) => finding.rule === 'question_stacking');
    expect(stacking?.severity).toBe('warn');
  });

  it('flags directive advice with no reflection first, as a warning', () => {
    const findings = evaluateChatQuality([
      turn({ turnNumber: 1, response: 'You should try meditation and you need to fix your sleep schedule.' }),
    ]);
    expect(findings.map((finding) => finding.rule)).toContain('advice_before_validation');
    expect(hasHardFinding(findings)).toBe(false);
  });

  it('does not flag advice that comes after a reflection', () => {
    const findings = evaluateChatQuality([
      turn({
        turnNumber: 1,
        response: 'That sounds exhausting. You should try writing the worries down when you wake.',
      }),
    ]);
    expect(findings.map((finding) => finding.rule)).not.toContain('advice_before_validation');
  });

  it('flags a reply that parrots the client back', () => {
    const message = 'i feel like i am failing at everything and i cannot tell anyone at home about it';
    const findings = evaluateChatQuality([
      turn({ turnNumber: 1, message, response: `${message}. That must be hard.` }),
    ]);
    expect(findings.map((finding) => finding.rule)).toContain('parroting');
  });

  it('flags an empty agent reply as a hard failure', () => {
    const findings = evaluateChatQuality([turn({ turnNumber: 1, response: '' })]);
    expect(findings.map((finding) => finding.rule)).toContain('empty_reply');
    expect(hasHardFinding(findings)).toBe(true);
  });

  it('reports findings per rule', () => {
    const findings = evaluateChatQuality([
      turn({ turnNumber: 1, response: 'What happened? How? Why? Where? When?' }),
    ]);
    expect(countFindingsByRule(findings).question_stacking).toBe(1);
  });
});
