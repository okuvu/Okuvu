/**
 * The deeper risk screen for the worksheets the clinical owner named.
 *
 * The shared check (`lib/safety-check.ts`) is the same one the journal uses and
 * covers crisis language, third-party risk and the classifier. That is not enough
 * for the worksheets about eating, the body, sleep, comparison and scrolling, and
 * the owner said so explicitly (24 Nov 2026): for the Comparison check, Sleep
 * diary, Meet the inner critic, Unsent letter and Doomscroll log, the check must
 * ALSO watch for
 *
 *   skipping meals · restricting food · making yourself sick ·
 *   exercising to punish yourself · hating your body · not sleeping for days ·
 *   wanting to sleep and not wake up · wanting to hurt someone · self-harm
 *
 * This module is that floor. It is deterministic, needs no model, and — like
 * `crisis-keywords.ts` — can only ever RAISE the protective response, never lower
 * it. A hit here produces the same client-facing response as a flagged journal
 * entry: the help card with the helplines and the client's own safety plan, and a
 * content-free alert to the therapist through `lib/safety-flags.ts`.
 *
 * It is scoped to a row (`ToolRegistryEntry.sensitive_check`) rather than to a
 * hardcoded list of ids, so the five worksheets the owner named get it by being
 * marked, and a worksheet that does not need it does not start matching "I
 * skipped lunch" in a stress worksheet and firing an alert.
 *
 * Levels, and why they are two different ones:
 *
 *   S4 — self-harm and wanting not to wake up. These are disclosures about the
 *        person's own safety, which is what the crisis card is written for.
 *   S3 — everything else. Flagged, so the client gets the help card and the
 *        therapist gets the alert, but NOT the second-person crisis card: telling
 *        someone who is afraid of hurting somebody else to call a helpline about
 *        themselves is the wrong instruction, and an eating-disorder signal is
 *        not the same emergency as an imminent attempt.
 *
 * Every pattern is deliberately narrow. A false positive here interrupts a client
 * mid-worksheet and sends their therapist an alert; "I skipped breakfast because I
 * was late" must not do that, so the meal patterns need the plural or the
 * possessives that carry the pattern, not the bare verb.
 */

export type ExtraRiskConcern =
  | 'skipping_meals'
  | 'restricting_food'
  | 'making_yourself_sick'
  | 'exercise_as_punishment'
  | 'hating_your_body'
  | 'not_sleeping_for_days'
  | 'wanting_not_to_wake'
  | 'wanting_to_hurt_someone'
  | 'self_harm';

export interface ExtraRiskMatch {
  concern: ExtraRiskConcern;
  /** S3 flags and helps; S4 is the crisis card. */
  level: 'S3' | 'S4';
}

interface Rule {
  concern: ExtraRiskConcern;
  level: 'S3' | 'S4';
  re: RegExp;
}

