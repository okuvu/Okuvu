import { describe, expect, it } from 'vitest';
import {
  InvalidWorksheetError,
  assertClientServable,
  parseWorksheetRow,
  toClientWorksheetView,
  worksheetRowProblems,
  type WorksheetRegistryRow,
} from '../lib/worksheet-content.js';

function body(): Record<string, unknown> {
  return {
    version: 1,
    fields: [
      { id: 'facts', type: 'short_text', prompt: 'What happened?', required: true },
      {
        id: 'can_act',
        type: 'choice',
        prompt: 'Anything you can do?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'Not right now' },
        ],
      },
      { id: 'step', type: 'short_text', prompt: 'One small step?', visibleWhen: { field: 'can_act', in: ['yes'] } },
    ],
  };
}

function row(overrides: Partial<WorksheetRegistryRow> = {}): WorksheetRegistryRow {
  return {
    tool_id: 'ws_test',
    kind: 'worksheet',
    status: 'approved',
    label: 'Test worksheet',
    summary: 'A line for the Library.',
    section: 'untangle_thoughts',
    therapy_modality: 'CBT',
    access_mode: 'assigned',
    load_level: 'demanding',
    est_minutes: 10,
    content_en: body(),
    content_hi: null,
    ...overrides,
  };
}

describe('worksheetRowProblems', () => {
  it('accepts a complete approved worksheet', () => {
    expect(worksheetRowProblems(row())).toEqual([]);
  });

  it('requires the client-facing summary, because the therapist note is not client-safe copy', () => {
    expect(worksheetRowProblems(row({ summary: null })).join(' ')).toMatch(/Library description is required/);
  });

  it('rejects a section outside the approved list', () => {
    expect(worksheetRowProblems(row({ section: 'misc' })).join(' ')).toMatch(/section: must be one of/);
  });

  it('rejects an access mode outside the three approved ones', () => {
    expect(worksheetRowProblems(row({ access_mode: 'public' })).join(' ')).toMatch(/access_mode/);
  });

  it('rejects a load level or a nonsense duration', () => {
    expect(worksheetRowProblems(row({ load_level: 'medium' })).join(' ')).toMatch(/load_level/);
    expect(worksheetRowProblems(row({ est_minutes: 0 })).join(' ')).toMatch(/est_minutes/);
    expect(worksheetRowProblems(row({ est_minutes: 600 })).join(' ')).toMatch(/est_minutes/);
  });

  it('rejects an exercise row passed as a worksheet', () => {
    expect(worksheetRowProblems(row({ kind: 'exercise', content_en: null })).join(' ')).toMatch(/kind: expected/);
  });

  it('reports body errors with a content_en prefix', () => {
    const broken = body();
    delete (broken.fields as Array<Record<string, unknown>>)[0].prompt;
    const problems = worksheetRowProblems(row({ content_en: broken }));
    expect(problems.join(' ')).toMatch(/content_en\.fields\[0\]\.prompt: required/);
  });

  it('rejects a Hinglish body that is a different worksheet', () => {
    const hi = body();
    (hi.fields as Array<Record<string, unknown>>)[1].options = [
      { value: 'haan', label: 'हाँ' },
      { value: 'nahi', label: 'नहीं' },
    ];
    (hi.fields as Array<Record<string, unknown>>)[2].visibleWhen = { field: 'can_act', in: ['haan'] };
    const problems = worksheetRowProblems(row({ content_hi: hi }));
    expect(problems.join(' ')).toMatch(/content_hi\.fields\[1\]: option values differ/);
  });
});

describe('parseWorksheetRow', () => {
  it('returns both bodies when they are valid', () => {
    const parsed = parseWorksheetRow(row({ content_hi: body() }));
    expect(parsed.english.fields).toHaveLength(3);
    expect(parsed.hinglish?.fields).toHaveLength(3);
  });

  it('throws InvalidWorksheetError carrying the tool id and every problem', () => {
    try {
      parseWorksheetRow(row({ section: null, summary: null }));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidWorksheetError);
      const invalid = error as InvalidWorksheetError;
      expect(invalid.toolId).toBe('ws_test');
      expect(invalid.problems.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('assertClientServable', () => {
  it('refuses a draft', () => {
    expect(() => assertClientServable(row({ status: 'draft' }))).toThrow(/not approved/);
  });

  it('refuses a retired worksheet', () => {
    expect(() => assertClientServable(row({ status: 'retired' }))).toThrow(/not approved/);
  });

  it('allows a preview of a draft through parseWorksheetRow, which is why the two exist', () => {
    expect(parseWorksheetRow(row({ status: 'draft' })).english.fields).toHaveLength(3);
  });
});

describe('toClientWorksheetView', () => {
  it('never carries the therapy modality or the internal status', () => {
    const view = toClientWorksheetView(row());
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/CBT/);
    expect(serialized).not.toMatch(/therapy/i);
    expect(serialized).not.toMatch(/approved/);
    expect(serialized).not.toMatch(/draft/);
  });

  it('serves the Hinglish body when asked, and English when there is none', () => {
    const withoutHi = toClientWorksheetView(row(), 'hi');
    expect(withoutHi.content.fields[0].prompt).toBe('What happened?');

    const hi = body();
    const hiFields = hi.fields as Array<Record<string, unknown>>;
    hiFields[0].prompt = 'क्या हुआ?';
    hiFields[1].prompt = 'कुछ कर सकते हो?';
    hiFields[2].prompt = 'एक छोटा कदम?';
    const view = toClientWorksheetView(row({ content_hi: hi }), 'hi');
    expect(view.content.fields[0].prompt).toBe('क्या हुआ?');
  });
});
