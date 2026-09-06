import { describe, it, expect } from 'vitest';
import {
  checkSignalOrdering,
  checkFullSuppression,
  checkS3GroundingOnly,
  checkPipelineInvariants,
} from '../lib/pipeline-invariants';
import type { PipelineSignal } from '@evia/shared-types';

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

  it('passes when governance=Blocked correctly routes to crisis, even at S0', () => {
    const signals = [signal('A1_result', 'A1', 'S0'), signal('A9_pre_result', 'A9-pre', 'Blocked')];
    expect(checkFullSuppression(signals, 'crisis')).toBeNull();
  });

  it('flags S4 that did NOT route to crisis', () => {
    const signals = [signal('A1_result', 'A1', 'S4'), signal('A9_pre_result', 'A9-pre', 'Active')];
    const violation = checkFullSuppression(signals, 'agent_turn');
    expect(violation?.rule).toBe('full-suppression');
  });

  it('flags governance=Blocked that did NOT route to crisis', () => {
    const signals = [signal('A1_result', 'A1', 'S1'), signal('A9_pre_result', 'A9-pre', 'Blocked')];
    const violation = checkFullSuppression(signals, 'agent_turn');
    expect(violation?.rule).toBe('full-suppression');
  });

  it('does not require suppression at S3 (grounding-only, not full suppression, is correct)', () => {
    const signals = [signal('A1_result', 'A1', 'S3'), signal('A9_pre_result', 'A9-pre', 'Active')];
    expect(checkFullSuppression(signals, 'agent_turn')).toBeNull();
  });
});

describe('checkS3GroundingOnly', () => {
  it('passes when S3 (non-Blocked) routes A2 to grounding-only mode', () => {
    const signals = [
      signal('A1_result', 'A1', 'S3'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'grounding-only' }),
    ];
    expect(checkS3GroundingOnly(signals)).toBeNull();
  });

  it('flags S3 routed to a non-grounding-only mode', () => {
    const signals = [
      signal('A1_result', 'A1', 'S3'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'normal' }),
    ];
    const violation = checkS3GroundingOnly(signals);
    expect(violation?.rule).toBe('s3-grounding-only');
  });

  it('does not apply when governance=Blocked overrides S3 to crisis', () => {
    const signals = [
      signal('A1_result', 'A1', 'S3'),
      signal('A9_pre_result', 'A9-pre', 'Blocked'),
      signal('A8_decision', 'A8', { agent: 'crisis' }),
    ];
    expect(checkS3GroundingOnly(signals)).toBeNull();
  });

  it('does not apply outside S3', () => {
    const signals = [
      signal('A1_result', 'A1', 'S0'),
      signal('A9_pre_result', 'A9-pre', 'Active'),
      signal('A8_decision', 'A8', { agent: 'A2', mode: 'normal' }),
    ];
    expect(checkS3GroundingOnly(signals)).toBeNull();
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
