import { describe, it, expect } from 'vitest';
import { buildRunsWorkbook, extractTurns, MAX_EXPORT_ROWS, type ExportRunRow } from '../lib/workbook-export';
import * as XLSX from 'xlsx';

function makeRun(overrides: Partial<ExportRunRow> & { id: string }): ExportRunRow {
  return {
    environment: 'staging',
    status: 'pass',
    canned: false,
    created_at: new Date('2026-09-22T10:00:00Z'),
    completed_at: new Date('2026-09-22T10:01:00Z'),
    persona_id: 'P01',
    persona_version: '0.2',
    simulator_model: 'google/gemini-2.0-flash-001',
    session_index: 1,
    gap_before_ms: 0,
    results: {},
    ...overrides,
  };
}

describe('TH-S38 workbook export', () => {
  it('produces a workbook with Summary, Turns, and Sessions sheets', () => {
    const { buffer, summaryRows, turnRows, sessionRows } = buildRunsWorkbook({
      runs: [
        makeRun({
          id: 'run-1',
          results: {
            turns: [
              {
                turnNumber: 1,
                message: 'I have 17 things to do…',
                response: 'That sounds like a lot. Tell me more.',
                latencyMs: 812,
                resultType: 'agent_turn',
                safetyState: 'S1',
                fallbackUsed: false,
                invariantViolations: [],
              },
            ],
          },
        }),
      ],
    });

    expect(buffer.length).toBeGreaterThan(0);
    expect(summaryRows).toBe(1);
    expect(turnRows).toBe(1);
    expect(sessionRows).toBe(0);

    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Summary', 'Turns', 'Sessions']);
  });

  it('the Turns sheet carries userMessage + okuvuResponse (the hand-copying replacement)', () => {
    const { buffer } = buildRunsWorkbook({
      runs: [
        makeRun({
          id: 'run-2',
          results: {
            turns: [
              {
                turnNumber: 3,
                message: 'okay',
                response: 'Continuing where we left off — breathe in for four.',
                fallbackUsed: false,
                invariantViolations: [{ rule: 'signal-ordering' }],
              },
            ],
          },
        }),
      ],
    });

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Turns']);
    expect(rows).toHaveLength(1);
    expect(rows[0]['userMessage']).toBe('okay');
    expect(rows[0]['okuvuResponse']).toMatch(/Continuing where we left off/);
    expect(rows[0]['invariantViolations']).toBe('signal-ordering');
    expect(rows[0]['persona']).toBe('P01');
    expect(rows[0]['sessionIndex']).toBe(1);
  });

  it('marks session-close runs on the Sessions sheet with the C1–C5 rollup', () => {
    const { buffer, sessionRows, turnRows } = buildRunsWorkbook({
      runs: [
        makeRun({
          id: 'run-3',
          session_index: 2,
          gap_before_ms: 259_200_000,
          status: 'pass',
          results: {
            sessionClose: true,
            summaryWritten: true,
            memoryWritten: true,
            continuity: { C1: 'pass', C2: 'pass', C3: 'pass', C4: 'pass', C5: 'pass' },
            turns: [],
          },
        }),
      ],
    });

    expect(sessionRows).toBe(1);
    expect(turnRows).toBe(0);

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Sessions']);
    expect(rows[0]['C1']).toBe('pass');
    expect(rows[0]['gapBeforeMs']).toBe(259_200_000);
  });

  it('counts fallback turns honestly (fallbackUsed OR fallbackSource)', () => {
    const { buffer } = buildRunsWorkbook({
      runs: [
        makeRun({
          id: 'run-4',
          results: {
            turns: [
              { turnNumber: 1, message: 'a', response: 'x', fallbackUsed: true },
              { turnNumber: 2, message: 'b', response: 'y', fallbackUsed: false, fallbackSource: 'a9_pre_blocked' },
              { turnNumber: 3, message: 'c', response: 'z', fallbackUsed: false },
            ],
          },
        }),
      ],
    });

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Summary']);
    expect(rows[0]['fallbackCount']).toBe(2);
  });

  it('bounds the export at MAX_EXPORT_ROWS', () => {
    const manyRuns = Array.from({ length: MAX_EXPORT_ROWS + 50 }, (_, i) => makeRun({ id: `run-${i}` }));
    const { rowCount, truncated } = buildRunsWorkbook({ runs: manyRuns });
    expect(rowCount).toBe(MAX_EXPORT_ROWS);
    expect(truncated).toBe(true);
  });

  describe('extractTurns (defensive shape handling)', () => {
    it('reads the conversation shape { turns: [...] }', () => {
      expect(extractTurns({ turns: [{ message: 'hi' }] })).toEqual([{ message: 'hi' }]);
    });

    it('degrades to empty on an unknown shape', () => {
      expect(extractTurns({ samples: [] })).toEqual([]);
      expect(extractTurns(null)).toEqual([]);
    });
  });
});
