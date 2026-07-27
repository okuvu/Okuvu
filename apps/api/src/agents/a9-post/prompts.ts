export function buildA9PostPrompt(
  userContent: string,
  safetyState: string,
  carePlan: string,
): string {
  return `You are a clinical content governance reviewer for a mental health support app.

Review the following AI-generated response intended for a user on care plan ${carePlan}
with current safety state ${safetyState}.

RESPONSE TO REVIEW:
"${userContent}"

Check for ANY of the following prohibited outputs:
1. Clinical diagnostic language (anxiety disorder, depression, PTSD, etc.)
2. Direct advice ("you should", "you need to", "try to", "have you considered")
3. Outcome promises ("this will help", "you'll feel better", "this always works")
4. Cognitive reframes ("maybe another way to look at this", "what if you tried seeing it as")
5. Causal attribution ("your stress is caused by", "the reason you feel this way is")
6. Prescription or medication references
7. Content inappropriate for the current safety state

Respond ONLY in valid JSON. No other text.

{
  "decision": "APPROVED" or "BLOCKED",
  "violation_type": null or brief description of the violation,
  "confidence": "high", "medium", or "low"
}`;
}
