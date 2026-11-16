import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();

vi.mock('../lib/generate-content.js', () => ({
  generateContent: (...args: unknown[]) => generateContent(...args),
}));

import { buildMergedTriagePrompt, classifyTriage, isMergedTriageEnabled } from '../agents/merged/triage.js';

const ok = (text: string) => ({ text, fallbackUsed: false, model: 'test', canned: false });
const failed = (kind: 'timeout' | 'throttled' | 'unavailable') => ({
  text: 'unavailable',
  fallbackUsed: true,
  failureKind: kind,
  model: 'test',
  canned: false,
});

beforeEach(() => {
  generateContent.mockReset();
});

describe('merged triage prompt — a union, not a rewrite', () => {
  const prompt = buildMergedTriagePrompt();

  it('carries A1\'s approved rubric verbatim', () => {
    expect(prompt).toContain('THE SUPREMACY RULE');
    expect(prompt).toContain('THE AMBIGUITY LADDER');
    expect(prompt).toContain('S4 — Crisis');
  });

  it('carries A9-pre\'s approved rules verbatim', () => {
    expect(prompt).toContain('NEVER-RULES');
    expect(prompt).toContain('Blocked is narrow');
    expect(prompt).toContain('injection_attempt');
  });

  it('states the safety precedence over governance', () => {
    expect(prompt).toMatch(/crisis or self-harm\s+disclosure, the governance state is Active/);
  });

  it('has exactly one output contract', () => {
    expect(prompt.match(/Respond with valid JSON only/g) ?? []).toHaveLength(1);
    expect(prompt).toContain('"safetyState"');
    expect(prompt).toContain('"governanceState"');
  });

  it('sends safety rules before governance rules', () => {
    expect(prompt.indexOf('THE SUPREMACY RULE')).toBeLessThan(prompt.indexOf('NEVER-RULES'));
  });
});

describe('merged triage — one call, both answers', () => {
  it('returns safety and governance from a single response', async () => {
    generateContent.mockResolvedValueOnce(
      ok(
        JSON.stringify({
          safetyState: 'S2',
          crisis_language_detected: false,
          basis: 'contextual',
          signal_strength: 'medium',
          safety_notes: null,
          governanceState: 'Restricted',
          reasonCode: 'medication_request',
          confidence: 'high',
          governance_notes: null,
        }),
      ),
    );

    const result = await classifyTriage({ message: 'should I halve my dose?' });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.safety.safetyState).toBe('S2');
    expect(result.safety.fallbackUsed).toBe(false);
    expect(result.governance.governanceState).toBe('Restricted');
    expect(result.governance.reasonCode).toBe('medication_request');
    expect(result.fallbackUsed).toBe(false);
  });

  it('never lets the merged call take the flex lane', async () => {
    generateContent.mockResolvedValueOnce(
      ok(JSON.stringify({ safetyState: 'S0', crisis_language_detected: false, basis: 'literal', signal_strength: 'high', governanceState: 'Active', confidence: 'high' })),
    );

    await classifyTriage({ message: 'hello' });

    expect(generateContent.mock.calls[0][0].callRole).toBe('safety');
  });
});

describe('merged triage — fail-closed, field group by field group', () => {
  it('technical failure falls to S2 + Restricted', async () => {
    generateContent.mockResolvedValueOnce(failed('unavailable'));

    const result = await classifyTriage({ message: 'I am exhausted by work' });

    expect(result.safety.safetyState).toBe('S2');
    expect(result.governance.governanceState).toBe('Restricted');
    expect(result.fallbackUsed).toBe(true);
  });

  it('technical failure raises to S4 when the deterministic screen matches', async () => {
    generateContent.mockResolvedValueOnce(failed('timeout'));

    const result = await classifyTriage({ message: 'I want to kill myself tonight' });

    expect(result.safety.safetyState).toBe('S4');
    expect(result.safety.notes).toContain('crisis_keyword_floor');
  });

  it('a thrown call is the same fail-closed outcome as a returned failure', async () => {
    generateContent.mockRejectedValueOnce(new Error('boom'));

    const result = await classifyTriage({ message: 'nothing in particular' });

    expect(result.safety.safetyState).toBe('S2');
    expect(result.governance.governanceState).toBe('Restricted');
    expect(result.fallbackUsed).toBe(true);
  });

  it('unparseable text falls closed on both halves', async () => {
    generateContent.mockResolvedValueOnce(ok('I would rather not answer in JSON.'));

    const result = await classifyTriage({ message: 'hello' });

    expect(result.safety.safetyState).toBe('S2');
    expect(result.governance.governanceState).toBe('Restricted');
  });

  it('keeps a valid safety answer when only the governance fields are malformed', async () => {
    generateContent.mockResolvedValueOnce(
      ok(
        JSON.stringify({
          safetyState: 'S3',
          crisis_language_detected: true,
          basis: 'contextual',
          signal_strength: 'medium',
          governanceState: 'nonsense',
          confidence: 'certain',
        }),
      ),
    );

    const result = await classifyTriage({ message: 'everyone would be better off without me' });

    expect(result.safety.safetyState).toBe('S3');
    expect(result.safety.fallbackUsed).toBe(false);
    expect(result.governance.governanceState).toBe('Restricted');
    expect(result.governance.fallbackUsed).toBe(true);
    expect(result.fallbackUsed).toBe(true);
  });

  it('rejects an out-of-range safety state rather than passing it through', async () => {
    generateContent.mockResolvedValueOnce(
      ok(JSON.stringify({ safetyState: 'S9', crisis_language_detected: false, basis: 'literal', signal_strength: 'high', governanceState: 'Active', confidence: 'high' })),
    );

    const result = await classifyTriage({ message: 'hello' });

    expect(result.safety.safetyState).toBe('S2');
  });
});

describe('merged triage — the flag', () => {
  it('is off unless explicitly enabled', () => {
    expect(isMergedTriageEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isMergedTriageEnabled({ OKUVU_MERGED_TRIAGE: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });
});
