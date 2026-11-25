/**
 * The committed migrations must be exactly what the catalogue generates.
 *
 * Two copies of a worksheet is how the portal ends up previewing a sentence the
 * client never sees. This test makes the SQL a build artifact: regenerate
 * (WRITE_WORKSHEET_SQL=1) or the build fails.
 *
 * Two files are checked: the applied seed (approved rows + placeholders, no
 * drafts) and the drafts seed for the batch of 24 Nov 2026.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANXIETY_APPROVALS_MIGRATION_PATH,
  ANXIETY_DRAFTS_MIGRATION_PATH,
  LOW_MOOD_DRAFTS_MIGRATION_PATH,
  APPROVALS_MIGRATION_PATH,
  DRAFTS_MIGRATION_PATH,
  MIGRATION_PATH,
  REVISED_APPROVALS_MIGRATION_PATH,
  buildAnxietyApprovalsSql,
  buildAnxietyDraftsSql,
  buildLowMoodDraftsSql,
  buildApprovalsSql,
  buildDraftsSql,
  buildMigrationSql,
  buildRevisedApprovalsSql,
  draftEntries,
  listableToolIds,
} from '../worksheets/emit-sql';

const ROOT = join(__dirname, '../../..');
const FILE = join(ROOT, MIGRATION_PATH);
const DRAFTS_FILE = join(ROOT, DRAFTS_MIGRATION_PATH);
const APPROVALS_FILE = join(ROOT, APPROVALS_MIGRATION_PATH);
const REVISED_APPROVALS_FILE = join(ROOT, REVISED_APPROVALS_MIGRATION_PATH);
const ANXIETY_FILE = join(ROOT, ANXIETY_DRAFTS_MIGRATION_PATH);
const ANXIETY_APPROVALS_FILE = join(ROOT, ANXIETY_APPROVALS_MIGRATION_PATH);
const LOW_MOOD_FILE = join(ROOT, LOW_MOOD_DRAFTS_MIGRATION_PATH);

function wrote(path: string, sql: string): boolean {
  if (process.env.WRITE_WORKSHEET_SQL !== '1') return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, sql, 'utf8');
  return true;
}

describe('generated migration', () => {
  it('matches the catalogue', () => {
    const sql = buildMigrationSql();
    if (wrote(FILE, sql)) return;

    expect(existsSync(FILE)).toBe(true);
    expect(readFileSync(FILE, 'utf8')).toBe(sql);
  });

  it('keeps new draft ids out of the applied seed', () => {
    // Four of the ten reuse a placeholder id the applied seed already created;
    // that migration is left byte-identical and the drafts migration upgrades the
    // row in place. The six genuinely new ids must not appear there.
    const sql = buildMigrationSql();
    for (const id of [
      'ws_whats_on_my_plate',
      'ws_basics_check',
      'ws_rest_break',
      'ws_priority_sorter',
      'ws_weekly_load_check',
      'ws_caring_load_check',
    ]) {
      expect(sql).not.toContain(`'${id}'`);
    }
    // ...and the four reused ones are still placeholders in that file.
    expect(sql).toContain(
      "('c1b2a3d4-0000-4e00-9000-000000000016', 'ws_boundary_planner', 'Boundary planner'",
    );
    expect(sql).toContain("'placeholder'");
  });

  it('lists every approved Library entry and every placeholder', () => {
    // 16 from the 9 Nov approved document + the 10 the owner approved on 24 Nov
    // + the 9 he approved on 24 Nov (Anxiety & Worry). The exposure ladder is in
    // this count because it is approved; the api's client query excludes
    // `therapist_only`, which is what keeps it out of the Library.
    expect(listableToolIds()).toHaveLength(35);
    const sql = buildMigrationSql();
    expect(sql).toContain("'ws_safety_plan'");
    expect(sql).toContain("'ws_energy_audit'");
    // Hidden placeholders are in the database, never in a list query.
    expect(sql).toContain("'placeholder'");
    expect(sql).toContain("'guided_breathing'");
  });
});

describe('generated drafts migration', () => {
  it('matches the catalogue', () => {
    const sql = buildDraftsSql();
    if (wrote(DRAFTS_FILE, sql)) return;

    expect(existsSync(DRAFTS_FILE)).toBe(true);
    expect(readFileSync(DRAFTS_FILE, 'utf8')).toBe(sql);
  });

  it('still carries the whole batch, and every row in it is a draft', () => {
    const sql = buildDraftsSql();
    for (const id of [
      'ws_whats_on_my_plate',
      'ws_basics_check',
      'ws_rest_break',
      'ws_boundary_planner',
      'ws_priority_sorter',
      'ws_scrolling_log',
      'ws_weekly_load_check',
      'ws_unsent_letter',
      'ws_pros_cons_change',
      'ws_caring_load_check',
    ]) {
      expect(sql).toContain(`'${id}'`);
    }
    expect(sql).not.toContain("'ws_worry_tree'");
    expect(sql).not.toContain("'placeholder'");
    // Every row is switched off in the SQL itself, not by a column default.
    expect(sql.match(/'draft'/g)?.length).toBe(10);
    // No approval date anywhere: this migration is the drafting, not the approval.
    expect(sql).not.toContain('2026-11-24');
  });

  it('leaves the earlier batch with nothing as a draft', () => {
    // The owner read the revised wording and approved it the same day, so the
    // Stress & Burnout batch has no draft left. The batches briefed later the
    // same day have their own migrations and their own tests.
    const stressIds = new Set([
      'ws_whats_on_my_plate',
      'ws_basics_check',
      'ws_rest_break',
      'ws_boundary_planner',
      'ws_priority_sorter',
      'ws_scrolling_log',
      'ws_weekly_load_check',
      'ws_unsent_letter',
      'ws_pros_cons_change',
      'ws_caring_load_check',
    ]);
    expect(draftEntries().filter((entry) => stressIds.has(entry.tool_id))).toEqual([]);
  });
});

describe('generated Anxiety & Worry drafts migration', () => {
  it('matches the catalogue', () => {
    const sql = buildAnxietyDraftsSql();
    if (wrote(ANXIETY_FILE, sql)) return;

    expect(existsSync(ANXIETY_FILE)).toBe(true);
    expect(readFileSync(ANXIETY_FILE, 'utf8')).toBe(sql);
  });

  it('carries all nine rows, every one switched off', () => {
    const sql = buildAnxietyDraftsSql();
    for (const id of [
      'ws_worry_time',
      'ws_brain_dump',
      'ws_unhooking',
      'ws_sos_calm',
      'ws_sitting_with_not_knowing',
      'ws_exam_career_pressure',
      'ws_social_situation_prep',
      'ws_family_expectations',
      'ws_exposure_ladder',
    ]) {
      expect(sql).toContain(`'${id}'`);
    }
    expect(sql.match(/'draft'/g)?.length).toBe(9);
    // Drafting is not approval: no approved status and no approval date.
    expect(sql).not.toContain("'approved'");
    expect(sql).not.toContain('2026-11-24');
  });

  it('writes the exposure ladder as therapist-only, in the row itself', () => {
    // The owner's rule: never a Library card, never assignable. The access mode
    // travels with the row so no query has to know the id.
    const sql = buildAnxietyDraftsSql();
    const row = sql.split('\n').find((line) => line.includes("'ws_exposure_ladder', 'Exposure ladder'"));
    expect(row).toBeTruthy();
    expect(row).toContain("'therapist_only'");
    expect(row).toContain("'demanding'");
  });

  it('keeps the six genuinely new ids out of the applied seed', () => {
    const sql = buildMigrationSql();
    for (const id of [
      'ws_worry_time',
      'ws_brain_dump',
      'ws_sos_calm',
      'ws_sitting_with_not_knowing',
      'ws_social_situation_prep',
    ]) {
      expect(sql).not.toContain(`'${id}'`);
    }
    // The three reused ids are still placeholders there, upgraded in place here.
    expect(sql).toContain("'ws_unhooking', 'Unhooking from thoughts'");
    expect(sql).toContain("'ws_exam_career_pressure', 'Exam and career pressure planner'");
    expect(sql).toContain("'ws_family_expectations', 'Family expectations map'");
  });

  it('leaves nothing in this batch as a draft once the approvals land', () => {
    // The owner read the wording back and approved all nine on 24 Nov 2026, so
    // this batch has no draft left. Restated as the property rather than as
    // "the catalogue has no drafts at all": the Low Mood batch, briefed later
    // the same day, is deliberately all draft.
    const anxietyIds = new Set([
      'ws_worry_time',
      'ws_brain_dump',
      'ws_unhooking',
      'ws_sos_calm',
      'ws_sitting_with_not_knowing',
      'ws_exam_career_pressure',
      'ws_social_situation_prep',
      'ws_family_expectations',
      'ws_exposure_ladder',
    ]);
    expect(draftEntries().filter((entry) => anxietyIds.has(entry.tool_id))).toEqual([]);
  });

});

describe('generated approvals migration', () => {
  it('matches the catalogue', () => {
    const sql = buildApprovalsSql();
    if (wrote(APPROVALS_FILE, sql)) return;

    expect(existsSync(APPROVALS_FILE)).toBe(true);
    expect(readFileSync(APPROVALS_FILE, 'utf8')).toBe(sql);
  });

  it('approves the eight, with the owner’s date and not the 9 Nov one', () => {
    const sql = buildApprovalsSql();
    expect(sql.match(/'approved'/g)?.length).toBe(8);
    expect(sql.match(/'2026-11-24'::timestamp/g)?.length).toBe(8);
    expect(sql).not.toContain('2026-11-09');
  });

  it('never promotes the two the owner did not approve', () => {
    const sql = buildApprovalsSql();
    expect(sql).not.toContain("'ws_unsent_letter'");
    expect(sql).not.toContain("'ws_pros_cons_change'");
  });

  it('cannot leave a row approved with no body: the copy travels with the status', () => {
    const sql = buildApprovalsSql();
    // Each approved row carries its content_en in the same statement.
    expect(sql.match(/"content_en" = EXCLUDED."content_en"/g)?.length).toBe(1);
    expect(sql).toContain('$ws_ws_weekly_load_check$');
  });
});

describe('generated revised-approvals migration', () => {
  it('matches the catalogue', () => {
    const sql = buildRevisedApprovalsSql();
    if (wrote(REVISED_APPROVALS_FILE, sql)) return;

    expect(existsSync(REVISED_APPROVALS_FILE)).toBe(true);
    expect(readFileSync(REVISED_APPROVALS_FILE, 'utf8')).toBe(sql);
  });

  it('approves exactly the two revised rows, with the owner’s date', () => {
    const sql = buildRevisedApprovalsSql();
    expect(sql).toContain("'ws_unsent_letter'");
    expect(sql).toContain("'ws_pros_cons_change'");
    expect(sql.match(/'approved'/g)?.length).toBe(2);
    expect(sql.match(/'2026-11-24'::timestamp/g)?.length).toBe(2);
    // The revised text, not the pre-revision wording.
    expect(sql).toContain('OKUVU will check in with you and may let your therapist know');
    expect(sql).toContain('Readiness can change from day to day');
    expect(sql).not.toContain('2026-11-09');
  });

  it('carries the revised body with the promotion', () => {
    const sql = buildRevisedApprovalsSql();
    expect(sql.match(/"content_en" = EXCLUDED."content_en"/g)?.length).toBe(1);
    expect(sql).toContain('$ws_ws_unsent_letter$');
    expect(sql).toContain('$ws_ws_pros_cons_change$');
  });
});

describe('generated Anxiety & Worry approvals migration', () => {
  it('matches the catalogue', () => {
    const sql = buildAnxietyApprovalsSql();
    if (wrote(ANXIETY_APPROVALS_FILE, sql)) return;

    expect(existsSync(ANXIETY_APPROVALS_FILE)).toBe(true);
    expect(readFileSync(ANXIETY_APPROVALS_FILE, 'utf8')).toBe(sql);
  });

  it('carries all nine rows as approved, with the approval date', () => {
    const sql = buildAnxietyApprovalsSql();
    for (const id of [
      'ws_worry_time',
      'ws_brain_dump',
      'ws_unhooking',
      'ws_sos_calm',
      'ws_sitting_with_not_knowing',
      'ws_exam_career_pressure',
      'ws_social_situation_prep',
      'ws_family_expectations',
      'ws_exposure_ladder',
    ]) {
      expect(sql, id).toContain(`'${id}'`);
    }
    expect(sql.match(/'approved'/g)?.length).toBe(9);
    expect(sql.match(/2026-11-24/g)?.length).toBe(9);
    // The approval carries the copy with it.
    expect(sql).not.toContain("'draft'");
  });

  it('records the approved revisions, not the text they replaced', () => {
    const sql = buildAnxietyApprovalsSql();
    // The four rows the owner changed before approving.
    expect(sql).toContain('helps it sound like what it is: a thought');
    expect(sql).toContain("then notice what's around you");
    expect(sql).toContain('Stay here as long as you need.');
    expect(sql).toContain('keep you stuck');
    expect(sql).toContain('10 = very hard');
    expect(sql).toContain('What got in the way?');
    // ...and the pre-revision sentences are gone from the approved body.
    expect(sql).not.toContain('is how it starts to sound like one');
    expect(sql).not.toContain('10 = unbearable');
    expect(sql).not.toContain('keep you awake');
  });
});

describe('generated Low Mood drafts migration', () => {
  it('matches the catalogue', () => {
    const sql = buildLowMoodDraftsSql();
    if (wrote(LOW_MOOD_FILE, sql)) return;

    expect(existsSync(LOW_MOOD_FILE)).toBe(true);
    expect(readFileSync(LOW_MOOD_FILE, 'utf8')).toBe(sql);
  });

  it('carries all nine rows, every one switched off', () => {
    const sql = buildLowMoodDraftsSql();
    for (const id of [
      'ws_one_small_thing',
      'ws_mood_activity_log',
      'ws_strengths',
      'ws_things_i_might_enjoy',
      'ws_tiny_steps',
      'ws_inner_critic',
      'ws_reconnect_planner',
      'ws_comparison_check',
      'ws_miracle_question',
    ]) {
      expect(sql, id).toContain(`'${id}'`);
    }
    expect(sql.match(/'draft'/g)?.length).toBe(9);
    // Drafting is not approval: no approved status and no approval date.
    expect(sql).not.toContain("'approved'");
    expect(sql).not.toContain('2026-11-24');
    // Every row carries the Low Mood label. Which two carry the deeper screen
    // is asserted per row in the test below, not by counting the column name.
    expect(sql.match(/'low_mood'/g)?.length).toBe(9);
  });

  it('upgrades the five placeholder ids in place, and leaves the seed alone', () => {
    const seed = buildMigrationSql();
    // The applied seed still creates them as placeholders, byte for byte.
    expect(seed).toContain("'ws_strengths', 'Strengths'");
    expect(seed).toContain("'ws_tiny_steps', 'Tiny steps'");
    expect(seed).toContain("'ws_miracle_question', 'The miracle question'");
    expect(seed).toContain("'ws_comparison_check', 'Comparison check'");
    expect(seed).toContain("'ws_inner_critic', 'Meet the inner critic'");
    // ...and the four genuinely new ids never appear there.
    for (const id of [
      'ws_one_small_thing',
      'ws_mood_activity_log',
      'ws_things_i_might_enjoy',
      'ws_reconnect_planner',
    ]) {
      expect(seed).not.toContain(`'${id}'`);
    }
  });

  it('carries the two deeper-screen rows as demanding, and the rest as light', () => {
    const sql = buildLowMoodDraftsSql();
    for (const id of ['ws_inner_critic', 'ws_comparison_check']) {
      const row = sql.split('\n').find((line) => line.includes(`'${id}',`));
      expect(row, id).toBeTruthy();
      expect(row, id).toContain("'demanding'");
      expect(row, id).toContain('true');
    }
  });

  it('writes the access mode the owner asked for, per row', () => {
    const sql = buildLowMoodDraftsSql();
    const open = ['ws_one_small_thing', 'ws_mood_activity_log', 'ws_strengths', 'ws_things_i_might_enjoy'];
    const assigned = [
      'ws_tiny_steps',
      'ws_inner_critic',
      'ws_reconnect_planner',
      'ws_comparison_check',
      'ws_miracle_question',
    ];
    for (const id of open) {
      const row = sql.split('\n').find((line) => line.includes(`'${id}',`));
      expect(row, id).toContain("'open'");
    }
    for (const id of assigned) {
      const row = sql.split('\n').find((line) => line.includes(`'${id}',`));
      expect(row, id).toContain("'assigned'");
    }
  });
});