const RULES: Rule[] = [
  {
    concern: 'skipping_meals',
    level: 'S3',
    // "skipping meals", or a named meal with a pattern around it. A single "I
    // skipped breakfast because I was late" is a busy morning, not a signal, and
    // flagging it would interrupt a client mid-worksheet and alert their
    // therapist for nothing — so the named-meal form needs the repetition.
    re: /\b(?:(?:skip|skips|skipped|skipping|miss|misses|missed|missing)\s+(?:meals?|food)\b|(?:keep|keeps|kept|been|always|usually|often)\s+(?:skipping|missing)\s+(?:breakfast|lunch|dinner)\b|(?:skip|skips|skipped|skipping|miss|missed|missing)\s+(?:breakfast|lunch|dinner)\b[^.!?\n]{0,40}\b(?:most|every|again|lately|these days|a lot|often|all week|all the time|recently)\b)/,
  },
  {
    concern: 'restricting_food',
    level: 'S3',
    re: /\b(?:restrict(?:ing|ed)?|starving myself|starve myself|not eating|barely eat(?:ing)?|stopped eating|cut(?:ting)? (?:back|down) (?:on )?(?:my )?(?:food|eating|meals)|eat(?:ing)? (?:as little as|almost nothing)|purg(?:e|ing)|counting (?:my )?calories|fewer than \d+ (?:calories|meals))\b/,
  },
  {
    concern: 'making_yourself_sick',
    level: 'S3',
    re: /\b(?:make|made|making) myself (?:sick|throw up|vomit)\b|\bmade myself vomit\b|\bthrow(?:ing)? up after (?:eating|meals)\b|\bmake myself (?:sick|purge) after\b/,
  },
  {
    concern: 'exercise_as_punishment',
    level: 'S3',
    // Needs the punishing or earning framing near the movement word, so
    // "I went for a run to clear my head" never matches.
    re: /\b(?:exercis(?:e|ing)|work(?:ing)? out|run(?:ning)?|walk(?:ing)?|gym)\b[^.!?\n]{0,60}\b(?:punish(?:ing|ment)?|earn(?:ing)? (?:my|the) (?:food|meal)|burn(?:ing)? (?:it|them|off|it off)|make up for (?:eating|the food|what i ate))\b/,
  },
  {
    concern: 'hating_your_body',
    level: 'S3',
    re: /\b(?:hate|hating|hated|disgusted by|ashamed of|can['’]?t stand|can not stand) (?:my|this) body\b|\bmy body (?:is|feels|looks) (?:disgusting|gross|wrong|ugly|repulsive)\b|\bhate (?:how i look|my (?:weight|shape|stomach|body))\b/,
  },
  {
    concern: 'not_sleeping_for_days',
    level: 'S3',
    re: /\b(?:haven['’]?t|have not|hasn['’]?t|has not|didn['’]?t|did not) slept (?:in|for) (?:\d+|two|three|four|five|several|a few) (?:days|nights|weeks)\b|\bnot (?:slept|sleeping) (?:for |in )?(?:\d+|two|three|four|five|several|a few) (?:days|nights)\b|\b(?:awake|up) (?:for|all of) (?:\d+|two|three|four) (?:days|nights)\b|\bno sleep (?:for|in) (?:\d+|two|three) (?:days|nights)\b/,
  },
  {
    concern: 'wanting_not_to_wake',
    level: 'S4',
    // The shared floor already catches "don't want to wake up". This covers the
    // sleep framing the owner wrote down, which it did not: going to sleep and
    // not waking.
    re: /\b(?:want|wish|hope|would like) to (?:go to sleep|sleep|fall asleep) and (?:never |not )?(?:wake up|waking up)\b|\bsleep and never wake up\b|\bnot wake up (?:again|tomorrow|in the morning)\b/,
  },
  {
    concern: 'wanting_to_hurt_someone',
    level: 'S3',
    re: /\b(?:want|wanting|wanted|urge|urges|feel like|felt like|tempted) to (?:hurt|harm|kill|attack|stab|strangle|choke|hit|beat) (?:him|her|them|someone|somebody|people|everyone|my \w+)\b|\bthoughts? (?:of|about) (?:hurting|harming|killing|attacking) (?:him|her|them|someone|somebody|people)\b/,
  },
  {
    concern: 'self_harm',
    level: 'S4',
    // Explicit self-harm wording. The actions themselves ("cut myself", "hurt
    // myself") are already the shared S4 floor, so this only has to catch the
    // name, including the way a client writes it about themselves.
    re: /\bself[- ]?harm(?:ing|ed|s)?\b|\bhurt(?:ing)? myself on purpose\b|\bcut(?:ting)? myself\b/,
  },
];

/** The concerns this screen watches for, in the owner's order. */
export const EXTRA_RISK_CONCERNS: ExtraRiskConcern[] = RULES.map((rule) => rule.concern);

/**
 * The first concern this text matches, or null.
 *
 * Ordering matters where two rules could match the same sentence: the first rule
 * in the list decides the level, and S4 comes with the crisis card, so the
 * self-harm rule is last only because the others are narrower. A caller that
 * wants the strongest answer should prefer `level === 'S4'` — `findExtraRisk`
 * returns the first match, and `worstExtraRisk` returns the most protective.
 */
export function findExtraRisk(text: string): ExtraRiskMatch | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  const lower = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.re.test(lower)) return { concern: rule.concern, level: rule.level };
  }
  return null;
}

/** Every concern the text matches. Used by tests and by the log line. */
export function allExtraRisks(text: string): ExtraRiskMatch[] {
  if (typeof text !== 'string' || text.trim().length === 0) return [];
  const lower = text.toLowerCase();
  return RULES.filter((rule) => rule.re.test(lower)).map((rule) => ({
    concern: rule.concern,
    level: rule.level,
  }));
}

/**
 * The most protective match: an S4 anywhere wins over an S3.
 *
 * "I've been skipping meals and I cut myself again" is one answer carrying two
 * signals, and serving the S3 card for it because the eating rule is first in the
 * list would be the wrong way round.
 */
export function worstExtraRisk(text: string): ExtraRiskMatch | null {
  const matches = allExtraRisks(text);
  if (matches.length === 0) return null;
  return matches.find((m) => m.level === 'S4') ?? matches[0];
}
