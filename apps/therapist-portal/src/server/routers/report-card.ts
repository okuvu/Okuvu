import { z } from 'zod';
import { chatAccessWindow } from '@okuvu/shared-types';
import {
  assertClientAssigned,
  assertLiveLink,
  isBypassEnabled,
  logClinicalAccess,
  router,
  therapistProcedure,
} from '../trpc';

// Worker 05 (apps/worker/src/lib/summary.ts) persists SessionSummary.summary_text
// as JSON.stringify(parsed) — the whole structured record, not prose. Parse it
// back defensively: legacy/failed rows may not be valid JSON.
interface ParsedSummary {
  narrative_summary?: string;
  themes?: string[];
  open_loops?: string[];
  safety_flags?: unknown;
  homework_progress?: {
    assigned?: string | null;
    user_reported?: string;
    user_quotes?: string[];
  };
}

function parseSummaryText(summaryText: string | null): ParsedSummary {
  if (!summaryText) return {};
  try {
    return JSON.parse(summaryText) as ParsedSummary;
  } catch {
    return { narrative_summary: summaryText };
  }
}

/**
 * A worksheet's answers as plain text, for the one place Session Prep shows a
 * client's own words ("What I want to bring to session"). Field ids are used
 * as labels: this is a reading aid, not the on-screen worksheet, and inventing
 * prettier labels here would be a second copy of the approved copy.
 */
function worksheetAnswersText(answers: unknown): string {
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) return '';
  const lines: string[] = [];
  for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      lines.push(value.trim());
    } else if (Array.isArray(value)) {
      const parts = value.filter(
        (part): part is string => typeof part === 'string' && part.trim().length > 0,
      );
      if (parts.length > 0) lines.push(parts.join(', '));
    }
  }
  return lines.join('\n');
}

