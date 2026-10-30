/**
 * E17-S9 — deterministic, zero-cost medical-emergency screen.
 *
 * Why a second screen next to `crisis-keywords.ts`: measured on the api task's
 * own environment (E17-S5-orch-correction.md), A1 classified four of the five
 * gold-set medical emergencies S1/S2 — ordinary chat — and A2 answered them
 * with the mental-health crisis line ("the crisis support in the app has people
 * who can actually help right now"). The fifth escalated to S4 through the
 * crisis keyword pattern and landed on the same mental-health crisis card. A
 * person describing a heart attack, an unconscious relative or heavy bleeding in
 * pregnancy was therefore never told to call 112.
 *
 * A prompt branch alone cannot fix that. A2's reply is model output: it can be
 * throttled, timed out, or replaced by A9-post, and "112 in the first sentence"
 * is a property of the text the user receives, not of a hope about the model.
 * This screen is the floor underneath it, in the same tier as the crisis
 * keyword floor: when it matches, the pipeline serves a deterministic,
 * approved emergency-medical reply and no model writes a word.
 *
 * It is deliberately NOT a classifier and must never be treated as one. It
 * matches presentations that are *specific enough to be worth an ambulance* —
 * either a single unambiguous phrase ("unconscious", "bleeding won't stop") or
 * a combination that is not how Indian users describe anxiety ("chest pain"
 * WITH a radiating/numb arm; "fever" WITH confusion or an inability to keep
 * water down; "heavy bleeding" WITH pregnancy or an injury). The co-occurrence
 * requirements are the whole point: chest tightness and a racing heart are how
 * a panic attack is described in this app, and answering that with "call 112"
 * is the false positive this design exists to avoid — it hands a frightened
 * person an ambulance number instead of a breathing exercise, and teaches them
 * the app cries wolf.
 *
 * No context, negation or idiom handling, same as the crisis screen: "my chest
 * hurt last week" and "I'm not unconscious" can match. Both would cost one
 * emergency-services instruction on a message the user is unlikely to send
 * this app, while the misses this replaces were users in an emergency being
 * asked how they were feeling.
 *
 * The self-harm guard is the safety-critical part. `hasSelfHarmLanguage` runs
 * FIRST in `hasMedicalEmergencyLanguage`, so this screen can never take a
 * self-harm disclosure off the crisis path: a message carrying crisis or
 * self-harm wording is not a medical-emergency match at all, whatever else it
 * says about blood or pills. Adding phrases to that guard only ever makes the
 * medical floor more conservative; crisis detection is untouched by it.
 */
import { hasCrisisLanguage } from './crisis-keywords.js';

// ─── Presentations ─────────────────────────────────────────────────────────
//
// Each entry is (a) a check that can stand alone, or (b) a documented
// co-occurrence. Grouped by what the user is describing, because the evidence
// file has to explain a miss or a false positive in those terms.

/** Cardiac-sounding chest pain — the pain itself, not yet its qualifier. */
const CHEST_PAIN =
  /\b(chest (?:pain|pressure|tightness|tight|hurts?|is hurting|is tight)|pain in (?:my|his|her|their|the) chest|crushing (?:chest )?pain|elephant on (?:my|his|her|their) chest)\b/;

/**
 * What turns chest pain into an ischaemic picture: pain that radiates, or a
 * numb/tingling limb or jaw. Deliberately excludes "can't breathe", sweating,
 * dizziness and a racing heart — those are the panic-attack description, and
 * matching them here would fire on this product's most common distress message.
 */
const CHEST_PAIN_RADIATION =
  /\b(left arm|(?:numb(?:ness)?|tingling|pins and needles) (?:in|down|all the way down) (?:my|his|her|their) (?:left )?(?:arm|hand)|jaw|shoulder|shoulder ?blades?|radiat\w*|down (?:my|his|her|their) (?:left )?arm|between (?:my|his|her|their) shoulder ?blades)\b/;

/** Reduced consciousness, or a person who cannot be roused. */
const REDUCED_CONSCIOUSNESS =
  /\b(unconscious|unresponsive|not responding|won'?t wake (?:up)?|can'?t wake (?:him|her|them|up)|not waking up|no pulse)\b/;

