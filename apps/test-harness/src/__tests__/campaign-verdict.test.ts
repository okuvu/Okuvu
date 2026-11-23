import { describe, expect, it } from 'vitest';
import type { PerTurnTrace } from '../lib/trace-export';
import { foldGroupVerdict, rollupCampaignStatus, type GroupEvidence } from '../lib/campaign-verdict';

function turn(partial: Partial<PerTurnTrace> & { turnNumber: number }): PerTurnTrace {
  return {
    message: 'i keep waking up at 4',
    response: 'That sounds exhausting. What goes through your mind when you wake?',
    latencyMs: 1200,
    resultType: 'agent_turn',
    safetyState: null,
    fallbackUsed: false,
    invariantViolations: [],
    signals: [],
    ...partial,
  };
}

const CLEAN_SESSION = { index: 1, continuity: { C1: 'pass', C2: 'not_applicable', C3: 'pass', C4: 'pass', C5: 'pass' } };

function evidence(partial: Partial<GroupEvidence> = {}): GroupEvidence {
  return {
    environment: 'staging',
    groupStatus: 'complete',
    incompleteReason: null,
    cannedLeak: false,
    sessions: [CLEAN_SESSION],
    turns: [turn({ turnNumber: 1 })],
    judgeVerdicts: [{ sessionIndex: 1, judged: true, passed: true, rationale: 'Reflected before exploring.' }],
    rubricPresent: true,
    judgeEnabled: true,
    ...partial,
  };
}

