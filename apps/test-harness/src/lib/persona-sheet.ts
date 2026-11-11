/**
 * TH-S38 — persona sheet parsing for the /campaign upload step.
 *
 * A persona sheet is the operator-facing spreadsheet that populates the
 * persona bank: one row per client, with the character sheet the
 * user-simulator reads (`PersonaMetaForSimulation`) plus the rubric the judge
 * grades against. Column contract lives in
 * `docs/skills`-adjacent reference (`references/persona-sheet.md` of the
 * simulated-user-eval skill) and is mirrored in `CAMPAIGN_COLUMNS` below so
 * the UI and the parser can never disagree about what a sheet may contain.
 *
 * Design notes:
 *   - Parsing is PURE and shared by the client preview and the server import,
 *     so a green preview row and an imported row are the same row. The server
 *     re-validates regardless — a client preview is an aid, never a gate.
 *   - `errors` reject a row; `warnings` import it while saying what it cannot
 *     measure. The important warning is the rubricless one: a persona with no
 *     `expectedBehavior` is UNGRADED forever, never a pass.
 *   - CSV text is tokenized by `corpus-csv.ts` (not by xlsx's own CSV reader,
 *     which mangles mixed UTF-8 + quoted cells). xlsx workbooks are read with
 *     `header: 1` so a leading blank row cannot swallow the header.
 */

import { parseCsvText } from './corpus-csv';

export type PersonaTrajectory = 'stable' | 'escalating' | 'de-escalating';

export const PERSONA_TRAJECTORIES: PersonaTrajectory[] = ['stable', 'escalating', 'de-escalating'];

export type PersonaContinuityCues = { stable: string[]; temporary: string[] } | string[];

/**
 * The character-sheet fields the simulator reads. A sheet row and an
 * already-validated import row both satisfy it, so `personaMetaFromRow` never
 * needs a fake `ParsedPersonaRow`.
 */
export interface PersonaMetaSource {
  personaId: string;
  personaVersion: string;
  demographics: string | null;
  profile: string | null;
  trajectory: PersonaTrajectory | null;
  goals: string[];
  secrets: string[];
  openerStyle: string | null;
  sampleStarters: string[];
  continuityCues: PersonaContinuityCues | null;
  determinismRules: string[];
}

export interface ParsedPersonaRow extends PersonaMetaSource {
  /** 1-based position among data rows (header excluded), for error messages. */
  rowNumber: number;
  /** `CorpusCase.expected_output` — rubric shorthand, not a reply to match. */
  expectedBehavior: string | null;
  tags: string[];
  /** Non-empty ⇒ the row must not be imported. */
  errors: string[];
  /** Non-empty ⇒ imported, but something about it cannot be graded/measured. */
  warnings: string[];
}

export interface PersonaSheetParseResult {
  rows: ParsedPersonaRow[];
  /** Header-level problems (unknown columns, missing required column). */
  headerWarnings: string[];
}

/**
 * Accepted header spellings, normalized (lowercased, separators stripped).
 * The left column is what an operator is told to write; the rest are what a
 * real spreadsheet tends to contain instead.
 */
const PERSONA_HEADERS: Record<string, string[]> = {
  // A clinician writing a persona sheet does not use the field names below.
  // "name", "age", "situation" and "how they talk" are the spellings that
  // actually arrive on a sheet written by hand, so they are aliases rather
  // than a second parser: one row shape, two vocabularies.
  personaId: ['personaid', 'name', 'clientname', 'personaname', 'client'],
  personaVersion: ['personaversion', 'version'],
  expectedBehavior: ['expectedbehavior', 'expected', 'rubric', 'expectedbehaviors'],
  demographics: ['demographics', 'demographic', 'who', 'agegender'],
  age: ['age', 'years', 'howold'],
  profile: [
    'profile',
    'presentingproblem',
    'presentingconcern',
    'context',
    'story',
    'situation',
    'about',
    'whatshappening',
    'concern',
  ],
  trajectory: ['trajectory', 'arc', 'emotionaltrajectory'],
  goals: ['goals', 'goal', 'wants', 'lookingfor'],
  secrets: ['secrets', 'secret'],
  openerStyle: ['openerstyle', 'opener', 'openingstyle', 'howtheytalk', 'talkingstyle', 'voice', 'style'],
  sampleStarters: ['samplestarters', 'starters', 'samplestarter', 'openinglines'],
  continuityCues: ['continuitycues', 'cues', 'continuity'],
  determinismRules: ['determinismrules', 'stylerules', 'behaviours', 'behaviors'],
  tags: ['tags', 'tag', 'family', 'families'],
};