/** Effort of breathing has stopped or is obstructed. */
const BREATHING_FAILURE =
  /\b(not breathing|stopped breathing|isn'?t breathing|choking|turning blue|blue in the face)\b/;

/** Bleeding that the user has already failed to stop. */
const UNCONTROLLED_BLEEDING =
  /\b(bleeding (?:won'?t|will not|doesn'?t|does not|isn'?t) stop|won'?t stop bleeding|can'?t stop the bleeding|blood (?:is )?(?:pouring|spurting)|soaking through|soaked (?:in|through) blood)\b/;

/** Heavy bleeding — only an emergency with a context word (see below). */
const HEAVY_BLEEDING =
  /\b(bleeding (?:a lot|heavily|badly|really heavily)|heavy bleeding|blood everywhere|lots of blood)\b/;

/**
 * The contexts that make heavy bleeding an emergency rather than a period.
 * Pregnancy, recent birth, and trauma are the three that do; a message that
 * only says "I'm bleeding heavily" during a period matches none of them and
 * stays with A2 — that is the false positive this list exists to prevent.
 */
const BLEEDING_CONTEXT =
  /\b(pregnan\w*|miscarr\w*|gave birth|giving birth|postpartum|after (?:the )?delivery|cut|wound|injury|injured|glass|knife|blade|fell (?:down|off|from)|accident|hit by|soaking|clots?)\b/;

/** Fever, with a sign that makes it more than a fever. */
const FEVER = /\b(fever|temperature (?:of|is)|running a temperature)\b/;

/**
 * Signs that turn a fever into an emergency: altered mental state, dehydration
 * the user cannot keep up with, meningism, or a seizure. A fever alone —
 * including 104 — does not match; a fever *with* confusion does.
 */
const FEVER_DANGER_SIGN =
  /\b(confus\w*|not making sense|delirious|hallucinat\w*|can'?t keep (?:water|fluids?|liquids?|anything) down|stiff neck|rash|seizure|unconscious|unresponsive|not responding|won'?t wake)\b/;

/** Stroke-pattern neurological signs. */
const STROKE_SIGNS =
  /\b(face (?:is )?droop\w*|drooping face|slurred speech|speech is slurred|can'?t (?:move|feel|lift) (?:my|his|her|their) (?:left |right )?(?:arm|leg|side|face)|one side (?:of (?:my|his|her|their) (?:body|face) )?(?:is )?(?:weak|numb|drooping)|having a stroke|signs? of a stroke)\b/;

/** Active seizure. */
const SEIZURE = /\b(having a seizure|keeps? having seizures?|seizure (?:right )?now|convulsing|convulsions|status epilepticus)\b/;

/** Something swallowed that should not have been — including another person. */
const INGESTION =
  /\b((?:swallowed|drank|took|ate) (?:a |the )?(?:whole |full )?(?:bottle|pack|strip|handful|box|blister) of|poison\w*|bleach|phenyl|pesticide|rat poison|kerosene)\b/;

/** Injuries and exposures where the ambulance is the answer in themselves. */
const MAJOR_TRAUMA =
  /\b(snake ?bite|bitten by a snake|snake bit (?:me|my|him|her|them)|electric shock|electrocuted|drowning|drowned|stabbed|road accident|hit by a (?:car|bike|truck|bus|two-wheeler)|head injury|fell from (?:a|the) (?:height|terrace|roof|balcony|building))\b/;

/** Airway swelling — anaphylaxis. */
const AIRWAY_SWELLING =
  /\b(throat (?:is )?(?:closing|swelling|closing up)|can'?t swallow|anaphyla\w*|severe allergic reaction|swelling (?:of|in) (?:my|his|her|their) (?:face|throat|tongue))\b/;

/**
 * Self-harm wording that must keep the crisis path (E17-S9's hard boundary).
 *
 * A superset of the S4 screen in `crisis-keywords.ts` — that list stays the
 * authority for crisis detection and is not duplicated here, it is extended
 * with the explicit forms a medical sentence is most likely to be hiding
 * ("I cut myself", "I took too many pills"), so that a message which is both a
 * physical emergency and a disclosure is still handled as a disclosure.
 */
const SELF_HARM_EXTENSION =
  /\b(self[- ]?harm\w*|harm(?:ing)? myself|hurt(?:ing)? myself|cut(?:ting)? myself|cut my wrists?|slit(?:ting)? my|overdos\w*|took (?:too many|a handful of) (?:pills|tablets)|kill(?:ing)? myself|suicid\w*|end(?:ing)? my life|want to die|don'?t want to live|better off (?:dead|without me)|khud ko khatam|marna chahta|jeena nahi)\b/;

export function hasSelfHarmLanguage(message: string): boolean {
  const lower = message.toLowerCase();
  return hasCrisisLanguage(message) || SELF_HARM_EXTENSION.test(lower);
}

export function hasMedicalEmergencyLanguage(message: string): boolean {
  // The guard runs first, and it is not a fallback: a self-harm disclosure is
  // routed to the crisis card by design, and the crisis card already names
  // Emergency Services 112 among its numbers.
  if (hasSelfHarmLanguage(message)) return false;

  const lower = message.toLowerCase();

  if (CHEST_PAIN.test(lower) && CHEST_PAIN_RADIATION.test(lower)) return true;
  if (REDUCED_CONSCIOUSNESS.test(lower)) return true;
  if (BREATHING_FAILURE.test(lower)) return true;
  if (UNCONTROLLED_BLEEDING.test(lower)) return true;
  if (HEAVY_BLEEDING.test(lower) && BLEEDING_CONTEXT.test(lower)) return true;
  if (FEVER.test(lower) && FEVER_DANGER_SIGN.test(lower)) return true;
  if (STROKE_SIGNS.test(lower)) return true;
  if (SEIZURE.test(lower)) return true;
  if (INGESTION.test(lower)) return true;
  if (MAJOR_TRAUMA.test(lower)) return true;
  if (AIRWAY_SWELLING.test(lower)) return true;

  return false;
}
