/**
 * J2 fallback — a curated, static pool used whenever there's no themed
 * data to personalize from (new users) or the LLM call fails. Same
 * deterministic day-rotation shape as lib/quote-of-day.ts's placeholder
 * list, so the same prompt doesn't change every reload within a day.
 */
const FALLBACK_PROMPTS: string[] = [
  "What's one thing that stood out to you today, good or bad?",
  'Write about a moment today when you felt most like yourself.',
  "What's something you're carrying right now that you haven't said out loud?",
  'Describe how your body feels right now, without judging it.',
  "What's one small thing that helped, even a little, this week?",
  'If today had a color, what would it be — and why?',
  "What's something you needed to hear today?",
  'Write a few lines to your future self about how today went.',
];

export function getFallbackJournalPrompt(now: Date = new Date()): string {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - startOfYear) / 86_400_000,
  );
  return FALLBACK_PROMPTS[dayOfYear % FALLBACK_PROMPTS.length];
}
