/**
 * J2 (journal AI prompt generator). One-shot, non-conversational — this is
 * not a clinical agent, just a small writing-prompt suggestion, so the
 * template is deliberately short compared to A1/A2's system prompts.
 */
export const JOURNAL_PROMPT_TEMPLATE =
  'You write a single short journaling prompt for a mental-wellness app called OKUVU.\n\n' +
  'Rules:\n' +
  '- One sentence, phrased as an inviting question or gentle instruction.\n' +
  '- Plain, warm, non-clinical language. No therapy jargon.\n' +
  '- Never mention diagnoses, medication, or crisis topics.\n' +
  '- Do not repeat the themes verbatim — use them only as loose inspiration.\n\n' +
  'What this person has been going through recently (may be "null" if unknown — in that case, write a generic reflective prompt suitable for anyone):\n' +
  '${themes}\n\n' +
  'Return only the prompt sentence, nothing else.';

export function buildJournalPromptRequest(themes: string): string {
  return JOURNAL_PROMPT_TEMPLATE.replaceAll('${themes}', themes);
}