/** Column contract shown in the UI, in upload order. ★ = required. */
export const CAMPAIGN_COLUMNS: { column: string; required: boolean; note: string }[] = [
  { column: 'personaId', required: true, note: 'stable slug, e.g. grief-job-loss-01' },
  { column: 'personaVersion', required: true, note: 'bump on any behavioural edit; runs pin it' },
  { column: 'expectedBehavior', required: true, note: 'rubric shorthand → the judge grades against this' },
  { column: 'demographics', required: false, note: 'age, gender, city, occupation (a bare "age" column is accepted too)' },
  { column: 'profile', required: false, note: 'presenting problem and life context, 2–4 sentences' },
  { column: 'trajectory', required: false, note: 'stable | escalating | de-escalating' },
  { column: 'goals', required: false, note: 'what the client wants out of the session(s); semicolons' },
  { column: 'secrets', required: false, note: 'withheld until the agent earns them; semicolons' },
  { column: 'openerStyle', required: false, note: 'how they open, e.g. one-line, apologetic' },
  { column: 'sampleStarters', required: false, note: 'candidate opening lines; semicolons' },
  { column: 'continuityCues', required: false, note: 'stable: …; temporary: … (or a plain list)' },
  { column: 'determinismRules', required: false, note: 'fixed behaviours, e.g. always answers in 5 words' },
  { column: 'tags', required: false, note: 'persona family, e.g. grief; semicolons' },
];

function normalizeKey(header: string): string {
  return header.toLowerCase().trim().replace(/[\s_-]+/g, '');
}

const HEADER_LOOKUP: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [field, spellings] of Object.entries(PERSONA_HEADERS)) {
    for (const spelling of spellings) {
      // Never let an alias steal a canonical name from another field.
      if (!out[spelling]) out[spelling] = field;
    }
  }
  return out;
})();

