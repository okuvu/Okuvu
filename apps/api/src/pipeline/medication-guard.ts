/**
 * The medication safety net.
 *
 * Owner's rule, 25 Nov 2026: "any message about starting, stopping, skipping or
 * changing medicine gets this reply, whatever the model would have said."
 *
 * ## Why this is a guard and not a prompt paragraph
 *
 * v2.9 already carried a paragraph telling the model that a medication question
 * is never a goodbye. It worked — sb-08 went from 0/3 to 5/5 runs — but it was
 * still the model's judgement on the turn: the paragraph has to be read, and
 * the reply is still generated. A safety net that depends on the thing it is
 * catching is not a net. This module decides in the pipeline, before the model
 * is called at all, so the reply cannot vary, cannot be paraphrased, and cannot
 * be skipped on a turn where the model happens to read the message as a
 * goodbye.
 *
 * ## What counts as a medication question
 *
 * Three things must be true, in this order:
 *
 *   1. **A medicine is named** — a generic word (meds, medication, medicine,
 *      tablet, pill, dose, prescription), a common antidepressant or
 *      antipsychotic by generic or brand name, or the Hinglish/Hindi words
 *      (dawai, dawa, goli, दवाई, दवा, गोली).
 *   2. **A change is described** — start, stop, skip, miss, change, reduce,
 *      increase, double, halve, quit, come off, taper, wean, adjust, switch.
 *      Taking a medicine as prescribed is not a change and is not caught.
 *   3. **A decision is being raised** — a question ("can I skip", "should I
 *      stop", "what if I halve it"), a stated intention ("I want to stop", "I'm
 *      thinking of coming off"), or a change already made and now being
 *      reported ("I stopped them on Monday", "I skipped two days").
 *
 * ## What is deliberately NOT caught
 *
 *   • **Adherence, not change** — "I took my meds today", "I remembered my
 *     tablets". No change verb, so nothing fires. Replying "that's one for your
 *     doctor" to someone reporting a good day would be a small cruelty.
 *   • **A decision the prescriber already made** — "my doctor told me to stop
 *     them", "the psychiatrist said I can reduce it". The right person has
 *     already decided; the reply this guard serves would be advice to do what
 *     they were just told to do.
 *   • **Negated intent** — "I would never stop my meds without asking", "I
 *     don't want to come off them". No decision is being raised.
 *   • **Anything already carrying a safety state.** A message that is also a
 *     crisis disclosure must serve the crisis card, so the caller passes the
 *     state and this guard refuses above S2. "I took all my pills" is an
 *     overdose, and it is caught by the medical-emergency floor long before
 *     this module is reached.
 *
 * Everything here is a pure function over the message text: no I/O, no model
 * call, no clock. The same message always gets the same answer, which is what
 * makes it testable and what makes it a net.
 */

import type { SafetyState } from '@okuvu/shared-types';

/**
 * The approved reply, verbatim (owner, 25 Nov 2026). Frozen: the tests assert
 * these exact bytes, because this string is shown to a client instead of a
 * model reply and the owner approved this wording and no other.
 */
export const MEDICATION_ROUTE_RESPONSE =
  "That's an important question, and it's one for the doctor who prescribed your medicine. Please speak to them before you start, stop or change anything, even if you're feeling better. If it helps, we can think together about what you'd like to ask them.";

/** Audit label for the mechanism, kept beside the copy it produced. */
export const MEDICATION_ROUTE_SOURCE = 'medication_route' as const;

/**
 * A medicine, by the words people actually use. Deliberately broad — a false
 * positive routes a harmless message to the prescriber, which is mildly
 * unhelpful; a false negative answers a medication question with model text,
 * which is the thing this module exists to prevent.
 *
 * Brand names are included because clients say "my Prozac", not "my SSRI".
 */
