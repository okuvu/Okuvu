import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildXlsxBuffer, cell, todayStamp } from '../lib/xlsx-export';
import {
  buildCampaignWorkbook,
  techniqueFromSignals,
  type CampaignExportGroup,
  type CampaignExportMeta,
} from '../lib/campaign-workbook';
import type { GroupVerdict } from '../lib/campaign-verdict';
import type { PerTurnTrace } from '../lib/trace-export';

const meta: CampaignExportMeta = {
  id: 'camp-1',
  label: 'Clinical run 16 Nov',
  environment: 'staging',
  target: 'in-process',
  status: 'complete',
  sessions: 2,
  turnsMin: 15,
  turnsMax: 20,
  gapPlanMs: [0, 259_200_000],
  seed: 42,
  judgeEnabled: true,
  costCeilingUsd: 25,
  costEstimateUsd: 0.53,
  plannedTurns: 36,
  createdAt: '2026-11-16T09:00:00.000Z',
};

function makeTrace(overrides: Partial<PerTurnTrace> = {}): PerTurnTrace {
  return {
    turnNumber: 1,
    message: 'I keep putting off the call.',
    response: 'That sounds exhausting. What makes the call feel heavy?',
    latencyMs: 1234.5,
    resultType: 'agent_turn',
    safetyState: 'S1',
    fallbackUsed: false,
    invariantViolations: [],
    signals: [],
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<GroupVerdict> = {}): GroupVerdict {
  return {
    verdict: 'PASS',
    code: 'pass',
    reason: 'All deterministic checks and every session judge passed.',
    findings: [],
    checks: {
      erroredTurns: 0,
      fallbackTurns: 0,
      invariantViolations: 0,
      continuityFailures: [],
      judgedSessions: 2,
      failedJudgeSessions: 0,
      ungradedSessions: 0,
    },
    ...overrides,
  };
}

function makeGroup(overrides: Partial<CampaignExportGroup> = {}): CampaignExportGroup {
  return {
    groupId: 'group-1',
    personaId: 'P01',
    personaVersion: '2',
    groupStatus: 'complete',
    turnsCompleted: 2,
    sessionsCompleted: 2,
    costSoFarUsd: 0.26,
    incompleteReason: null,
    verdict: makeVerdict(),
    sessions: [
      { index: 1, continuity: { C1: 'pass', C2: 'pass', C3: 'pass', C4: 'pass', C5: 'pass' } },
      { index: 2, continuity: { C1: 'pass', C2: 'fail', C3: 'pass', C4: 'pass', C5: 'pass' } },
    ],
    turns: [
      { sessionIndex: 1, trace: makeTrace() },
      {
        sessionIndex: 2,
        trace: makeTrace({
          turnNumber: 1,
          message: 'Back again. The call went badly.',
          response: 'You went through with it. How did it land?',
          safetyState: 'S2',
          signals: [
            { boundary: 'A2', agent: 'A2', payload: { technique_used: 'box_breathing', tool_launched: 'box_breathing' }, timestamp: 't' },
          ],
        }),
      },
    ],
    judgeVerdicts: [
      { sessionIndex: 1, judged: true, passed: true, rationale: 'Validated before exploring.' },
      { sessionIndex: 2, judged: true, passed: false, rationale: 'Moved to an exercise without permission.' },
    ],
    ...overrides,
  };
}

describe('xlsx-export', () => {
  it('builds a workbook with one sheet per spec and round-trips the rows', () => {
    const buffer = buildXlsxBuffer([
      { name: 'Summary', rows: [{ persona: 'P01', verdict: 'PASS' }] },
      { name: 'Turns', rows: [{ turnNumber: 1, client: 'hello' }] },
    ]);

    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Summary', 'Turns']);

    const rows = XLSX.utils.sheet_to_json<{ persona: string; verdict: string }>(wb.Sheets.Summary);
    expect(rows).toEqual([{ persona: 'P01', verdict: 'PASS' }]);
  });

  it('writes a placeholder row rather than refusing an empty sheet', () => {
    const buffer = buildXlsxBuffer([{ name: 'Findings', rows: [] }]);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<{ note: string }>(wb.Sheets.Findings);
    expect(rows).toEqual([{ note: 'no rows' }]);
  });

  it('rejects a workbook with no sheets', () => {
    expect(() => buildXlsxBuffer([])).toThrow(/at least one sheet/);
  });

  it('flattens non-primitive cells to JSON text instead of dropping them', () => {
    expect(cell({ a: 1 })).toBe('{"a":1}');
    expect(cell(null)).toBe('');
    expect(cell(3)).toBe(3);
  });

  it('stamps the file name with an ISO date', () => {
    expect(todayStamp(new Date('2026-11-16T23:00:00Z'))).toBe('2026-11-16');
  });
});

describe('campaign workbook', () => {
  it('emits the six sheets in reading order', () => {
    const { sheets } = buildCampaignWorkbook(meta, [makeGroup()]);
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Run',
      'Summary',
      'Sessions',
      'Turns',
      'Findings',
      'Judge',
    ]);
  });

  it('carries the frozen run parameters so a transcript is attributable', () => {
    const { sheets } = buildCampaignWorkbook(meta, [makeGroup()]);
    const run = sheets.find((sheet) => sheet.name === 'Run');
    const rows = run?.rows as { parameter: string; value: unknown }[];
    const byParameter = Object.fromEntries(rows.map((row) => [row.parameter, row.value]));
    expect(byParameter.Seed).toBe(42);
    expect(byParameter.Environment).toBe('staging');
    expect(byParameter['Sessions per persona']).toBe(2);
    expect(byParameter['Gap plan (ms)']).toBe('0, 259200000');
  });

  it('puts one row per persona on Summary and one per session on Sessions', () => {
    const { sheets } = buildCampaignWorkbook(meta, [makeGroup()]);
    const summary = sheets.find((sheet) => sheet.name === 'Summary');
    const sessions = sheets.find((sheet) => sheet.name === 'Sessions');
    expect(summary?.rows).toHaveLength(1);
    expect(sessions?.rows).toHaveLength(2);
  });

  it('reports which continuity check failed and in which session', () => {
    const { sheets } = buildCampaignWorkbook(meta, [makeGroup()]);
    const sessions = sheets.find((sheet) => sheet.name === 'Sessions');
    const second = (sessions?.rows as Record<string, unknown>[])[1];
    expect(second.sessionIndex).toBe(2);
    expect(second.C2).toBe('fail');
    expect(second.judgeStatus).toBe('fail');
  });

  it('pulls the technique A2 reported into the turn row', () => {
    const { sheets } = buildCampaignWorkbook(meta, [makeGroup()]);
    const turns = sheets.find((sheet) => sheet.name === 'Turns');
    const rows = turns?.rows as Record<string, unknown>[];
    expect(rows[0].technique).toBe('');
    expect(rows[1].technique).toBe('box_breathing');
    expect(rows[1].tool).toBe('box_breathing');
  });

  it('exports findings with their turn number and severity', () => {
    const group = makeGroup({
      verdict: makeVerdict({
        verdict: 'FAIL',
        code: 'quality',
        findings: [
          { rule: 'advice_before_validation', severity: 'warn', turnNumber: 3, detail: 'Gave advice on turn 3.' },
        ],
      }),
    });
    const { sheets, findingRows } = buildCampaignWorkbook(meta, [group]);
    const findings = sheets.find((sheet) => sheet.name === 'Findings');
    expect(findingRows).toBe(1);
    expect((findings?.rows as Record<string, unknown>[])[0]).toMatchObject({
      rule: 'advice_before_validation',
      severity: 'warn',
      turnNumber: 3,
    });
  });

  it('keeps ungraded sessions visible instead of counting them as passes', () => {
    const group = makeGroup({
      judgeVerdicts: [{ sessionIndex: 1, judged: false, passed: null, rationale: 'no rubric' }],
      verdict: makeVerdict({ verdict: 'UNGRADED', code: 'ungraded' }),
    });
    const { sheets } = buildCampaignWorkbook(meta, [group]);
    const judge = sheets.find((sheet) => sheet.name === 'Judge');
    const row = (judge?.rows as Record<string, unknown>[])[0];
    expect(row.judged).toBe(false);
    expect(row.passed).toBe('');
  });

  it('handles a run with no findings and no judge verdicts', () => {
    const group = makeGroup({ judgeVerdicts: [] });
    const { sheets } = buildCampaignWorkbook(meta, [group]);
    expect(sheets.find((sheet) => sheet.name === 'Findings')?.rows).toHaveLength(0);
    expect(sheets.find((sheet) => sheet.name === 'Judge')?.rows).toHaveLength(0);
    // Still a valid workbook: the empty sheets get a placeholder row at write time.
    const buffer = buildXlsxBuffer(sheets);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Findings');
  });

  it('ignores signals that are not A2 or carry no technique', () => {
    expect(techniqueFromSignals([])).toEqual({ technique: '', tool: '' });
    expect(
      techniqueFromSignals([
        { boundary: 'A1', agent: 'A1', payload: { safety_state: 'S1' } },
        null,
        'not-a-signal',
      ]),
    ).toEqual({ technique: '', tool: '' });
  });
});
