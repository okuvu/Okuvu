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
  ANXIETY_DRAFT_BATCH_IDS,
  APPROVED_24_NOV_IDS,
  APPROVED_24_NOV_REVISED_IDS,
  DRAFT_BATCH_IDS,
} from '@okuvu/shared-types/worksheets/emit-sql';
import { LOW_MOOD_BATCH_IDS } from '@okuvu/shared-types/worksheets/low-mood';
import { CATALOGUE } from '@okuvu/shared-types/worksheets/index';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';
import type { WorksheetContent, WorksheetField } from '@okuvu/shared-types/worksheet';

export const DRAFT_DOC_PATH = 'docs/exercise-library/23-draft-stress-burnout-copy.md';

/** The owner-approved copy, in its own document, so the approval has a record. */
export const APPROVED_DOC_PATH = 'docs/exercise-library/25-approved-stress-burnout-copy.md';

/**
 * The Low Mood batch has its own review document.
 *
 * The stress/anxiety document is the record of that handover; this one is what
 * the owner reads next. Keeping them apart means a batch he has finished with
 * never grows a new section under wording he already approved.
 */
export const LOW_MOOD_DRAFT_DOC_PATH = 'docs/exercise-library/34-draft-low-mood-copy.md';

/** The batches the first draft document covers. */
const EARLIER_BATCH_IDS = new Set<string>([...DRAFT_BATCH_IDS, ...ANXIETY_DRAFT_BATCH_IDS]);

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
  ws_worry_time: '1. Worry time',
  ws_brain_dump: '2. Brain-dump',
  ws_unhooking: '3. Unhooking from a thought',
  ws_sos_calm: '4. SOS calm',
  ws_sitting_with_not_knowing: '5. Sitting with not knowing',
  ws_exam_career_pressure: '6. Big day planner',
  ws_social_situation_prep: '7. Social situation prep',
  ws_family_expectations: '8. Pressure map',
  ws_exposure_ladder: '9. Exposure ladder (therapist-only)',
  ws_one_small_thing: '1. One small thing',
  ws_mood_activity_log: '2. Mood and activity log',
  ws_strengths: '3. Strengths spotting',
  ws_things_i_might_enjoy: '4. Things I might enjoy',
  ws_tiny_steps: '5. Tiny steps ladder',
  ws_inner_critic: '6. Meet the inner critic',
  ws_reconnect_planner: '7. Reconnect planner',
  ws_comparison_check: '8. Comparison check',
  ws_miracle_question: '9. The morning after a miracle',
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
  ws_worry_time: 'A daily time and length for worry time, a parked list, and a still bothering / not anymore review for each worry. Daily email reminder, no app notification.',
  ws_brain_dump: 'One long answer, typed or spoken. At the end: Save it / Let it go (delete).',
  ws_unhooking: 'Short answer: the thought. The app shows it back as "I\'m having the thought that…" then "I notice I\'m having the thought that…". 0–100 belief before and after. Never rewrites the thought.',
  ws_sos_calm: 'One-tap card on Home and in chat: the existing long-out-breath exercise, then 5-4-3-2-1 grounding. Nothing to type.',
  ws_sitting_with_not_knowing: 'What I\'m unsure about, 0–10 discomfort, one small way to let it stay unknown, 0–10 again.',
  ws_exam_career_pressure: 'For exams, placements and interviews: the date, prep steps with dates, an on-the-day checklist, and what I want to remember.',
  ws_social_situation_prep: 'The situation, the prediction, 0–10 worry, one small thing to try. Afterwards: went as feared / better than feared / didn\'t do it, and what actually happened.',
  ws_family_expectations: 'One line per area with expectations (studies, career, money, family, marriage, friends, future): who expects what, 0–10 how heavy, and whose expectation it mostly is.',
  ws_exposure_ladder: 'Therapist-only. Built in the portal with the client: steps rated 0–100, unlocked one at a time. The client rates 0–100 before and after; above 79 shows grounding and a pause line.',
  ws_one_small_thing: 'For heavy days: one tiny action from six options, or your own. Then did it / not this time, with a warm line either way.',
  ws_mood_activity_log: 'A list of entries: time, what I was doing, feelings. A weekly view in words of which activities came with better feelings, with no score.',
  ws_strengths: 'A checklist of strengths, then one recent time you used one.',
  ws_things_i_might_enjoy: 'A checklist of everyday ideas for young people in India. The picked ones are carried into the existing Small things planner, which is not changed.',
  ws_tiny_steps: 'The problem, a list of steps from smallest to biggest, and a date for the first step.',
  ws_inner_critic: 'Name the critic, what it usually says, when it is loudest, what it protects you from, and what you would say back in your own words. High load.',
  ws_reconnect_planner: 'A list of people you miss. Pick one, choose how to reach out and a date. Afterwards: did it / not yet.',
  ws_comparison_check: 'Where you were, how it left you feeling, what you compared yourself to, what the post does not show, one small thing now. High load. No weight, body or food fields.',
  ws_miracle_question: 'If things got better overnight, what would you notice first? Where you are now on 0–10, and what one step up would look like.',
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
  if (content.closing?.handOff) {
    const handOff = content.closing.handOff;
    lines.push(
      '',
      `**Carries over:** the options picked in \`${handOff.field}\` are seeded into ` +
        `\`${handOff.toolId}\`'s own unsaved draft (its \`${handOff.targetField}\` list, in ` +
        `the \`${handOff.targetColumn}\` column), and that worksheet opens prefilled. ` +
        `Button: "${handOff.label}". Nothing is saved on the client's behalf, no row they ` +
        'already wrote is overwritten, and the target worksheet is unchanged.',
    );
  }
  if (content.review) {
    const review = content.review;
    lines.push(
      '',
      `**Read back:** the last ${review.withinDays} days of this worksheet's own entries, ` +
        `grouped by the words in \`${review.activityField}\` and listing the feelings picked in ` +
        `\`${review.feelingsField}\`. In words only: no score, no average, no ranking of feelings.`,
    );
  }
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
    `- opens: ${
      entry.access_mode === 'open'
        ? 'S — the client can open it themselves'
        : entry.access_mode === 'assigned'
          ? 'A — therapist-assigned'
          : entry.access_mode === 'therapist_only'
            ? 'T — therapist-only: never a Library card, never assignable, never suggested by chat'
            : 'in session, with the therapist'
    }`,
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
  // This document covers the stress/anxiety handover. The Low Mood batch has its
  // own document, so a batch the owner is reading now never appears here as a
  // second, staler copy.
  const drafts = draftEntries().filter((entry) => EARLIER_BATCH_IDS.has(entry.tool_id));
  const waiting = drafts.length > 0;

  out.push(
    '# Worksheet draft wording for review, NOT approved',
    '',
    'Generated from the catalogue in `packages/shared-types/worksheets`. Do not edit by',
    'hand: change the catalogue, then regenerate. This is the document the owner reads to',
    'approve wording, so it can never describe a worksheet differently from the app.',
    '',
    waiting
      ? `**Status: drafts.** ${drafts.length} worksheets are written and none of them is`
      : '**Status: none waiting.** Every written worksheet has been',
    waiting
      ? 'approved. Every one is switched off for clients: no card in their Library, no direct'
      : 'approved. Nothing here is awaiting a read, and this document carries no worksheet',
    waiting
      ? 'open, no assignment from the portal. A therapist can preview them. Nothing is'
      : 'bodies. A new worksheet added from now on starts `draft`, appears here, and stays',
    waiting
      ? 'switched on until you say the wording is approved.'
      : 'switched off for clients until you say the wording is approved.',
    '',
    'Every worksheet goes through the same safety check the journal uses on every written and',
    'spoken answer, with the same response. None of the rows below asks for weight, body',
    'measurements, calories, food amounts or medicines, and none adds answers into a total,',
    'a level or a label.',
    '',
    '---',
    '',
  );

  if (!waiting) {
    out.push('No worksheet is waiting for approval.', '');
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
    'is edited in `packages/shared-types/worksheets/<batch>.ts`, never in a screen.',
    '',
  );

  return out.join('\n');
}

