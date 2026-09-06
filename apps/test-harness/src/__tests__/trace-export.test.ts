import { describe, expect, it } from 'vitest';
import { exportTraceToClinicianFormat, type PerTurnTrace } from '../lib/trace-export';

function makeTurn(overrides: Partial<PerTurnTrace> = {}): PerTurnTrace {
  return {
    turnNumber: 1,
    message: 'Hi, I have been feeling anxious lately.',
    response: 'That sounds difficult. Can you tell me more?',
    latencyMs: 123.4,
    resultType: 'agent_turn',
    safetyState: 'S0',
    fallbackUsed: false,
    invariantViolations: [],
    signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S0', timestamp: '2026-01-01T00:00:00.000Z' }],
    ...overrides,
  };
}

describe('exportTraceToClinicianFormat', () => {
  it('round-trips the input structure through JSON', () => {
    const turns = [makeTurn(), makeTurn({ turnNumber: 2, message: 'Second turn' })];

    const { json } = exportTraceToClinicianFormat(turns);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(turns);
  });

  it('produces a CSV with the expected header row and one data row per turn', () => {
    const turns = [
      makeTurn(),
      makeTurn({ turnNumber: 2, message: 'Second turn', response: null, resultType: 'crisis', safetyState: 'S4' }),
    ];

    const { csv } = exportTraceToClinicianFormat(turns);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe(
      'turn_number,message,response,latency_ms,result_type,safety_state,fallback_used,invariant_violations',
    );
    expect(lines).toHaveLength(1 + turns.length);
    expect(lines[1]).toBe(
      '1,"Hi, I have been feeling anxious lately.",That sounds difficult. Can you tell me more?,123.4,agent_turn,S0,false,',
    );
    expect(lines[2]).toBe('2,Second turn,,123.4,crisis,S4,false,');
  });

  it('joins multiple invariant-violation rule names with a semicolon in CSV', () => {
    const turns = [
      makeTurn({
        invariantViolations: [
          { rule: 'signal-ordering', reason: 'bad order' },
          { rule: 'full-suppression', reason: 'should have suppressed' },
        ],
      }),
    ];

    const { csv } = exportTraceToClinicianFormat(turns);

    expect(csv.split('\r\n')[1]).toContain('signal-ordering; full-suppression');
  });

  it('handles an empty turns array', () => {
    const { json, csv } = exportTraceToClinicianFormat([]);

    expect(JSON.parse(json)).toEqual([]);
    expect(csv.split('\r\n')).toEqual([
      'turn_number,message,response,latency_ms,result_type,safety_state,fallback_used,invariant_violations',
    ]);
  });

  it('escapes commas and quotes in message/response fields for CSV', () => {
    const turns = [
      makeTurn({
        message: 'Message with, a comma and "quotes"',
        response: 'Line one\nline two',
      }),
    ];

    const { csv } = exportTraceToClinicianFormat(turns);
    const lines = csv.split('\r\n');

    // Message field is quoted with doubled internal quotes.
    expect(lines[1]).toContain('"Message with, a comma and ""quotes"""');
    // Response with an embedded newline is quoted (and its own newline is
    // preserved literally inside the quoted field, so it does not itself
    // introduce a new CSV row).
    expect(csv).toContain('"Line one\nline two"');
  });
});
