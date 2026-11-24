/**
 * The draft copy review document, generated from the catalogue.
 *
 * The owner reads this to approve wording. It is generated rather than written
 * by hand so the document can never describe a worksheet differently from the
 * app: change the body, regenerate, or the test fails.
 *
 * Run (writes the file): WRITE_DRAFT_DOC=1 npx vitest run __tests__/draft-doc.test.ts
 */
import {
  draftEntries,
  APPROVED_24_NOV_IDS,
  APPROVED_24_NOV_REVISED_IDS,
} from '@okuvu/shared-types/worksheets/emit-sql';
import { CATALOGUE } from '@okuvu/shared-types/worksheets/index';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';
import type { WorksheetContent, WorksheetField } from '@okuvu/shared-types/worksheet';

export const DRAFT_DOC_PATH = 'docs/exercise-library/23-draft-stress-burnout-copy.md';

/** The owner-approved copy, in its own document, so the approval has a record. */
export const APPROVED_DOC_PATH = 'docs/exercise-library/25-approved-stress-burnout-copy.md';

const TITLE: Record<string, string> = {
  ws_whats_on_my_plate: "1. What's on my plate",
  ws_basics_check: '2. Basics check',
  ws_rest_break: '3. Rest break',
  ws_boundary_planner: '4. Boundary planner',
  ws_priority_sorter: '5. Priority sorter',
  ws_scrolling_log: '6. Doomscroll log',
  ws_weekly_load_check: '7. Weekly load check',
  ws_unsent_letter: '8. Unsent letter',
  ws_pros_cons_change: '9. Weighing it up',
  ws_caring_load_check: '10. Caring load check',
};

const BRIEF: Record<string, string> = {
  ws_whats_on_my_plate: 'A list the client adds tasks to. For each task: Must do / Can wait / Can drop or hand off. Closing reflection.',
  ws_basics_check: 'Checklist of six basics, a 0–10 "how empty does my tank feel" slider, one basic to look after today. No food amounts.',
  ws_rest_break: 'Choose 2, 5 or 10 minutes, then the countdown timer with a permission-to-rest line. Optional closing reflection.',
  ws_boundary_planner: 'Short answers: the situation, who it involves, what I want to say no to. Long answer: what I will say. 0–10 how hard this feels. Closing reflection.',
  ws_priority_sorter: 'A list of tasks. Each one gets Urgent and important / Important, not urgent / Urgent, not important / Neither. Then pick the one to do first.',
  ws_scrolling_log: 'Date and time, how long (under 15 min / 15–60 min / over an hour), feelings before and after, what pulled me in.',
  ws_weekly_load_check: '0–10 for this week\'s load, a list of the biggest demands, a closing reflection. Past weeks read as a list in Past me: no graph, no score.',
  ws_unsent_letter: 'Who it is to, then the letter (typed or spoken). At the end: Keep it privately / Delete it.',
  ws_pros_cons_change: 'Four boxes: good things about changing, good things about staying the same, costs of changing, costs of staying the same. 0–10 how ready I feel. Closing reflection.',
  ws_caring_load_check: 'Checklist of caring tasks, 0–10 how stretched I feel, one bit of help I could ask for.',
};

function fieldLines(field: WorksheetField): string[] {
  const lines: string[] = [];
  lines.push(`- **${field.type.replace(/_/g, ' ')}** — ${field.prompt}`);
  if (field.required) lines.push('  - required');
  if (field.helper) lines.push(`  - helper: ${field.helper}`);
  if (field.example) lines.push(`  - example: ${field.example}`);
  if ('options' in field) {
    for (const option of field.options) {
      lines.push(`  - option: ${option.label}`);
      if (option.description) lines.push(`    - helper: ${option.description}`);
    }
  }
  if ('feelings' in field) {
    lines.push(`  - feelings offered: ${field.feelings.map((f) => f.label).join(', ')}`);
  }
  if ('columns' in field) {
    for (const column of field.columns) {
      lines.push(`  - column \`${column.id}\` (${column.type}): ${column.label}`);
      for (const option of column.options ?? []) {
        lines.push(`    - ${option.label}`);
      }
    }
  }
  if (field.type === 'countdown_timer') {
    lines.push(`  - runs for ${field.seconds} seconds; start button: ${field.startLabel ?? '—'}`);
  }
  if (field.visibleWhen) {
    lines.push(`  - shown when \`${field.visibleWhen.field}\` is ${field.visibleWhen.in.join(' / ')}`);
  }
  return lines;
}

function bodyLines(content: WorksheetContent): string[] {
  const lines: string[] = [];
  if (content.intro) lines.push(`> ${content.intro}`, '');
  for (const field of content.fields) lines.push(...fieldLines(field));
  if (content.closing?.text) lines.push('', `> ${content.closing.text}`);
  if (content.closing?.discardWhen) {
    lines.push(
      '',
      `**Delete rule:** if \`${content.closing.discardWhen.field}\` is answered ` +
        `${content.closing.discardWhen.in.map((v) => `\`${v}\``).join(' or ')}, the saved ` +
        'entry is deleted straight away, using the same delete as Past me.',
    );
  }
  return lines;
}

function header(entry: CatalogueEntry): string[] {
  return [
    `- id: \`${entry.tool_id}\``,
    `- Library description: ${entry.summary}`,
    `- opens: ${entry.access_mode === 'open' ? 'S — the client can open it themselves' : 'A — therapist-assigned'}`,
    `- load: ${entry.load_level} · about ${entry.est_minutes} minutes`,
    `- care plan label: ${entry.care_plans.join(', ')}`,
    `- deeper safety screen: ${entry.sensitive_check ? 'yes' : 'no (the shared check on every answer still runs)'}`,
  ];
}

