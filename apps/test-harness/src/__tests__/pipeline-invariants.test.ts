import { describe, it, expect } from 'vitest';
import {
  checkSignalOrdering,
  checkFullSuppression,
  checkGovernanceBlockedMode,
  checkS3Deterministic,
  checkPipelineInvariants,
} from '../lib/pipeline-invariants';
import type { PipelineSignal } from '@okuvu/shared-types';

const ts = '2026-01-01T00:00:00.000Z';

function signal(boundary: string, agent: PipelineSignal['agent'], payload: unknown): PipelineSignal {
  return { boundary, agent, payload, timestamp: ts };
}

describe('checkSignalOrdering', () => {
  it('passes for a normal agent_turn ordering', () => {
    const signals = [
      signal('A1_result', 'A1', 'S0'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'normal' }),
      signal('A2_result', 'A2', {}),
      signal('A9_post_result', 'A9-post', {}),
    ];
    expect(checkSignalOrdering(signals)).toBeNull();
  });

  it('passes for the shorter crisis-path subset (A1, A9-pre, A8 only)', () => {
    const signals = [
      signal('A1_result', 'A1', 'S4'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'crisis' }),
    ];
    expect(checkSignalOrdering(signals)).toBeNull();
  });

  it('flags an out-of-order signal bus', () => {
    const signals = [
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A1_result', 'A1', 'S0'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'normal' }),
    ];
    const violation = checkSignalOrdering(signals);
    expect(violation?.rule).toBe('signal-ordering');
  });
});

describe('checkFullSuppression', () => {
  it('passes when S4 correctly routes to crisis', () => {
    const signals = [signal('A1_result', 'A1', 'S4'), signal('A9_pre_result', 'A9-pre', 'Active')];
    expect(checkFullSuppression(signals, 'crisis')).toBeNull();
  });

  it('flags S4 that did NOT route to crisis', () => {
    const signals = [signal('A1_result', 'A1', 'S4'), signal('A9_pre_result', 'A9-pre', 'Active')];
    const violation = checkFullSuppression(signals, 'agent_turn');
    expect(violation?.rule).toBe('full-suppression');
  });

  it('does not require suppression at S3 (deterministic-grounding, not full suppression, is correct)', () => {
    const signals = [signal('A1_result', 'A1', 'S3'), signal('A9_pre_result', 'A9-pre', 'Active')];
    expect(checkFullSuppression(signals, 'agent_turn')).toBeNull();
  });

  it('does not require suppression for governance=Blocked at a non-S4 safety state routed to A2 mode=blocked (see checkGovernanceBlockedMode)', () => {
    const signals = [signal('A1_result', 'A1', 'S1'), signal('A9_pre_result', 'A9-pre', 'Blocked')];
    expect(checkFullSuppression(signals, 'agent_turn')).toBeNull();
  });

  // Live E2E re-run of the OKUVU findings (2026-09-07) caught this direction
  // was missing: crisis forced at a non-S4 safety state via a testMode
  // override (simulating a future regression, independent of the specific
  // Blocked-coercion bug) produced zero invariant violations.
  it('flags crisis at a non-S4 safety state (governance Active, not Blocked)', () => {
    for (const s of ['S0', 'S1', 'S2', 'S3'] as const) {
      const signals = [signal('A1_result', 'A1', s), signal('A9_pre_result', 'A9-pre', 'Active')];
      const violation = checkFullSuppression(signals, 'crisis');
      expect(violation?.rule).toBe('full-suppression');
    }
  });

  it('flags crisis at a non-S4 safety state even when governance is Blocked', () => {
    const signals = [signal('A1_result', 'A1', 'S0'), signal('A9_pre_result', 'A9-pre', 'Blocked')];
    const violation = checkFullSuppression(signals, 'crisis');
    expect(violation?.rule).toBe('full-suppression');
  });
});

