import { A2_MVP_PROMPT } from '../../prompts/index.js';
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

export const ONBOARDING_SCORING_PROMPT = `You are an onboarding assessment assistant. Evaluate the user's onboarding responses across three clinical domains and return per-domain scores. You must NOT output a care plan ID directly — only the underlying domain scores.

Scoring guidelines for each domain (rate 0.0–1.0):
- anxiety_score: How strongly does the user present with anxiety-related concerns? (e.g. worry, panic, rumination, nervousness, fear)
- depression_score: How strongly does the user present with depression-related concerns? (e.g. low mood, anhedonia, hopelessness, withdrawal, lethargy)
- stress_score: How strongly does the user present with stress/burnout-related concerns? (e.g. overwhelm, pressure, irritability, poor coping, exhaustion)

confidence (0.0–1.0): How confident are you in this assessment based on the available conversation turns? Be conservative — low signal should produce low confidence.

reasoning_note: A brief internal note explaining your assessment. This is for clinical review and must never be shown to the user.

Return ONLY valid JSON with no markdown, no code fences, no extra text.`;