const MEDICINE_TERMS: readonly RegExp[] = [
  // Generic words.
  /\bmeds?\b/i,
  /\bmedications?\b/i,
  /\bmedicines?\b/i,
  /\bmedicines?\b/i,
  /\btablets?\b/i,
  /\bpills?\b/i,
  /\bdosage?\b/i,
  /\bdoses?\b/i,
  /\bprescriptions?\b/i,
  /\bprescribed\b/i,
  // Classes.
  /\banti-?depressants?\b/i,
  /\banti-?psychotics?\b/i,
  /\banti-?anxiety\b/i,
  /\bssris?\b/i,
  /\bsleeping\s+(?:tablets?|pills?)\b/i,
  // Generic names in common use in India.
  /\bsertraline\b/i,
  /\bfluoxetine\b/i,
  /\bescitalopram\b/i,
  /\bcitalopram\b/i,
  /\bparoxetine\b/i,
  /\bvenlafaxine\b/i,
  /\bduloxetine\b/i,
  /\bmirtazapine\b/i,
  /\bamitriptyline\b/i,
  /\bolanzapine\b/i,
  /\bquetiapine\b/i,
  /\brisperidone\b/i,
  /\baripiprazole\b/i,
  /\blithium\b/i,
  /\balprazolam\b/i,
  /\bclonazepam\b/i,
  /\blorazepam\b/i,
  /\bdiazepam\b/i,
  /\bmodafinil\b/i,
  /\bmethylphenidate\b/i,
  /\batomoxetine\b/i,
  // Brand names.
  /\bprozac\b/i,
  /\bzoloft\b/i,
  /\blexapro\b/i,
  /\bcipralex\b/i,
  /\bcelexa\b/i,
  /\beffexor\b/i,
  /\bcymbalta\b/i,
  /\bwellbutrin\b/i,
  /\bbupropion\b/i,
  /\bzyprexa\b/i,
  /\bseroquel\b/i,
  /\brisperdal\b/i,
  /\babilify\b/i,
  /\bxanax\b/i,
  /\bativan\b/i,
  /\bvalium\b/i,
  /\brivotril\b/i,
  /\balprax\b/i,
  /\bnexito\b/i,
  /\bdaxid\b/i,
  /\bqutipin\b/i,
  // Hinglish / Hindi.
  /\bdawai(?:yan|ya|e)?\b/i,
  /\bdawa(?:i)?\b/i,
  /\bgoli(?:yan)?\b/i,
  /दवाई|दवा|गोली/,
  // Loose: "my prescription" is above; "my anxiety tablets" is covered.
];

/**
 * A change to the medicine. Note "take" is absent on purpose: taking a
 * medicine is the treatment working, not a decision about it.
 */
const CHANGE_VERBS: readonly RegExp[] = [
  /\bstart(?:ed|ing)?\b/i,
  /\bstopp?(?:ed|ing)?\b/i,
  /\bskip(?:ped|ping)?\b/i,
  /\bmiss(?:ed|ing)?\b/i,
  /\bchang(?:e|ed|ing)\b/i,
  /\breduc(?:e|ed|ing)\b/i,
  /\blower(?:ed|ing)?\b/i,
  /\bincreas(?:e|ed|ing)\b/i,
  /\brais(?:e|ed|ing)\b/i,
  /\bdouble[ds]?\b/i,
  /\bhalv(?:e|ed|ing)\b/i,
  /\bquit(?:ting)?\b/i,
  /\b(?:come|coming|came)\s+off\b/i,
  /\btaper(?:ed|ing)?\b/i,
  /\bwean(?:ed|ing)?\b/i,
  /\badjust(?:ed|ing)?\b/i,
  /\bswitch(?:ed|ing)?\b/i,
  // Hinglish/Hindi "band" — stop. Requires the Hindi verb ("band kar"), so a
  // message about a music band is not caught by it.
  /\bband\s+(?:kar|karn[aei]|kiya|ki|do|dunga|dungi|sakta|sakti)\b/i,
  /\bchhod(?:na|unga|ungi|diya|do)\b/i,
  /\b(?:less|more)\b/i,
  /\b(?:off|on)\s+(?:my|the|these|those)\s+(?:meds?|medication|tablets?|pills?)\b/i,
  // Devanagari: बंद ("closed/stopped"), छोड़ ("leave off").
  /बंद|छोड़|कम\s+कर|ज़्यादा\s+कर|बढ़ा/,
];

