import type { CarePlanId } from '@okuvu/shared-types';

/**
 * okuvu-remaining-changes.md O6 — quote-of-day content source was never
 * decided ("needs an owner"). These are placeholder, non-clinical,
 * generically supportive one-liners so the toggle/API/UI can ship end-to-
 * end now — swap this list for a real source whenever one is decided.
 * Deliberately plain: no therapeutic claims, no S3/S4-adjacent language.
 */
const PLACEHOLDER_QUOTES: Record<CarePlanId, string[]> = {
  CP1: [
    "You don't have to solve everything today — just the next small thing.",
    'Worry is a rehearsal for a show that may never happen.',
    "It's okay to not have it figured out yet.",
    'One steady breath is still a step forward.',
    'You are allowed to take this one hour at a time.',
  ],
  CP2: [
    'Small moves count, even the ones nobody sees.',
    "You don't have to feel motivated to take a small step.",
    'Some days are just about getting through — that counts too.',
    'Be as kind to yourself as you would be to a friend today.',
    'Rest is not the same as giving up.',
  ],
  CP3: [
    'You can put something down without dropping it forever.',
    "Not everything on today's list has to happen today.",
    'A pause is not a setback.',
    'You are more than what you get done.',
    'It is okay to ask for the day to be smaller.',
  ],
};

/**
 * Deterministic "quote of the day" — same quote all day for a given care
 * plan, changes daily. Not per-user random; care-plan-aware only, per the
 * original spec (docs/okuvu-v2.0/01-parity-audit-v1.md:87).
 */
export function getQuoteOfDay(carePlanId: CarePlanId, now: Date = new Date()): string {
  const quotes = PLACEHOLDER_QUOTES[carePlanId];
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - startOfYear) / 86_400_000);
  return quotes[dayOfYear % quotes.length];
}
