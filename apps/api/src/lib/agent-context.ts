import { prisma } from './prisma.js';
import type { AgentContextBundle } from '@evia/shared-types';

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
        take: 1,
        orderBy: { created_at: 'desc' },
        select: { summary_text: true },
      },
    },
  });

  if (!user) {
    return {
      safety_state: null,
      care_plan: null,
      recent_history: [],
      session_summary: null,
      engagement: { current_streak: 0, longest_streak: 0, voice_mode_enabled: false },
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

  return {
    safety_state: user.safety_state?.safety_state_current ?? null,
    care_plan: user.clinical_config
      ? {
          care_plan_id: user.clinical_config.care_plan_id,
          assignment_state: user.clinical_config.assignment_state,
        }
      : null,
    recent_history: recentHistory,
    session_summary: user.session_summaries[0]?.summary_text ?? null,
    engagement: {
      current_streak: user.engagement_profile?.current_streak ?? 0,
      longest_streak: user.engagement_profile?.longest_streak ?? 0,
      voice_mode_enabled: user.engagement_profile?.voice_mode_enabled ?? false,
    },
  };
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