describe('checkGovernanceBlockedMode', () => {
  it('passes when governance=Blocked (non-S4) correctly routes to A2 mode=blocked', () => {
    const signals = [
      signal('A1_result', 'A1', 'S0'),
      signal('A9_pre_result', 'A9-pre', 'Blocked'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'blocked' }),
    ];
    expect(checkGovernanceBlockedMode(signals, 'agent_turn')).toBeNull();
  });

  it('flags governance=Blocked (non-S4) routed to A2 in the wrong mode', () => {
    const signals = [
      signal('A1_result', 'A1', 'S0'),
      signal('A9_pre_result', 'A9-pre', 'Blocked'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'normal' }),
    ];
    const violation = checkGovernanceBlockedMode(signals, 'agent_turn');
    expect(violation?.rule).toBe('governance-blocked-not-crisis');
  });

  it('does not apply when governance is Blocked AND safety is S4 (crisis is correct there)', () => {
    const signals = [signal('A1_result', 'A1', 'S4'), signal('A9_pre_result', 'A9-pre', 'Blocked')];
    expect(checkGovernanceBlockedMode(signals, 'crisis')).toBeNull();
  });

  it('does not apply when governance is not Blocked', () => {
    const signals = [signal('A1_result', 'A1', 'S0'), signal('A9_pre_result', 'A9-pre', 'Active')];
    expect(checkGovernanceBlockedMode(signals, 'agent_turn')).toBeNull();
  });

  it('does not apply to resultType=crisis (that direction is checkFullSuppression\'s job now)', () => {
    const signals = [signal('A1_result', 'A1', 'S0'), signal('A9_pre_result', 'A9-pre', 'Blocked')];
    expect(checkGovernanceBlockedMode(signals, 'crisis')).toBeNull();
  });

  it('does not apply when safety is S3 — deterministic-grounding takes precedence over Blocked (OKUVU v2.0, checkS3Deterministic\'s job now)', () => {
    const signals = [
      signal('A1_result', 'A1', 'S3'),
      signal('A9_pre_result', 'A9-pre', 'Blocked'),
      signal('A8_decision', 'A8', { agent: 'deterministic-grounding' }),
    ];
    expect(checkGovernanceBlockedMode(signals, 'agent_turn')).toBeNull();
  });
});

describe('checkS3Deterministic (OKUVU v2.0 — S3 is deterministic, same tier as S4/crisis)', () => {
  it('passes when S3 routes to agent=deterministic-grounding', () => {
    const signals = [
      signal('A1_result', 'A1', 'S3'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'deterministic-grounding' }),
    ];
    expect(checkS3Deterministic(signals, 'agent_turn')).toBeNull();
  });

  it('flags S3 routed to A2 instead of deterministic-grounding', () => {
    const signals = [
      signal('A1_result', 'A1', 'S3'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'normal' }),
    ];
    const violation = checkS3Deterministic(signals, 'agent_turn');
    expect(violation?.rule).toBe('s3-deterministic');
  });

  it('S3 takes precedence over governance=Blocked — still routes to deterministic-grounding, not A2 blocked mode', () => {
    const signals = [
      signal('A1_result', 'A1', 'S3'),
      signal('A9_pre_result', 'A9-pre', 'Blocked'),
      signal('A8_decision', 'A8', { agent: 'deterministic-grounding' }),
    ];
    expect(checkS3Deterministic(signals, 'agent_turn')).toBeNull();
  });

  it('flags S3 with governance=Blocked incorrectly routed to A2 blocked mode instead of deterministic-grounding', () => {
    const signals = [
      signal('A1_result', 'A1', 'S3'),
      signal('A9_pre_result', 'A9-pre', 'Blocked'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'blocked' }),
    ];
    const violation = checkS3Deterministic(signals, 'agent_turn');
    expect(violation?.rule).toBe('s3-deterministic');
  });

  it('does not apply outside S3', () => {
    const signals = [
      signal('A1_result', 'A1', 'S0'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'normal' }),
    ];
    expect(checkS3Deterministic(signals, 'agent_turn')).toBeNull();
  });

  it('flags agent=deterministic-grounding fired at a non-S3 safety state', () => {
    const signals = [
      signal('A1_result', 'A1', 'S1'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'deterministic-grounding' }),
    ];
    const violation = checkS3Deterministic(signals, 'agent_turn');
    expect(violation?.rule).toBe('s3-deterministic');
  });
});

describe('checkPipelineInvariants', () => {
  it('returns an empty array for a fully clean signal bus', () => {
    const signals = [
      signal('A1_result', 'A1', 'S0'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'normal' }),
      signal('A2_result', 'A2', {}),
      signal('A9_post_result', 'A9-post', {}),
    ];
    expect(checkPipelineInvariants(signals, 'agent_turn')).toEqual([]);
  });

  it('collects multiple simultaneous violations', () => {
    // Out of order AND S4 that didn't suppress.
    const signals = [signal('A9_pre_result', 'A9-pre', 'Active'), signal('A1_result', 'A1', 'S4')];
    const violations = checkPipelineInvariants(signals, 'agent_turn');
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain('signal-ordering');
    expect(rules).toContain('full-suppression');
  });
});