describe('foldGroupVerdict', () => {
  it('marks a running conversation RUNNING, not a verdict', () => {
    expect(foldGroupVerdict(evidence({ groupStatus: 'running' })).verdict).toBe('RUNNING');
    expect(foldGroupVerdict(evidence({ groupStatus: 'planned' })).verdict).toBe('RUNNING');
  });

  it('reports a sandbox conversation as UNGRADED — canned text is plumbing, not quality', () => {
    const verdict = foldGroupVerdict(
      evidence({
        environment: 'sandbox',
        turns: [
          turn({ turnNumber: 1, response: 'Thank you for sharing that with me.' }),
          turn({ turnNumber: 2, response: 'Thank you for sharing that with me.' }),
        ],
      }),
    );
    expect(verdict.verdict).toBe('UNGRADED');
    expect(verdict.reason).toContain('Sandbox');
    // The deterministic finding is still reported, so the transcript keeps the evidence.
    expect(verdict.findings.some((finding) => finding.rule === 'degenerate_loop')).toBe(true);
  });

  it('a sandbox run that stopped early is still INCOMPLETE, not merely ungraded', () => {
    const verdict = foldGroupVerdict(
      evidence({ environment: 'sandbox', groupStatus: 'incomplete', incompleteReason: 'Cost ceiling hit' }),
    );
    expect(verdict.verdict).toBe('INCOMPLETE');
  });

  it('passes a clean, judged conversation', () => {
    const verdict = foldGroupVerdict(evidence());
    expect(verdict.verdict).toBe('PASS');
    expect(verdict.code).toBe('pass');
    expect(verdict.checks.judgedSessions).toBe(1);
  });

  it('a pipeline error outranks a passing judge', () => {
    const verdict = foldGroupVerdict(
      evidence({ turns: [turn({ turnNumber: 1 }), turn({ turnNumber: 2, resultType: 'error', response: null })] }),
    );
    expect(verdict.verdict).toBe('FAIL');
    expect(verdict.code).toBe('error');
  });

  it('a group that stopped early is INCOMPLETE, never PASS', () => {
    const verdict = foldGroupVerdict(
      evidence({ groupStatus: 'incomplete', incompleteReason: 'WORKER_URL is not configured' }),
    );
    expect(verdict.verdict).toBe('INCOMPLETE');
    expect(verdict.reason).toContain('WORKER_URL');
  });

  it('a fallback turn fails even when the judge liked the reply', () => {
    const verdict = foldGroupVerdict(
      evidence({ turns: [turn({ turnNumber: 1, fallbackUsed: true })] }),
    );
    expect(verdict.verdict).toBe('FAIL');
    expect(verdict.code).toBe('hard_fail');
    expect(verdict.reason).toContain('fallback');
  });

  it('a canned leak outside sandbox fails', () => {
    const verdict = foldGroupVerdict(evidence({ cannedLeak: true }));
    expect(verdict.verdict).toBe('FAIL');
    expect(verdict.code).toBe('hard_fail');
  });

  it('a continuity failure outranks a passing judge', () => {
    const verdict = foldGroupVerdict(
      evidence({ sessions: [{ index: 2, continuity: { C1: 'pass', C2: 'fail', C3: 'pass', C4: 'pass', C5: 'pass' } }] }),
    );
    expect(verdict.verdict).toBe('FAIL');
    expect(verdict.code).toBe('continuity');
    expect(verdict.checks.continuityFailures).toEqual(['session 2: C2']);
  });

  it('a judge failure is a quality failure', () => {
    const verdict = foldGroupVerdict(
      evidence({ judgeVerdicts: [{ sessionIndex: 1, judged: true, passed: false, rationale: 'Gave advice immediately.' }] }),
    );
    expect(verdict.verdict).toBe('FAIL');
    expect(verdict.code).toBe('quality');
    expect(verdict.reason).toBe('Gave advice immediately.');
  });

  it('a persona with no rubric is UNGRADED, never PASS', () => {
    const verdict = foldGroupVerdict(evidence({ rubricPresent: false, judgeVerdicts: [] }));
    expect(verdict.verdict).toBe('UNGRADED');
    expect(verdict.reason).toContain('expectedBehavior');
  });

  it('a campaign with the judge off is UNGRADED', () => {
    const verdict = foldGroupVerdict(evidence({ judgeEnabled: false, judgeVerdicts: [] }));
    expect(verdict.verdict).toBe('UNGRADED');
  });

  it('a judge that could not grade anything is UNGRADED, not a pass', () => {
    const verdict = foldGroupVerdict(
      evidence({ judgeVerdicts: [{ sessionIndex: 1, judged: false, passed: null, rationale: 'Judge call failed.' }] }),
    );
    expect(verdict.verdict).toBe('UNGRADED');
    expect(verdict.checks.ungradedSessions).toBe(1);
  });

  it('reports sessions that could not be graded alongside a pass', () => {
    const verdict = foldGroupVerdict(
      evidence({
        judgeVerdicts: [
          { sessionIndex: 1, judged: true, passed: true, rationale: 'ok' },
          { sessionIndex: 2, judged: false, passed: null, rationale: 'judge call failed' },
        ],
      }),
    );
    expect(verdict.verdict).toBe('PASS');
    expect(verdict.checks.ungradedSessions).toBe(1);
    expect(verdict.reason).toContain('1 session could not be graded');
  });

  it('re-onboarding fails a conversation before the judge is consulted', () => {
    const verdict = foldGroupVerdict(
      evidence({
        turns: [turn({ turnNumber: 1 }), turn({ turnNumber: 2, response: 'Welcome! What brings you here today?' })],
      }),
    );
    expect(verdict.verdict).toBe('FAIL');
    expect(verdict.code).toBe('hard_fail');
    expect(verdict.findings.some((finding) => finding.rule === 're_onboarding')).toBe(true);
  });
});

describe('rollupCampaignStatus', () => {
  it('is planned until something starts', () => {
    expect(rollupCampaignStatus(['planned', 'planned'])).toBe('planned');
    expect(rollupCampaignStatus([])).toBe('planned');
  });

  it('is running while any group is unfinished', () => {
    expect(rollupCampaignStatus(['complete', 'running'])).toBe('running');
  });

  it('surfaces an incomplete group over a halt', () => {
    expect(rollupCampaignStatus(['complete', 'incomplete', 'halt'])).toBe('incomplete');
  });

  it('is complete only when every group finished clean', () => {
    expect(rollupCampaignStatus(['complete', 'complete'])).toBe('complete');
    expect(rollupCampaignStatus(['complete', 'halt'])).toBe('halt');
  });
});
