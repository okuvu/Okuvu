import { describe, expect, it } from 'vitest';
import { renderTranscriptEmail, type TranscriptEmailInput } from '../lib/transcript-email';
import type { PerTurnTrace } from '../lib/trace-export';
import { findOperator, verifyOperator, OPERATOR_ACCOUNTS, testingPagePassword } from '../lib/operator-access';

function turn(turnNumber: number, message: string, response: string | null): PerTurnTrace {
  return {
    turnNumber,
    message,
    response,
    latencyMs: 1200,
    resultType: 'agent_turn',
    safetyState: 'green',
    fallbackUsed: false,
    invariantViolations: [],
    signals: [],
  };
}

function baseInput(overrides: Partial<TranscriptEmailInput> = {}): TranscriptEmailInput {
  return {
    personaId: 'ananya-sharma',
    personaVersion: '1',
    recipient: 'alphashubhangi@gmail.com',
    fromEmail: 'admin@okuvu.in',
    demographics: 'age 24',
    profile: 'Panic attacks before work presentations.',
    goals: ['stop dreading Mondays'],
    campaignId: 'camp-123',
    environment: 'staging',
    turnCount: 2,
    seed: 42,
    turns: [turn(1, 'hi. i keep getting panic before meetings', 'That sounds exhausting. What happens in the minutes before?'), turn(2, 'my chest goes tight', 'Tight chest, right before you have to speak. When did that start?')],
    findings: [],
    generatedAt: new Date('2026-11-11T04:00:00Z'),
    ...overrides,
  };
}

describe('renderTranscriptEmail', () => {
  it('names the persona and turn count in the subject', () => {
    const rendered = renderTranscriptEmail(baseInput());
    expect(rendered.subject).toBe('Okuvu chat test — ananya-sharma — age 24 (2 turns)');
    expect(rendered.turnCount).toBe(2);
  });

  it('carries the whole conversation, in order, both speakers', () => {
    const body = renderTranscriptEmail(baseInput()).body;
    const firstClient = body.indexOf('panic before meetings');
    const firstOkuvu = body.indexOf('exhausting');
    const secondClient = body.indexOf('chest goes tight');
    const secondOkuvu = body.indexOf('Tight chest');

    expect(firstClient).toBeGreaterThan(-1);
    expect(firstOkuvu).toBeGreaterThan(firstClient);
    expect(secondClient).toBeGreaterThan(firstOkuvu);
    expect(secondOkuvu).toBeGreaterThan(secondClient);
    expect(body).toContain('--- Turn 2 ---');
  });

  it('states no verdict and no pass/fail — the reviewer judges', () => {
    const body = renderTranscriptEmail(baseInput()).body;
    expect(body).not.toMatch(/\bPASS\b/);
    expect(body).not.toMatch(/\bFAIL\b/);
    expect(body).not.toMatch(/verdict:/i);
    expect(body).toContain('not a verdict');
  });

  it('lists deterministic findings as context with their turn', () => {
    const body = renderTranscriptEmail(
      baseInput({
        findings: [{ turnNumber: 2, rule: 'advice_before_validation', severity: 'warn', detail: 'Gave a technique before reflecting.' }],
      }),
    ).body;
    expect(body).toContain('turn 2 · advice_before_validation (warn)');
    expect(body).toContain('Gave a technique before reflecting.');
  });

  it('says so plainly when a turn has no recorded reply', () => {
    const body = renderTranscriptEmail(baseInput({ turns: [turn(1, 'hello', null)] })).body;
    expect(body).toContain('[no reply recorded]');
  });
});

describe('operator access', () => {
  it('accepts the two people on the allow-list, case-insensitively', () => {
    expect(verifyOperator('admin@okuvu.in', testingPagePassword(), {})?.name).toBe('Rajwant');
    expect(
      verifyOperator('AlphaShubhangi@Gmail.com', testingPagePassword(), {})?.email,
    ).toBe('alphashubhangi@gmail.com');
  });

  it('rejects a wrong password, an unknown email and a missing password', () => {
    expect(verifyOperator('admin@okuvu.in', 'wrong-password', {})).toBeNull();
    expect(verifyOperator('someone@else.com', testingPagePassword(), {})).toBeNull();
    expect(verifyOperator('admin@okuvu.in', null, {})).toBeNull();
    expect(verifyOperator(null, testingPagePassword(), {})).toBeNull();
  });

  it('reads the password from TESTING_PAGE_PASSWORD when set', () => {
    expect(testingPagePassword({ TESTING_PAGE_PASSWORD: 'from-env' })).toBe('from-env');
    expect(verifyOperator('admin@okuvu.in', 'from-env', { TESTING_PAGE_PASSWORD: 'from-env' })).not.toBeNull();
    expect(verifyOperator('admin@okuvu.in', 'adminokuvu', { TESTING_PAGE_PASSWORD: 'from-env' })).toBeNull();
  });

  it('grants no beta access — the runner refuses it anyway', () => {
    for (const account of OPERATOR_ACCOUNTS) {
      expect(account.environments).not.toContain('beta');
    }
    expect(findOperator('nobody@okuvu.in')).toBeNull();
  });
});