/**
 * The approved copy of the 24 Nov 2026 batch: the eight approved as written,
 * then the two revised and approved later the same day.
 *
 * Generated for the same reason the draft document is: so the record of what
 * was approved cannot describe a worksheet differently from the app.
 */
export function buildApprovedDoc(): string {
  const ids = [...APPROVED_24_NOV_IDS, ...APPROVED_24_NOV_REVISED_IDS];
  const out: string[] = [];

  out.push(
    '# Stress & Burnout worksheets — approved wording',
    '',
    'Generated from the catalogue in `packages/shared-types/worksheets`. Do not edit by',
    'hand: change the catalogue, then regenerate.',
    '',
    '**Status: approved.** The owner approved these ten in two rounds on 24 November 2026:',
    'eight as written, and Unsent letter and Weighing it up after the revisions he asked',
    'for. This document is the record of that approval; `02-approved-worksheet-copy.md`',
    'remains the record for worksheets 1-16 (9 November 2026).',
    '',
    'All ten go through the same safety check the journal uses on every written and spoken',
    'answer. The Doomscroll log and the Unsent letter also carry the deeper screen (eating',
    'and body, sleep, self-harm, harm to someone else). None asks for weight, body',
    'measurements, calories, food amounts or medicines, and none adds answers into a total,',
    'a level or a label.',
    '',
    '---',
    '',
  );

  for (const id of ids) {
    const entry = CATALOGUE.find((row) => row.tool_id === id);
    if (!entry) throw new Error(`approved doc row "${id}" is not in the catalogue`);
    out.push(`## ${TITLE[id] ?? entry.label}`, '');
    out.push(`**The brief:** ${BRIEF[id] ?? ''}`, '');
    out.push(...header(entry));
    out.push('');
    if (entry.content_en) out.push(...bodyLines(entry.content_en));
    out.push('', '---', '');
  }

  return out.join('\n');
}

export function buildDraftDoc(): string {
  const out: string[] = [];
  const drafts = draftEntries();
  const waiting = drafts.length > 0;

  out.push(
    '# Stress & Burnout worksheets — draft wording for review, NOT approved',
    '',
    'Generated from the catalogue in `packages/shared-types/worksheets`. Do not edit by',
    'hand: change the catalogue, then regenerate.',
    '',
    waiting
      ? '**Status: drafts.** These are the worksheets the owner sent back for a wording'
      : '**Status: none waiting.** Every written worksheet in the 24 Nov 2026 batch has been',
    waiting
      ? 'change on 24 November 2026, plus any later draft. They are switched off for clients:'
      : 'approved. Nothing here is awaiting a read, and this document carries no worksheet',
    waiting
      ? 'no card in their Library, no direct open, no assignment from the portal. A therapist'
      : 'bodies. A new worksheet added from now on starts `draft`, appears here, and stays',
    waiting
      ? 'can preview them. Nothing is switched on until you say the wording is approved.'
      : 'switched off for clients until you say the wording is approved.',
    '',
    'The ten of the 24 Nov batch are approved; their copy is in',
    '`25-approved-stress-burnout-copy.md`.',
    '',
    'Every worksheet goes through the same safety check the journal uses on every written and',
    'spoken answer, with the same response. The Unsent letter and the Doomscroll log also',
    'carry the deeper screen (eating and body, sleep, self-harm, harm to someone else). None',
    'asks for weight, body measurements, calories, food amounts or medicines, and none adds',
    'answers into a total, a level or a label.',
    '',
    '---',
    '',
  );

  if (!waiting) {
    out.push(
      'No worksheet is waiting for approval.',
      '',
      'Two worksheets in the 24 Nov batch were sent back for a wording change and then',
      'approved the same day, after the revisions:',
      '',
      '- Unsent letter — the letter helper and a line under "Delete it" saying a safety',
      '  check-in may still be recorded with the therapist.',
      '- Weighing it up — a first question ("What change are you thinking about?"), the four',
      '  boxes rewritten around "this change", and the readiness helper reworded.',
      '',
      'Both are in `25-approved-stress-burnout-copy.md` with their approved text.',
      '',
    );
  }

  for (const entry of drafts) {
    out.push(`## ${TITLE[entry.tool_id] ?? entry.label}`, '');
    out.push(`**The brief:** ${BRIEF[entry.tool_id] ?? ''}`, '');
    out.push(...header(entry));
    out.push('');
    if (entry.content_en) out.push(...bodyLines(entry.content_en));
    out.push('', '---', '');
  }

  out.push(
    '## To approve',
    '',
    'Reply with the worksheet names whose wording is approved, and any line you want',
    'changed. Approval flips that row to `approved` in a new migration — the wording itself',
    'is edited in `packages/shared-types/worksheets/stress-and-burnout.ts`, never in a screen.',
    '',
  );

  return out.join('\n');
}