export const reportCardRouter = router({
  // "Session Prep": what happened since the client's last session.
  //
  // Two halves, two rules (owner's Step 9):
  //
  //  1. Chat-derived summaries — Worker 05's SessionSummary output — keep the
  //     client's own approval and the 30-day window (Step 4). No approval, no
  //     summaries.
  //  2. The shared half — the entries and notes the client turned sharing on
  //     for, which assignments were done, and their "What I want to bring to
  //     session" if that one response is shared — is shown because the client
  //     shared it, NOT because chat access was granted. A client can share
  //     their journal and still keep chat private; gating the shared half on
  //     chat access would hide work they explicitly handed over.
  //
  // Everything in the shared half is descriptive: a title, a date, done or not
  // done. No scores, no labels, no judgement about whether the client is better
  // or worse, and nothing the client kept private — not even a count.
  sessionPrep: therapistProcedure
    .input(z.object({ clientId: z.string().min(1), days: z.number().int().positive().max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const empty = {
        chatGranted: false as boolean,
        entries: [] as {
          sessionId: string;
          date: string;
          narrativeSummary: string | null;
          themes: string[];
          openLoops: string[];
        }[],
        since: new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString(),
        shared: { total: 0, journal: 0, worksheets: 0, notes: 0, items: [] as { kind: string; title: string; at: string }[] },
        assignments: [] as { label: string; done: boolean; dueAt: string | null; lastDoneAt: string | null; repeating: boolean }[],
        bringToSession: null as string | null,
      };

      if (isBypassEnabled()) {
        return { ...empty, chatGranted: true };
      }

      const db = ctx.db;
      const therapistId = ctx.therapistId;

      // "Not assigned" first, so that message stays the one an unrelated
      // therapist sees; then the live-link rule, so care that has ended reads
      // nothing at all.
      await assertClientAssigned(db, therapistId, input.clientId);
      await assertLiveLink(db, therapistId, input.clientId);

      const assignment = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientId,
          },
        },
        // Step 4 — the same rule as everywhere else. A bare boolean cannot
        // expire, so reading it here let chat summaries through after the
        // client's 30-day approval window had closed, and let a flag the
        // therapist set themselves stand in for the client's consent. The
        // window is computed by the one shared predicate the app also uses.
        select: { chat_access_granted_at: true, chat_access_closed_at: true },
      });

      const chatGranted = chatAccessWindow(assignment) !== null;

      // Since the last session if there was one, else the caller's window.
      const lastSession = await db.appointment.findFirst({
        where: {
          therapist_id: therapistId,
          client_user_id: input.clientId,
          scheduled_at: { lt: new Date() },
          cancelled_at: null,
        },
        orderBy: { scheduled_at: 'desc' },
        select: { scheduled_at: true },
      });

      const since = lastSession
        ? lastSession.scheduled_at
        : new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const [summaries, journal, worksheets, notes, homework] = await Promise.all([
        // The chat half is only queried when the client approved it — a query
        // that never runs cannot leak.
        chatGranted
          ? db.sessionSummary.findMany({
              where: { user_id: input.clientId, status: 'COMPLETED', created_at: { gte: since } },
              orderBy: { created_at: 'desc' },
              select: { session_id: true, summary_text: true, created_at: true },
            })
          : Promise.resolve([]),
        db.journalEntry.findMany({
          where: {
            user_id: input.clientId,
            shared_with_therapist: true,
            created_at: { gte: since },
          },
          orderBy: { created_at: 'desc' },
          take: 50,
          select: { id: true, created_at: true, emotion: true },
        }),
        db.worksheetResponse.findMany({
          where: {
            user_id: input.clientId,
            shared_with_therapist: true,
            completed_at: { gte: since },
          },
          orderBy: { completed_at: 'desc' },
          take: 50,
          select: {
            id: true,
            worksheet_id: true,
            answers: true,
            completed_at: true,
            worksheet: { select: { label: true } },
          },
        }),
        db.treasureNote.findMany({
          where: {
            user_id: input.clientId,
            shared_with_therapist: true,
            created_at: { gte: since },
          },
          orderBy: { created_at: 'desc' },
          take: 50,
          select: { id: true, title: true, created_at: true },
        }),
        db.homework.findMany({
          where: { client_user_id: input.clientId, assigned_at: { gte: since } },
          orderBy: { assigned_at: 'desc' },
          take: 50,
          select: {
            id: true,
            description: true,
            frequency: true,
            due_at: true,
            status: true,
            last_completed_at: true,
            tool: { select: { label: true } },
            completions: {
              orderBy: { completed_at: 'desc' },
              take: 1,
              select: { completed_at: true },
            },
          },
        }),
      ]);

      const sharedItems = [
        ...journal.map((row) => ({
          kind: 'journal_entry',
          title: row.emotion ? `Journal · ${row.emotion}` : 'Journal',
          at: row.created_at.toISOString(),
        })),
        ...worksheets.map((row) => ({
          kind: 'worksheet_response',
          title: row.worksheet?.label ?? 'Worksheet',
          at: row.completed_at.toISOString(),
        })),
        ...notes.map((row) => ({
          kind: 'treasure_note',
          title: row.title ?? 'Treasure Box note',
          at: row.created_at.toISOString(),
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      // Only the shared response is a candidate. An unshared "What I want to
      // bring to session" is invisible here, like everything else unshared.
      const bringResponse = worksheets.find((row) => row.worksheet_id === 'ws_bring_to_session');
      const bringToSession = bringResponse ? worksheetAnswersText(bringResponse.answers) : null;

      if (chatGranted) {
        await logClinicalAccess(db, therapistId, input.clientId, 'VIEW_SESSION_PREP');
      }

      return {
        chatGranted,
        entries: summaries.map((s) => {
          const parsed = parseSummaryText(s.summary_text);
          return {
            sessionId: s.session_id,
            date: s.created_at.toISOString(),
            narrativeSummary: parsed.narrative_summary ?? null,
            themes: parsed.themes ?? [],
            openLoops: parsed.open_loops ?? [],
          };
        }),
        since: since.toISOString(),
        shared: {
          total: sharedItems.length,
          journal: journal.length,
          worksheets: worksheets.length,
          notes: notes.length,
          items: sharedItems.slice(0, 20),
        },
        assignments: homework.map((row) => ({
          label: row.tool?.label ?? row.description,
          done:
            row.status === 'completed' ||
            row.last_completed_at !== null ||
            row.completions.length > 0,
          dueAt: row.due_at ? row.due_at.toISOString() : null,
          lastDoneAt:
            row.last_completed_at?.toISOString() ?? row.completions[0]?.completed_at.toISOString() ?? null,
          repeating: row.frequency !== null && row.frequency !== 'once',
        })),
        bringToSession,
      };
    }),


  // "Report Card": homework + mood progress, therapist-only, gated on the
  // client's chat_access_granted consent (first real consumer of that
  // field — enforced here even though no consent-capture UI exists yet to
  // set it true, so every client shows "not granted" until that lands).
  reportCard: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (isBypassEnabled()) {
        return {
          granted: true as const,
          homeworkProgress: [],
          homeworkCounts: { active: 0, completed: 0 },
          homeworkTrack: [],
          moodTrend: [],
          signals: { latestTaperState: 'none', closureOfferedRecently: false, frustrationEventCount: 0, therapistReferralRecently: false },
        };
      }

      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);

      const assignment = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientId,
          },
        },
        // Step 4 — the same rule as everywhere else. A bare boolean cannot
        // expire, so reading it here let chat summaries through after the
        // client's 30-day approval window had closed, and let a flag the
        // therapist set themselves stand in for the client's consent. The
        // window is computed by the one shared predicate the app also uses.
        select: { chat_access_granted_at: true, chat_access_closed_at: true },
      });

      if (chatAccessWindow(assignment) === null) {
        return { granted: false as const };
      }

      await logClinicalAccess(db, therapistId, input.clientId, 'VIEW_REPORT_CARD');

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [summaries, homeworkCounts, userMemory, moodLogs, recentTurns] = await Promise.all([
        db.sessionSummary.findMany({
          where: { user_id: input.clientId, status: 'COMPLETED' },
          orderBy: { created_at: 'desc' },
          take: 5,
          select: { summary_text: true, created_at: true },
        }),
        db.homework.groupBy({
          by: ['status'],
          where: { client_user_id: input.clientId },
          _count: true,
        }),
        db.userMemory.findUnique({
          where: { user_id: input.clientId },
          select: { homework_track: true },
        }),
        db.moodLog.findMany({
          where: { user_id: input.clientId, date_ist: { gte: thirtyDaysAgo } },
          orderBy: { date_ist: 'asc' },
          select: { date_ist: true, mood_value: true },
        }),
        // Raw S-07 signals (okuvu-remaining-changes.md §C.2) — persisted on
        // every assistant turn since §B.2/§C.2, but had zero consumers until
        // now. Surfaced here as a plain read-only snapshot, not a decision
        // engine — no auto-close/notification logic is implied by reading
        // them.
        db.turn.findMany({
          where: { user_id: input.clientId, role: 'assistant', created_at: { gte: thirtyDaysAgo } },
          orderBy: { created_at: 'desc' },
          select: { taper_state: true, closure_offered: true, frustration_event: true, therapist_referral: true, created_at: true },
        }),
      ]);

      const signals = {
        latestTaperState: recentTurns[0]?.taper_state ?? 'none',
        closureOfferedRecently: recentTurns.some((t) => t.closure_offered),
        frustrationEventCount: recentTurns.filter((t) => t.frustration_event).length,
        therapistReferralRecently: recentTurns.some((t) => t.therapist_referral),
      };

      const homeworkProgress = summaries
        .map((s) => ({ date: s.created_at.toISOString(), progress: parseSummaryText(s.summary_text).homework_progress ?? null }))
        .filter((entry) => entry.progress !== null);

      const counts = { active: 0, completed: 0 };
      for (const row of homeworkCounts) {
        if (row.status === 'active') counts.active = row._count;
        if (row.status === 'completed') counts.completed = row._count;
      }

      return {
        granted: true as const,
        homeworkProgress,
        homeworkCounts: counts,
        homeworkTrack: userMemory?.homework_track ?? [],
        moodTrend: moodLogs.map((m) => ({ date: m.date_ist.toISOString(), moodValue: m.mood_value })),
        signals,
      };
    }),
});