/**
 * The Low Mood batch of 24 November 2026, in the words that would ship.
 *
 * Generated for the same reason as every other review document: what the owner
 * reads cannot describe a worksheet differently from the app. Every row is
 * `draft`, so nothing here is live.
 */
export function buildLowMoodDraftDoc(): string {
  const out: string[] = [];
  const drafts = LOW_MOOD_BATCH_IDS.map((id) => {
    const found = CATALOGUE.find((row) => row.tool_id === id);
    if (!found) throw new Error(`low mood doc row "${id}" is not in the catalogue`);
    return found;
  });

  out.push(
    '# Low Mood worksheets — draft wording for review, NOT approved',
    '',
    'Generated from `packages/shared-types/worksheets/low-mood.ts`. Do not edit by hand:',
    'change the catalogue, then regenerate.',
    '',
    `**Status: drafts.** These ${drafts.length} worksheets are written and none of them is`,
    'approved. Every one is switched off for clients: no card in their Library, no direct',
    'open, no assignment from the portal. A therapist can preview them. Nothing is switched',
    'on until you say the wording is approved.',
    '',
    'All nine go through the same safety check the journal uses on every written and spoken',
    'answer, with the same response. Meet the inner critic and the Comparison check also',
    'carry the deeper screen you named on 24 November 2026: skipping meals, restricting',
    'food, making yourself sick, exercising to punish yourself, hating your body, days',
    'without sleep, wanting not to wake up, wanting to hurt someone, and self-harm.',
    '',
    'None of them asks for weight, body measurements, calories, food amounts or medicines,',
    'and none of them adds answers into a total, a level or a label. The one log reads back',
    'in words only: no score, no average, no ranking of feelings.',
    '',
    '---',
    '',
  );

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
    'changed. Approval flips that row to `approved` in a new migration: the wording itself',
    'is edited in `packages/shared-types/worksheets/low-mood.ts`, never in a screen.',
    '',
  );

  return out.join('\n');
}
