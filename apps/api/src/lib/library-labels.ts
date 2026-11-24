/**
 * The worksheets the chat may name — the client's own visible Library, by label.
 *
 * The owner's rule (24 Nov 2026) is that the chat may suggest a worksheet only
 * if it is one the client can already see: "only worksheets that are switched on
 * and visible to that client. Never drafts, and never the exposure ladder."
 *
 * That is one list, so it is one query, and the WHERE clause is the Library's own
 * (`routes/library.ts`): same table, same four filters. A second, hand-written
 * list would drift — a worksheet approved in the portal but filtered differently
 * here would be a suggestion the client cannot find, or worse, a draft named to a
 * client who cannot open it.
 *
 *   status: 'approved'        a draft, retired row or placeholder is never named
 *   kind: worksheet/exercise/group   not a mood card, not a therapy-only row
 *   library_group: null       the four breathing techniques are one card, not four
 *   access_mode != therapist_only   the exposure ladder is never named (rule 6)
 *
 * Plus the one Library rule that is not a column: `in_session` rows (the safety
 * plan) are hidden until a plan actually exists, so they are not named before
 * that either — naming a worksheet the client has no card for is the same bug as
 * naming a draft.
 *
 * No care-plan ordering here on purpose. The app orders the Home screen by the
 * client's plan; a list in a prompt does not need that partition, and the
 * catalogue's own approved order is the one both sides already agree on.
 *
 * FAILURE IS EMPTY, NOT THROWN. This runs on the chat's context path, and a
 * failed lookup must not cost the client their conversation. An empty list is
 * the safe answer: the wording only lets the model name a worksheet that is in
 * the list, so no list means no suggestion — never an invented one.
 *
 * (A unit test whose mocked prisma has no `toolRegistryEntry` delegate lands in
 * that catch and logs the warning below. That is the guard working, not a bug:
 * the turn continues, the chat simply has nothing to suggest.)
 */

import { prisma } from './prisma.js';

export async function getVisibleWorksheetLabels(clientUserId: string): Promise<string[]> {
  try {
    const rows = await prisma.toolRegistryEntry.findMany({
      where: {
        status: 'approved',
        kind: { in: ['worksheet', 'exercise', 'group'] },
        library_group: null,
        access_mode: { not: 'therapist_only' },
      },
      orderBy: [{ section: 'asc' }, { sort_order: 'asc' }],
      select: { label: true, access_mode: true },
    });

    // The safety plan is hidden, not greyed out, until one has been made with
    // the therapist (owner's decision, 9 Nov 2026). Same rule here.
    const needsPlan = rows.some((row) => row.access_mode === 'in_session');
    if (!needsPlan) return rows.map((row) => row.label);

    const plan = await prisma.safetyPlan.findUnique({
      where: { user_id: clientUserId },
      select: { id: true },
    });

    return rows
      .filter((row) => row.access_mode !== 'in_session' || plan !== null)
      .map((row) => row.label);
  } catch (err) {
    console.warn('[library-labels] could not read the client’s Library; chat gets no list', {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
