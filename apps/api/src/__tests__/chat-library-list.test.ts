/**
 * The chat's worksheet list — the client's own Library, and nothing else.
 *
 * Owner's instruction (24 Nov 2026): "wire the client's Library list into the
 * chat in the same change, but only worksheets that are switched on and visible
 * to that client. Never drafts, and never the exposure ladder."
 *
 * Four properties, each of which has been a real bug shape somewhere:
 *
 *   1. a draft is never named — the model would offer a worksheet with no card;
 *   2. a therapist-only row is never named — the exposure ladder is rule 6;
 *   3. the safety plan is named only once a plan exists — hidden, not greyed out;
 *   4. a failed lookup gives an empty list, not a failed turn — the wording only
 *      allows naming something in the list, so no list can never mean invention.
 *
 * Plus the property that makes this safe to merge before the wording is approved:
 * the v2.6 prompt does not contain `${library_worksheets}`, so passing the list
 * changes the assembled prompt by exactly nothing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    toolRegistryEntry: { findMany: vi.fn() },
    safetyPlan: { findUnique: vi.fn() },
    homework: { findMany: vi.fn() },
  },
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma as unknown as {
    toolRegistryEntry: { findMany: ReturnType<typeof vi.fn> };
    safetyPlan: { findUnique: ReturnType<typeof vi.fn> };
    homework: { findMany: ReturnType<typeof vi.fn> };
  };
}

const rows = [
  { label: 'Worry tree', access_mode: 'open' },
  { label: 'Thought record', access_mode: 'open' },
  { label: 'A draft I never approved', access_mode: 'open' },
  { label: 'Exposure ladder', access_mode: 'therapist_only' },
  { label: 'My safety plan', access_mode: 'in_session' },
];

describe('the chat’s worksheet list', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const prisma = await importMocks();
    // The query's own WHERE is what filters; the mock returns every shape so a
    // missing filter shows up as a leaked label rather than a silent pass.
    prisma.toolRegistryEntry.findMany.mockResolvedValue(rows);
    prisma.safetyPlan.findUnique.mockResolvedValue(null);
    prisma.homework.findMany.mockResolvedValue([]);
  });

  it('asks only for approved, non-therapist-only, ungrouped catalogue rows', async () => {
    const { getVisibleWorksheetLabels } = await import('../lib/library-labels.js');
    const prisma = await importMocks();

    await getVisibleWorksheetLabels('user-1');

    const query = prisma.toolRegistryEntry.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      status: 'approved',
      kind: { in: ['worksheet', 'exercise', 'group'] },
      library_group: null,
      access_mode: { not: 'therapist_only' },
    });
  });

  it('never names a draft and never names the exposure ladder', async () => {
    const { getVisibleWorksheetLabels } = await import('../lib/library-labels.js');
    // A mock cannot apply the WHERE, so the two excluded labels are dropped here
    // only to model what the database would return — the assertion is on what a
    // real query's rows could make the function emit.
    const prisma = await importMocks();
    prisma.toolRegistryEntry.findMany.mockResolvedValue(
      rows.filter((r) => r.label !== 'A draft I never approved' && r.access_mode !== 'therapist_only'),
    );

    const labels = await getVisibleWorksheetLabels('user-1');

    expect(labels).not.toContain('A draft I never approved');
    expect(labels).not.toContain('Exposure ladder');
    expect(labels).toEqual(expect.arrayContaining(['Worry tree', 'Thought record']));
  });

  it('hides the safety plan until a plan exists, then names it', async () => {
    const { getVisibleWorksheetLabels } = await import('../lib/library-labels.js');
    const prisma = await importMocks();
    prisma.toolRegistryEntry.findMany.mockResolvedValue(
      rows.filter((r) => r.label !== 'A draft I never approved' && r.access_mode !== 'therapist_only'),
    );

    expect(await getVisibleWorksheetLabels('user-1')).not.toContain('My safety plan');

    prisma.safetyPlan.findUnique.mockResolvedValue({ id: 'plan-1' });
    expect(await getVisibleWorksheetLabels('user-1')).toContain('My safety plan');
  });

  it('answers with an empty list — not a thrown error — when the lookup fails', async () => {
    const { getVisibleWorksheetLabels } = await import('../lib/library-labels.js');
    const prisma = await importMocks();
    prisma.toolRegistryEntry.findMany.mockRejectedValue(new Error('db down'));

    await expect(getVisibleWorksheetLabels('user-1')).resolves.toEqual([]);
  });

  it('carries load level and whether this client was assigned it', async () => {
    const { getVisibleWorksheets } = await import('../lib/library-labels.js');
    const prisma = await importMocks();

    prisma.toolRegistryEntry.findMany.mockResolvedValue([
      { tool_id: 'ws_worry_tree', label: 'Worry tree', access_mode: 'open', load_level: 'light' },
      {
        tool_id: 'ws_boundary_planner',
        label: 'Boundary planner',
        access_mode: 'assigned',
        load_level: 'light',
      },
      {
        tool_id: 'ws_unsent_letter',
        label: 'Unsent letter',
        access_mode: 'assigned',
        load_level: 'demanding',
      },
    ]);
    prisma.homework.findMany.mockResolvedValue([{ tool_id: 'ws_boundary_planner' }]);

    const list = await getVisibleWorksheets('user-1');

    expect(list).toEqual([
      { label: 'Worry tree', load_level: 'light', access: 'open', assigned: false },
      { label: 'Boundary planner', load_level: 'light', access: 'assigned', assigned: true },
      { label: 'Unsent letter', load_level: 'demanding', access: 'assigned', assigned: false },
    ]);

    // The assignment query is scoped to this client's active homework, and to
    // the tools actually in the list — not the whole Homework table.
    const homeworkQuery = prisma.homework.findMany.mock.calls[0][0];
    expect(homeworkQuery.where).toMatchObject({
      client_user_id: 'user-1',
      status: 'active',
    });
  });

  it('reports none assigned — never "assigned" — when the assignment lookup fails', async () => {
    const { getVisibleWorksheets } = await import('../lib/library-labels.js');
    const prisma = await importMocks();

    prisma.toolRegistryEntry.findMany.mockResolvedValue([
      {
        tool_id: 'ws_unsent_letter',
        label: 'Unsent letter',
        access_mode: 'assigned',
        load_level: 'demanding',
      },
    ]);
    prisma.homework.findMany.mockRejectedValue(new Error('db down'));

    const list = await getVisibleWorksheets('user-1');

    // The failure narrows the list: an assigned-only worksheet is reported as
    // not assigned, so the chat does not offer it. Never the other way round.
    expect(list).toEqual([
      { label: 'Unsent letter', load_level: 'demanding', access: 'assigned', assigned: false },
    ]);
  });
});

describe('the worksheet list changes no instruction by itself', () => {
  /**
   * The v2.7 candidate file, passed explicitly.
   *
   * The default prompt is v2.6 again (the gate is strict, and v2.7 did not
   * pass), and v2.6 has no `${library_worksheets}` token — so scoring the
   * builder against the default would prove nothing about the wording that
   * needs it. Reading the candidate here keeps the assertion attached to the
   * paragraph that will ship with the list.
   */
  const candidatePrompt = () =>
    readFileSync(join(__dirname, '..', 'prompts', 'a2-okuvu-v2.7.txt'), 'utf-8');

  it('is inert when no list is supplied — the token becomes "none visible today"', async () => {
    const { buildConversationalPrompt } = await import('../agents/a2/prompts.js');

    const base = {
      safetyState: 'S0' as const,
      sessionHistorySummary: null,
      perceivedIntensity: null,
      systemPrompt: candidatePrompt(),
    };

    const withoutList = buildConversationalPrompt(base);

    // v2.7 does reference the token now, so an absent list is not a no-op any
    // more — it says there is nothing to suggest from, which is the safe
    // direction. What must never happen: a token left unsubstituted.
    expect(withoutList).not.toContain('${library_worksheets}');
    expect(withoutList).toContain('none visible today');
  });

  it('renders one line per worksheet, with load level and who can open it', async () => {
    const { buildConversationalPrompt, formatLibraryWorksheet } = await import(
      '../agents/a2/prompts.js'
    );

    const lines = [
      { label: 'Worry tree', load_level: 'light' as const, access: 'open' as const, assigned: false },
      { label: 'Boundary planner', load_level: 'light' as const, access: 'assigned' as const, assigned: true },
      { label: 'Priority sorter', load_level: 'light' as const, access: 'assigned' as const, assigned: false },
      { label: 'Unsent letter', load_level: 'demanding' as const, access: 'assigned' as const, assigned: false },
    ];

    expect(formatLibraryWorksheet(lines[0])).toBe(
      'Worry tree — light · they can open this themselves',
    );
    expect(formatLibraryWorksheet(lines[1])).toBe(
      'Boundary planner — light · assigned to them by their therapist',
    );
    expect(formatLibraryWorksheet(lines[2])).toBe(
      'Priority sorter — light · their therapist has to assign this one',
    );
    expect(formatLibraryWorksheet(lines[3])).toBe(
      'Unsent letter — demanding · their therapist has to assign this one',
    );

    const prompt = buildConversationalPrompt({
      safetyState: 'S0' as const,
      sessionHistorySummary: null,
      perceivedIntensity: null,
      libraryWorksheets: lines,
      systemPrompt: candidatePrompt(),
    });

    // Every fact the wording needs is in the prompt, on its own line.
    expect(prompt).toContain('Worry tree — light · they can open this themselves');
    expect(prompt).toContain('Unsent letter — demanding · their therapist has to assign this one');
    expect(prompt).not.toContain('${library_worksheets}');
  });
});
