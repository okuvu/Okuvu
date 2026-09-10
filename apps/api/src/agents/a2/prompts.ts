import { A2_PROMPT, A2_ONBOARDING_PROMPT } from '../../prompts/index.js';
import type { CarePlan } from './types.js';

export function buildConversationalPrompt(params: {
  safetyState: string;
  sessionHistorySummary: string | null;
  perceivedIntensity: number | null;
  userMemoryContext?: string | null;
  retrievedContext?: string | null;
  therapistName?: string | null;
  carePlanFocus?: string | null;
  homework?: string | null;
  toolkit?: string[];
  languageMode?: 'english' | 'mirror';
}): string {
  const {
    safetyState,
    sessionHistorySummary,
    perceivedIntensity,
    userMemoryContext,
    retrievedContext,
    therapistName,
    carePlanFocus,
    homework,
    toolkit,
    languageMode,
  } = params;

  // All OKUVU v2.0 context vars degrade gracefully to a safe default when
  // not yet wired up by a caller (therapist-portal integration, homework
  // schema, and the tool-id registry are separate, not-yet-built
  // workstreams — see docs/okuvu-v2.0/02-master-handoff.md §4).
  return A2_PROMPT
    .replaceAll('${safety_state}', safetyState)
    .replaceAll('${session_history_summary}', sessionHistorySummary ?? 'null')
    .replaceAll('${perceived_intensity}', perceivedIntensity?.toString() ?? 'null')
    .replaceAll('${user_memory}', userMemoryContext ?? 'null')
    .replaceAll('${retrieved_context}', retrievedContext ?? 'null')
    .replaceAll('${therapist_name}', therapistName ?? 'null')
    .replaceAll('${care_plan_focus}', carePlanFocus ?? 'null')
    .replaceAll('${homework}', homework ?? 'null')
    .replaceAll('${toolkit}', toolkit && toolkit.length > 0 ? toolkit.join(', ') : 'none selected — use the always-available tools')
    .replaceAll('${language_mode}', languageMode ?? 'english');
}

export const ONBOARDING_SCORING_PROMPT = A2_ONBOARDING_PROMPT;