/** A decision is being raised: a question, an intention, or a fresh report. */
const DECISION_FRAMING: readonly RegExp[] = [
  // Questions and hypotheses.
  /\?/,
  /\b(?:can|could|should|shall|may|might|would|will|do|does|did|is|are)\s+(?:i|it|they|we)\b/i,
  /\bis\s+it\s+(?:ok|okay|safe|alright|fine|bad|dangerous)\b/i,
  /\bwhat\s+(?:if|happens)\b/i,
  /\bwhat\s+should\s+i\b/i,
  // Stated intention.
  /\bi\s+(?:want|wanna|need|plan|intend|am\s+planning|'m\s+planning|am\s+thinking|'m\s+thinking|am\s+considering|'m\s+considering|am\s+going|'m\s+going|have\s+decided|'ve\s+decided)\b/i,
  /\bi\s+(?:should|must|have\s+to|need\s+to|ought\s+to|gotta|think\s+i\s+should|think\s+i\s+need\s+to)\b/i,
  /\bi(?:'d|would)\s+(?:like|rather)\b/i,
  /\bthinking\s+(?:of|about)\b/i,
  // A change already made, reported first-person.
  /\bi\s+(?:have\s+|'ve\s+)?(?:stopped|started|skipped|missed|changed|reduced|lowered|increased|raised|doubled|halved|quit|come\s+off|came\s+off|tapered|weaned|switched|adjusted)\b/i,
];

/**
 * The change was decided by the prescriber, not by the client. The reply this
 * guard serves would tell them to ask the person who already told them.
 */
const PRESCRIBER_ATTRIBUTED: readonly RegExp[] = [
  /\b(?:doctor|dr\.?|psychiatrist|gp|physician|consultant|prescriber|consultant)\b[^.?!]{0,60}\b(?:told|asked|said|advised|instructed|wants?|want\s+me|recommended|suggested)\b[^.?!]{0,40}\b(?:stop|start|skip|change|reduce|lower|increase|raise|double|halve|quit|come\s+off|taper|wean|switch|adjust)/i,
  /\b(?:as|like)\s+(?:my\s+)?(?:doctor|psychiatrist|prescriber)\s+(?:said|told\s+me|advised)\b/i,
  /\bprescribed\s+(?:me\s+)?(?:to\s+)?(?:stop|change|reduce|increase|skip)\b/i,
];

/** Negated intent: no decision is being raised. */
const NEGATED_INTENT: readonly RegExp[] = [
  /\b(?:don'?t|do\s+not|wouldn'?t|would\s+not|won'?t|will\s+not|never|not\s+going\s+to|not\s+planning\s+to)\s+(?:ever\s+)?(?:want\s+to\s+)?(?:stop|quit|come\s+off|skip|change|reduce|lower|increase|double|halve)\b/i,
  /\bno\s+(?:intention|plans?)\s+(?:of|to)\s+(?:stopping|quitting|coming\s+off|changing|skipping)\b/i,
];

/** Which of the three components matched, for the audit row and the report. */
export interface MedicationMatch {
  matched: boolean;
  /** e.g. "meds + stop + question" — null when nothing matched. */
  reason: string | null;
  medicine: string | null;
  change: string | null;
}

/** The state above which this guard must never speak: crisis owns the turn. */
function refusesAt(state: SafetyState): boolean {
  return state === 'S3' || state === 'S4';
}

function firstMatch(patterns: readonly RegExp[], text: string): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

/**
 * Decide whether a message is a medication-change question.
 *
 * Pure and order-independent: the three components are found independently and
 * then required together, so a message mentioning both a medicine and an
 * unrelated "stop" ("I stopped going to the gym, is that why my meds aren't
 * working?") still fires — and that is the right call, because it is a question
 * about the medicine.
 */
export function matchMedicationQuestion(message: string): MedicationMatch {
  const none: MedicationMatch = { matched: false, reason: null, medicine: null, change: null };
  if (typeof message !== 'string' || message.trim() === '') return none;

  if (firstMatch(PRESCRIBER_ATTRIBUTED, message)) return none;
  if (firstMatch(NEGATED_INTENT, message)) return none;

  const medicine = firstMatch(MEDICINE_TERMS, message);
  if (medicine === null) return none;

  const change = firstMatch(CHANGE_VERBS, message);
  if (change === null) return none;

  const framing = firstMatch(DECISION_FRAMING, message);
  if (framing === null) return none;

  const kind = framing === '?' ? 'question' : 'decision';
  return {
    matched: true,
    reason: `${medicine} + ${change} + ${kind}`,
    medicine,
    change,
  };
}

/**
 * Should this turn be answered with the fixed medication reply instead of the
 * model's?
 *
 * `safetyState` is the state the turn already carries, so a message that is
 * also a crisis disclosure is refused here and served its own card upstream.
 */
export function shouldRouteMedication(input: {
  message: string;
  safetyState: SafetyState;
}): MedicationMatch {
  const none: MedicationMatch = { matched: false, reason: null, medicine: null, change: null };
  if (refusesAt(input.safetyState)) return none;
  return matchMedicationQuestion(input.message);
}
