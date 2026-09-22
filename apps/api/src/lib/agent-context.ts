import { prisma } from './prisma.js';
import { getActiveHomework } from './homework.js';
import { DEFAULT_CARE_PLAN_FOCUS } from '@okuvu/shared-types';
import type { AgentContextBundle, SessionSummaryView } from '@okuvu/shared-types';
import type { ConversationTurn } from '../agents/a1/types.js';

export function summariesToConversationTurns(summaries: SessionSummaryView[]): ConversationTurn[] {
  return summaries.map((s) => ({
    role: 'assistant' as const,
    content: s.summary
      ? `[Previous session (${s.session_started_at}): ${s.summary}]`
      : `[Previous session (${s.session_started_at}): No summary available]`
  }));
}

const FALLBACK_TURN_LIMIT = 20;

export async function getAgentContextBundle(firebaseUid: string): Promise<AgentContextBundle> {
  const user = await prisma.user.findUnique({
    where: { firebase_uid: firebaseUid },
    include: {
      safety_state: true,
      clinical_config: true,
      engagement_profile: {
        select: {
          current_streak: true,
          longest_streak: true,
          voice_mode_enabled: true,
          consent_1: true,
          consent_2: true,
          consent_3: true,
          consent_4: true,
        },
      },
      session_logs: {
        take: 6,
        orderBy: { session_started_at: 'desc' },
        include: {
          summaries: {
            take: 1,
            orderBy: { created_at: 'desc' },
            select: { summary_text: true, status: true },
          },
        },
      },
      session_summaries: {
        where: { status: 'COMPLETED', summary_text: { not: null } },
        take: 3,
        orderBy: { created_at: 'desc' },
        select: { summary_text: true, created_at: true },
      },
      user_memory: true,
      assigned_therapists: {
        take: 1,
        orderBy: { created_at: 'desc' },
        select: { therapist: { select: { name: true } } },
      },
    },
  });

  if (!user) {
    return {
      safety_state: null,
      care_plan: null,
      recent_history: [],
      session_summary: null,
      engagement: { current_streak: 0, longest_streak: 0, voice_mode_enabled: false, consent_1: true, consent_2: false, consent_3: false, consent_4: false },
      user_memory: null,
      language_mode: 'english',
      therapist_name: null,
      care_plan_focus: null,
      homework: null,
    };
  }

  const recentHistory = user.session_logs.map((log) => ({
    session_id: log.id,
    session_started_at: log.session_started_at.toISOString(),
    turn_count: log.turn_count,
    session_feedback_score: log.session_feedback_score,
    summary: log.summaries[0]?.summary_text ?? null,
  }));

  // E7-S04: fallback to raw turns if the most recent closed session
  // has no complete summary yet (timing gap before worker finishes).
  const mostRecentClosed = user.session_logs.find(
    (l) => l.session_ended_at !== null,
  );
  if (mostRecentClosed) {
    try {
      const summaryRow = mostRecentClosed.summaries[0];
      if (!summaryRow || summaryRow.status !== 'COMPLETED') {
        const turns = await fetchFallbackTurns(mostRecentClosed.id);
        if (turns) {
          const entry = recentHistory.find((h) => h.session_id === mostRecentClosed.id);
          if (entry) entry.summary = turns;
          console.log('[E7-S04] Fallback: raw turns used for session', mostRecentClosed.id, '(' + (summaryRow?.status ?? 'missing') + ')');
        }
      }
    } catch (err) {
      console.warn('[E7-S04] Fallback fetch failed, proceeding without fallback context:', err);
    }
  }

  const activeHomework = await getActiveHomework(user.id);

  const userMemoryRecord = user.user_memory
    ? {
        life_context: user.user_memory.life_context,
        current_stressors: user.user_memory.current_stressors,
        recurring_themes: user.user_memory.recurring_themes,
        what_helps: user.user_memory.what_helps,
        what_doesnt_help: user.user_memory.what_doesnt_help,
        significant_events: user.user_memory.significant_events,
        emotional_baseline: user.user_memory.emotional_baseline,
        session_count: user.user_memory.session_count,
      }
    : null;

  return {
    safety_state: user.safety_state?.safety_state_current ?? null,
    care_plan: user.clinical_config
      ? {
          id: user.clinical_config.id,
          care_plan_id: user.clinical_config.care_plan_id,
          assignment_state: user.clinical_config.assignment_state,
        }
      : null,
    recent_history: recentHistory,
    session_summary: formatRollingSummary(user.session_summaries),
    engagement: {
      current_streak: user.engagement_profile?.current_streak ?? 0,
      longest_streak: user.engagement_profile?.longest_streak ?? 0,
      voice_mode_enabled: user.engagement_profile?.voice_mode_enabled ?? false,
      consent_1: user.engagement_profile?.consent_1 ?? true,
      consent_2: user.engagement_profile?.consent_2 ?? false,
      consent_3: user.engagement_profile?.consent_3 ?? false,
      consent_4: user.engagement_profile?.consent_4 ?? false,
    },
    user_memory: userMemoryRecord,
    language_mode: user.language_mode,
    therapist_name: user.assigned_therapists[0]?.therapist.name ?? null,
    care_plan_focus:
      user.clinical_config?.care_plan_focus ??
      (user.clinical_config ? DEFAULT_CARE_PLAN_FOCUS[user.clinical_config.care_plan_id] : null),
    homework: activeHomework?.description ?? null,
  };
}

function formatRollingSummary(
  summaries: Array<{ summary_text: string | null; created_at: Date }>,
): string | null {
  if (summaries.length === 0) return null;

  const chronological = [...summaries].reverse();

  return chronological
    .map((s) => {
      const daysAgo = Math.floor(
        (Date.now() - s.created_at.getTime()) / (1000 * 60 * 60 * 24),
      );
      const timeLabel =
        daysAgo === 0
          ? 'Earlier today'
          : daysAgo === 1
            ? 'Yesterday'
            : `${daysAgo} days ago`;
      return `[${timeLabel}]: ${s.summary_text}`;
    })
    .join('\n\n');
}

async function fetchFallbackTurns(sessionId: string): Promise<string | null> {
  const turns = await prisma.turn.findMany({
    where: { session_id: sessionId },
    orderBy: { turn_number: 'desc' },
    take: FALLBACK_TURN_LIMIT,
    select: { role: true, content: true, turn_number: true },
  });

  if (turns.length === 0) return null;

  turns.reverse();
  return turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n');
}
