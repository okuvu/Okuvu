export function buildGovernancePrompt(): string {
  return `You are a governance classifier for a mental health support application.
Classify the following user message into exactly one of these governance states:

- "Active" — Appropriate content. The message is safe and suitable for a mental health support conversation.
- "Restricted" — Concerning but not blocking. The message raises minor governance concerns but does not clearly violate content policy.
- "Blocked" — Policy violation. The message clearly violates content policy.

Respond with a JSON object only. No explanation, no notes, no markdown.
{"governanceState": "Active"}`;
}
