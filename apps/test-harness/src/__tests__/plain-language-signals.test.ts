import { describe, expect, it } from 'vitest';
import { getPlainLanguageRows, getRowColorClass } from '../lib/plain-language-signals';
import type { PipelineSignal } from '@evia/shared-types';

function signal(boundary: string, payload: unknown): PipelineSignal {
  return { boundary, agent: 'orchestrator', payload, timestamp: '2026-01-01T00:00:00.000Z' };
}

describe('getPlainLanguageRows', () => {
  it('maps each A1 safety state to the expected label/status', () => {
    const cases: [string, 'ok' | 'warning' | 'blocked'][] = [
      ['S0', 'ok'],
      ['S1', 'ok'],
      ['S2', 'warning'],
      ['S3', 'warning'],
      ['S4', 'blocked'],
    ];

    for (const [state, status] of cases) {
      const rows = getPlainLanguageRows([signal('A1_result', state)], 'agent_turn');
      const safetyRow = rows.find((r) => r.label === 'Safety check');
      expect(safetyRow?.status).toBe(status);
    }
  });

  it('flags a governance block as blocked', () => {
    const rows = getPlainLanguageRows([signal('A9_pre_result', 'Blocked')], 'agent_turn');
    const row = rows.find((r) => r.label === 'Pre-response review');
    expect(row?.status).toBe('blocked');
    expect(row?.detail).toContain('held for review');
  });

  it('reports a normal turn as ok across the reply + post-review rows', () => {
    const signals: PipelineSignal[] = [
      signal('A1_result', 'S0'),
      signal('A9_pre_result', 'Active'),
      signal('A8_decision', { agent: 'A2', mode: 'normal' }),
      signal('A2_result', { userContent: 'hi', fallbackUsed: false }),
      signal('A9_post_result', { decision: 'APPROVED' }),
    ];

    const rows = getPlainLanguageRows(signals, 'agent_turn');
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.status === 'ok')).toBe(true);
  });

  it('shows a blocked post-response review when A9-post blocks the reply', () => {
    const rows = getPlainLanguageRows([signal('A9_post_result', { decision: 'BLOCKED' })], 'agent_turn');
    const row = rows.find((r) => r.label === 'Post-response review');
    expect(row?.status).toBe('blocked');
  });

  it('omits rows for boundaries that never fired on the crisis silence path', () => {
    const rows = getPlainLanguageRows([signal('A1_result', 'S4')], 'crisis');
    expect(rows.map((r) => r.label)).toEqual(['Safety check', 'Response generated']);
    expect(rows.find((r) => r.label === 'Response generated')?.status).toBe('blocked');
  });

  it('returns rows in fixed pipeline order regardless of input array order', () => {
    const signals: PipelineSignal[] = [
      signal('A9_post_result', { decision: 'APPROVED' }),
      signal('A1_result', 'S0'),
      signal('A2_result', { userContent: 'hi', fallbackUsed: false }),
    ];

    const rows = getPlainLanguageRows(signals, 'agent_turn');
    expect(rows.map((r) => r.label)).toEqual(['Safety check', 'Response generated', 'Post-response review']);
  });
});

describe('getRowColorClass', () => {
  it('returns a distinct class per status', () => {
    const ok = getRowColorClass('ok');
    const warning = getRowColorClass('warning');
    const blocked = getRowColorClass('blocked');
    expect(new Set([ok, warning, blocked]).size).toBe(3);
  });
});
