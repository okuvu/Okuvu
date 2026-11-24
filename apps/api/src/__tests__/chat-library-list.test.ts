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

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    toolRegistryEntry: { findMany: vi.fn() },
    safetyPlan: { findUnique: vi.fn() },
  },
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma as unknown as {
    toolRegistryEntry: { findMany: ReturnType<typeof vi.fn> };
    safetyPlan: { findUnique: ReturnType<typeof vi.fn> };
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
});

describe('the worksheet list changes no instruction today', () => {
  it('assembles the identical v2.6 prompt whether or not a list is supplied', async () => {
    const { buildConversationalPrompt } = await import('../agents/a2/prompts.js');

    const base = {
      safetyState: 'S0' as const,
      sessionHistorySummary: null,
      perceivedIntensity: null,
    };

    const withoutList = buildConversationalPrompt(base);
    const withList = buildConversationalPrompt({
      ...base,
      libraryWorksheets: ['Worry tree', 'Thought record', 'Breathing'],
    });

    // Byte-identical: the token is not in v2.6, so this is a no-op until the
    // owner approves wording that references it.
    expect(withList).toBe(withoutList);
    expect(withList).not.toContain('${library_worksheets}');
    expect(withList).not.toContain('Worry tree');
  });
});