/** Map a header cell to its field name, or null when it is not a persona column. */
export function normalizePersonaHeader(header: string): string | null {
  return HEADER_LOOKUP[normalizeKey(header)] ?? null;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/** Split a cell into a list. Semicolons and newlines both separate items. */
export function splitList(value: string): string[] {
  return value
    .split(/;|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Turn a human-written name into a stable persona id: "Ananya Sharma" →
 * "ananya-sharma". Only applied when the cell contains whitespace or upper
 * case, so an already-slugged id from the older sheets ("grief-job-loss-01")
 * is passed through untouched.
 */
export function slugifyPersonaId(value: string): string {
  const text = value.trim();
  if (text === '') return '';
  if (!/[\sA-Z]/.test(text)) return text;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * `continuityCues` accepts either a plain list ("work at the call centre")
 * or a stable/temporary split ("stable: night shifts | temporary: exam week").
 * The split form is what C4 (no trait drift) needs — without it C4 reports
 * `not_applicable`, which is a silent no-test rather than a pass.
 */
export function parseContinuityCues(value: string): PersonaContinuityCues | null {
  const text = value.trim();
  if (text === '') return null;

  const hasMarkers = /(^|[\s|,])(stable|temporary)\s*[:=]/i.test(text);
  if (!hasMarkers) {
    const list = splitList(text);
    return list.length > 0 ? list : null;
  }

  const stable: string[] = [];
  const temporary: string[] = [];
  // "stable: a; b | temporary: c; d" → segments keyed by their prefix.
  const segments = text.split(/\s*\|\s*(?=(?:stable|temporary)\s*[:=])/i);
  for (const segment of segments) {
    const match = /^\s*(stable|temporary)\s*[:=]\s*([\s\S]*)$/i.exec(segment);
    if (!match) {
      // A markerless fragment continues whichever bucket came last; if none
      // did, treat the whole thing as a plain list rather than losing text.
      if (stable.length === 0 && temporary.length === 0) return splitList(text);
      continue;
    }
    const bucket = match[1].toLowerCase() === 'stable' ? stable : temporary;
    bucket.push(...splitList(match[2]));
  }
  return { stable, temporary };
}

/**
 * Parse positional sheet rows (from CSV tokenizing or
 * `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })`) into persona
 * rows. Leading blank rows are skipped so the header is always the first
 * non-blank row; blank data rows are skipped.
 */
export function parsePersonaSheet(sheetRows: unknown[][]): PersonaSheetParseResult {
  const headerWarnings: string[] = [];

  let start = 0;
  while (start < sheetRows.length && sheetRows[start].every(isBlank)) start++;
  if (start >= sheetRows.length) {
    return { rows: [], headerWarnings: ['The file has no header row — nothing to import.'] };
  }

  const headerCells = sheetRows[start] ?? [];
  const columnField: (string | null)[] = headerCells.map((cell) => normalizePersonaHeader(String(cell ?? '')));

  const unknownColumns = headerCells
    .map((cell, index) => ({ cell: String(cell ?? '').trim(), index }))
    .filter(({ cell, index }) => cell !== '' && columnField[index] === null)
    .map(({ cell }) => cell);
  if (unknownColumns.length > 0) {
    headerWarnings.push(`Ignored unrecognised column(s): ${unknownColumns.join(', ')}.`);
  }

  const fieldsPresent = new Set(columnField.filter((f): f is string => f !== null));
  for (const column of CAMPAIGN_COLUMNS) {
    if (column.required && !fieldsPresent.has(column.column)) {
      headerWarnings.push(
        column.column === 'expectedBehavior'
          ? 'No expectedBehavior column — every persona imported from this sheet will be UNGRADED.'
          : `Required column "${column.column}" is missing.`,
      );
    }
  }

  const rows: ParsedPersonaRow[] = [];
  const seenPersonaIds = new Map<string, number>();

  for (let i = start + 1; i < sheetRows.length; i++) {
    const cells = sheetRows[i];
    if (!cells || cells.every(isBlank)) continue;

    const cell: Record<string, string> = {};
    for (let c = 0; c < cells.length; c++) {
      const field = columnField[c];
      if (!field) continue;
      cell[field] = String(cells[c] ?? '').trim();
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const personaId = slugifyPersonaId(cell.personaId ?? '');
    if (personaId === '') {
      errors.push('personaId is required (or a name column to derive one from)');
    } else if (seenPersonaIds.has(personaId)) {
      errors.push(`duplicate personaId "${personaId}" (already used on row ${seenPersonaIds.get(personaId)})`);
    } else {
      seenPersonaIds.set(personaId, rows.length + 1);
    }

    // A bare "age" column is folded into demographics so the header reads
    // "34" rather than dropping the one number the reviewer always looks for.
    const demographicsCell = cell.demographics?.trim() ? cell.demographics.trim() : null;
    const ageCell = cell.age?.trim() ? cell.age.trim() : null;
    const demographics = [ageCell ? `age ${ageCell}` : null, demographicsCell].filter(Boolean).join(' · ') || null;

    let personaVersion = cell.personaVersion ?? '';
    if (personaVersion === '') {
      personaVersion = '1';
      warnings.push('no personaVersion — defaulted to 1');
    }

    const expectedBehavior = cell.expectedBehavior?.trim() ? cell.expectedBehavior.trim() : null;
    if (!expectedBehavior) {
      warnings.push('no expectedBehavior — this persona will be UNGRADED, never a pass');
    }

    const profile = cell.profile?.trim() ? cell.profile.trim() : null;
    if (!profile) {
      warnings.push('no profile — the simulated client will have a thin character sheet');
    }

    let trajectory: PersonaTrajectory | null = null;
    const rawTrajectory = (cell.trajectory ?? '').trim().toLowerCase();
    if (rawTrajectory !== '') {
      if ((PERSONA_TRAJECTORIES as string[]).includes(rawTrajectory)) {
        trajectory = rawTrajectory as PersonaTrajectory;
      } else {
        errors.push(`invalid trajectory "${cell.trajectory}" (must be one of: ${PERSONA_TRAJECTORIES.join(', ')})`);
      }
    }

    const tags = splitList(cell.tags ?? '');
    const goals = splitList(cell.goals ?? '');
    const secrets = splitList(cell.secrets ?? '');
    const sampleStarters = splitList(cell.sampleStarters ?? '');
    const determinismRules = splitList(cell.determinismRules ?? '');
    const continuityCues = parseContinuityCues(cell.continuityCues ?? '');

    if (goals.length === 0) {
      warnings.push('no goals — the simulator has no direction to push the conversation');
    }

    rows.push({
      rowNumber: rows.length + 1,
      personaId,
      personaVersion,
      expectedBehavior,
      demographics,
      profile,
      trajectory,
      goals,
      secrets,
      openerStyle: cell.openerStyle?.trim() ? cell.openerStyle.trim() : null,
      sampleStarters,
      continuityCues,
      determinismRules,
      tags,
      errors,
      warnings,
    });
  }

  return { rows, headerWarnings };
}

/** Convenience for the CSV path: tokenize then parse. */
export function parsePersonaCsv(text: string): PersonaSheetParseResult {
  return parsePersonaSheet(parseCsvText(text));
}

/** The `persona_meta` block the user-simulator reads (PersonaMetaForSimulation). */
export function personaMetaFromRow(row: PersonaMetaSource): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    personaId: row.personaId,
    personaVersion: row.personaVersion,
    goals: row.goals,
    secrets: row.secrets,
    sampleStarters: row.sampleStarters,
    determinismRules: row.determinismRules,
  };
  if (row.demographics) meta.demographics = row.demographics;
  if (row.profile) meta.profile = row.profile;
  if (row.trajectory) meta.trajectory = row.trajectory;
  if (row.openerStyle) meta.openerStyle = row.openerStyle;
  if (row.continuityCues) meta.continuityCues = row.continuityCues;
  return meta;
}

/** The seed script stored on `CorpusCase.turns` — the simulator's opening lines. */
export function seedTurnsFromRow(row: Pick<PersonaMetaSource, 'sampleStarters'>): { role: 'user'; text: string }[] {
  return row.sampleStarters.map((text) => ({ role: 'user' as const, text }));
}

/**
 * Rows that must never be imported. Kept as a pure predicate so the client
 * preview and the server import reject exactly the same set.
 */
export function isImportable(row: ParsedPersonaRow): boolean {
  return row.errors.length === 0;
}
