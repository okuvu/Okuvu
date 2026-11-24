/**
 * The worksheets the chat may name — the client's own visible Library.
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
 * EACH ROW CARRIES WHAT THE CHAT'S OWN INSTRUCTIONS REQUIRE (v2.7):
 *
 *   load_level   'light' | 'demanding' — because the chat may never suggest the
 *                Unsent letter, A letter from a kind friend, or any other
 *                high-load worksheet unless the therapist assigned it, and it
 *                cannot apply that rule to a bare list of names.
 *   access       'open' (they can start it themselves) | 'assigned' (only an
 *                assignment opens it) | 'in_session' (made with the therapist)
 *   assigned     true when this client has an active Homework row for it now —
 *                so "only ones they can open themselves, or ones their therapist
 *                assigned" is a fact in the prompt rather than a guess.
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

import type { LibraryWorksheetRef } from '@okuvu/shared-types';
import { prisma } from './prisma.js';

type AccessMode = LibraryWorksheetRef['access'];

function asAccess(value: string): AccessMode {
  // A therapist-only row never reaches here (the query excludes it). Anything
  // unrecognised is treated as `assigned`: the narrower reading, so an
  // unexpected mode cannot licence a suggestion the client cannot act on.
  if (value === 'open' || value === 'in_session') return value;
  return 'assigned';
}

export async function getVisibleWorksheets(clientUserId: string): Promise<LibraryWorksheetRef[]> {
  try {
    const rows = await prisma.toolRegistryEntry.findMany({
      where: {
        status: 'approved',
        kind: { in: ['worksheet', 'exercise', 'group'] },
        library_group: null,
        access_mode: { not: 'therapist_only' },
      },
      orderBy: [{ section: 'asc' }, { sort_order: 'asc' }],
      select: {
        tool_id: true,
        label: true,
        load_level: true,
        access_mode: true,
      },
    });

    // The safety plan is hidden, not greyed out, until one has been made with
    // the therapist (owner's decision, 9 Nov 2026). Same rule here.
    const needsPlan = rows.some((row) => row.access_mode === 'in_session');
    let visible = rows;
    if (needsPlan) {
      const plan = await prisma.safetyPlan.findUnique({
        where: { user_id: clientUserId },
        select: { id: true },
      });
      visible = rows.filter((row) => row.access_mode !== 'in_session' || plan !== null);
    }

    if (visible.length === 0) return [];

    // An active assignment is what makes an assigned-only worksheet nameable.
    // One query for the whole list rather than one per row.
    let assignedIds = new Set<string>();
    try {
      const homework = await prisma.homework.findMany({
        where: {
          client_user_id: clientUserId,
          status: 'active',
          tool_id: { in: visible.map((row) => row.tool_id) },
        },
        select: { tool_id: true },
      });
      assignedIds = new Set(homework.map((row) => row.tool_id).filter((id): id is string => Boolean(id)));
    } catch (err) {
      // A failed assignment lookup narrows the list rather than widening it: an
      // assigned-only worksheet is then reported as not assigned, so the chat
      // simply does not offer it. Never the other way round.
      console.warn('[library-labels] could not read assignments; treating them as none', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return visible.map((row) => ({
      label: row.label,
      load_level: row.load_level === 'demanding' ? 'demanding' : 'light',
      access: asAccess(row.access_mode),
      assigned: assignedIds.has(row.tool_id),
    }));
  } catch (err) {
    console.warn('[library-labels] could not read the client’s Library; chat gets no list', {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Labels only — for callers that need nothing more than a name list. */
export async function getVisibleWorksheetLabels(clientUserId: string): Promise<string[]> {
  const rows = await getVisibleWorksheets(clientUserId);
  return rows.map((row) => row.label);
}
