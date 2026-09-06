export interface ParsedRow {
  type: string;
  input: string;
  expected_output?: string;
  tags: string[];
  data_origin?: string;
}

// Accepts loosely-cased/spaced headers ("Expected Output", "data origin",
// "Tags") since the person filling in a spreadsheet is unlikely to match an
// exact machine-readable header name.
const HEADER_ALIASES: Record<string, keyof ParsedRow> = {
  type: 'type',
  input: 'input',
  expectedoutput: 'expected_output',
  expected_output: 'expected_output',
  tags: 'tags',
  dataorigin: 'data_origin',
  data_origin: 'data_origin',
};

export function normalizeHeader(header: string): keyof ParsedRow | null {
  const key = header.toLowerCase().trim().replace(/[\s_]+/g, '');
  return HEADER_ALIASES[key] ?? null;
}

// The corpus schema accepts a fixed set of case types
// (safety | fidelity | adversarial | persona). Real-world scenario sheets
// often use descriptive labels instead (e.g. "De-escalation", "Advice-pressure"),
// so we map recognized labels to their closest canonical type. Unmapped values
// are left untouched and are rejected downstream by the server validator.
const TYPE_LABEL_MAP: Record<string, ParsedRow['type']> = {
  'de-escalation': 'safety',
  'escalation to crisis': 'safety',
  'crisis escalation': 'safety',
  'advice-pressure': 'fidelity',
  'advice pressure': 'fidelity',
  'withdrawal / low mood': 'fidelity',
  'withdrawal': 'fidelity',
  'low mood': 'fidelity',
  'overload / burnout': 'fidelity',
  'overload': 'fidelity',
  'burnout': 'fidelity',
  'injection mid-conversation': 'adversarial',
  'injection': 'adversarial',
  'prompt injection': 'adversarial',
  'ambiguous / masked ideation': 'safety',
  'masked ideation': 'safety',
  'ambiguous ideation': 'safety',
};

export function mapTypeLabel(label: string): string {
  const key = label.trim().toLowerCase();
  return TYPE_LABEL_MAP[key] ?? label;
}

function isBlankValue(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

// Parse CSV text into positional rows (arrays of cell values), per RFC 4180.
//
// We parse CSV ourselves rather than routing it through the `xlsx` library:
// xlsx's CSV tokenizer mishandles files that mix UTF-8 content with
// RFC-4180 double-quote escaping (a real-world Excel export pattern), which
// caused every column to be read as a blank/garbled single cell. A dedicated
// tokenizer handles quoted commas, doubled quotes, and CRLF/LF row endings
// correctly.
export function parseCsvText(text: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Parse positional rows (from `XLSX.utils.sheet_to_json(sheet, { header: 1 })`)
// into ParsedRow objects.
//
// Unlike sheet_to_json's default object mode — which assumes the *first*
// worksheet row is the header and therefore names every column "__EMPTY_N"
// when a leading blank row exists (causing all data rows to parse as empty) —
// this trims leading blank rows so the header is always row 0, maps each
// column to a field via normalizeHeader, then parses every non-blank row that
// follows. Blank rows interspersed through the data are skipped.
export function parseRows(sheetRows: unknown[][]): ParsedRow[] {
  let start = 0;
  while (start < sheetRows.length && sheetRows[start].every(isBlankValue)) start++;

  const headerCells = sheetRows[start] ?? [];
  const columnField: (keyof ParsedRow | null)[] = headerCells.map((h) => normalizeHeader(String(h ?? '')));

  const result: ParsedRow[] = [];
  for (let i = start + 1; i < sheetRows.length; i++) {
    const cells = sheetRows[i];
    if (cells.every(isBlankValue)) continue;

    const row: Partial<ParsedRow> = {};
    for (let c = 0; c < cells.length; c++) {
      const field = columnField[c];
      if (!field) continue;
      const text = String(cells[c] ?? '').trim();
      if (field === 'tags') {
        row.tags = text.length > 0 ? text.split(';').map((t) => t.trim()).filter(Boolean) : [];
      } else if (field === 'expected_output' || field === 'data_origin') {
        row[field] = text.length > 0 ? text : undefined;
      } else if (field === 'type') {
        row.type = text.length > 0 ? mapTypeLabel(text) : '';
      } else {
        row[field] = text;
      }
    }
    result.push({ type: row.type ?? '', input: row.input ?? '', expected_output: row.expected_output, tags: row.tags ?? [], data_origin: row.data_origin });
  }
  return result;
}
