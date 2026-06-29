import { prisma } from './prisma.js';
import type { AgentContextBundle } from '@evia/shared-types';

export async function getAgentContextBundle(firebaseUid: string): Promise<AgentContextBundle> {
  const user = await prisma.user.findUnique({
    where: { firebase_uid: firebaseUid },
    include: {
      safety_state: true,
      clinical_config: true,
      engagement_profile: {
        select: {
          current_streak: true,
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
            select: { summary_text: true },
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
      engagement: { streak: 0, voice_enabled: false },
    };
  }

  return {
    safety_state: user.safety_state?.safety_state_current ?? null,
    care_plan: user.clinical_config
      ? {
          care_plan_id: user.clinical_config.care_plan_id,
          assignment_state: user.clinical_config.assignment_state,
        }
      : null,
    recent_history: user.session_logs.map((log) => ({
      session_id: log.id,
      session_started_at: log.session_started_at.toISOString(),
      turn_count: log.turn_count,
      session_feedback_score: log.session_feedback_score,
      summary: log.summaries[0]?.summary_text ?? null,
    })),
    session_summary: user.session_summaries[0]?.summary_text ?? null,
    engagement: {
      streak: user.engagement_profile?.current_streak ?? 0,
      voice_enabled: user.engagement_profile?.voice_mode_enabled ?? false,
    },
  };
}
