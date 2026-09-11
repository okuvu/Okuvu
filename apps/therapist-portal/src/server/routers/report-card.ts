import { z } from 'zod';
import {
  assertClientAssigned,
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

export const reportCardRouter = router({
  // "Session Prep": a digest of recent chat-thread summaries, so a
  // therapist can review what happened since the last session before one
  // starts. Sourced from Worker 05's SessionSummary output.
  sessionPrep: therapistProcedure
    .input(z.object({ clientId: z.string().min(1), days: z.number().int().positive().max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      if (isBypassEnabled()) {
        return { entries: [] };
      }

      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);
      await logClinicalAccess(db, therapistId, input.clientId, 'VIEW_SESSION_PREP');

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const summaries = await db.sessionSummary.findMany({
        where: { user_id: input.clientId, status: 'COMPLETED', created_at: { gte: since } },
        orderBy: { created_at: 'desc' },
        select: { session_id: true, summary_text: true, created_at: true },
      });

      return {
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
        return { granted: true as const, homeworkProgress: [], homeworkCounts: { active: 0, completed: 0 }, homeworkTrack: [], moodTrend: [] };
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
        select: { chat_access_granted: true },
      });

      if (!assignment?.chat_access_granted) {
        return { granted: false as const };
      }

      await logClinicalAccess(db, therapistId, input.clientId, 'VIEW_REPORT_CARD');

      const [summaries, homeworkCounts, userMemory, moodLogs] = await Promise.all([
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
          where: { user_id: input.clientId, date_ist: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { date_ist: 'asc' },
          select: { date_ist: true, mood_value: true },
        }),
      ]);

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
      };
    }),
});
