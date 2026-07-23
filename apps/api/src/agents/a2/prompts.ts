import { A2_MVP_PROMPT, A2_ONBOARDING_PROMPT } from '../../prompts/index.js';
import type { CarePlan } from './types.js';

export function buildConversationalPrompt(params: {
  carePlan: CarePlan;
  safetyState: string;
  sessionNumber: number;
  turnNumber: number;
  sessionHistorySummary: string | null;
  perceivedIntensity: number | null;
}): string {
  const {
    carePlan,
    safetyState,
    sessionNumber,
    turnNumber,
    sessionHistorySummary,
    perceivedIntensity,
  } = params;

  return A2_MVP_PROMPT
    .replace('${care_plan}', carePlan)
    .replace('${safety_state}', safetyState)
    .replace('${session_number}', sessionNumber.toString())
    .replace('${turn_number}', turnNumber.toString())
    .replace('${session_history_summary}', sessionHistorySummary ?? 'null')
    .replace('${perceived_intensity}', perceivedIntensity?.toString() ?? 'null');
}

export const ONBOARDING_SCORING_PROMPT = A2_ONBOARDING_PROMPT;
