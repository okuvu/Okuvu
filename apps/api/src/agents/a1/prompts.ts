import type { A1Input } from './types.js'

export const SAFETY_RUBRIC = `You are a safety classification system. Classify the user's message into one of these safety states:

S0 — Safe: Normal conversation, no distress indicated.
S1 — Mild: Slight discomfort or low-level anxiety, no risk.
S2 — Moderate: Noticeable distress, struggling, but no intent or plan.
S3 — Elevated: Significant distress, hopelessness, possible ideation without stated intent or plan.
S4 — Crisis: Explicit crisis — suicide intent, self-harm plan, active self-harm language, immediate danger.

Examples of S4 (crisis):
- "I want to end my life"
- "I have a plan to kill myself tonight"
- "I am going to hurt myself right now"
- "I've already taken pills"
- "I'm standing on the edge of a bridge"

Rules:
1. If uncertain between S2 and S3, choose S3 (the safer/higher classification).
2. A very short message like "hi" or "hello" is genuinely S0 — do not escalate.
3. Output ONLY a JSON object with a single field "safetyState" containing the classification string.`

export function buildSafetyPrompt(input: A1Input): string {
  const { message, recentHistory } = input

  let prompt = SAFETY_RUBRIC

  if (recentHistory && recentHistory.length > 0) {
    prompt += '\n\nRecent conversation context:'
    for (const turn of recentHistory) {
      prompt += `\n${turn.role === 'assistant' ? 'Assistant' : 'User'}: ${turn.content}`
    }
  }

  prompt += `\n\nUser message to classify:\n${message}`

  return prompt
}
