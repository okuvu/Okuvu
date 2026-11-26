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

/**
 * The approved addition for the already-happened case, verbatim (owner,
 * 25 Nov 2026). Shown ONLY when the message reports that the change has already
 * been made — not for a question, and not for a plan.
 *
 * Kept as its own constant so `MEDICATION_ROUTE_RESPONSE` above stays
 * byte-identical to the string the owner approved on 25 Nov. The two are joined
 * by `medicationReply()` and never edited in place.
 */
export const MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED =
  "If you've already stopped or changed it and you're feeling unwell, contact your doctor today. If you feel very unwell or unsafe, call 112.";

/** Audit label for the mechanism, kept beside the copy it produced. */
export const MEDICATION_ROUTE_SOURCE = 'medication_route' as const;

/**
 * Did the deterministic net answer this turn?
 *
 * Exists so the gold set can prove the net FIRED on the right messages without
 * asking a judge to grade wording it grades inconsistently. The exact bytes are
 * asserted in the code tests (they are the owner's approved copy, frozen); this
 * predicate only answers "was it the net, or the model?".
 *
 * The already-happened paragraph is appended after the main reply, so every net
 * reply starts with `MEDICATION_ROUTE_RESPONSE`; both are accepted so the
 * predicate stays correct if that order ever changes.
 */
export function isMedicationNetReply(text: string): boolean {
  const t = (text ?? '').trim();
  return t.startsWith(MEDICATION_ROUTE_RESPONSE) || t.startsWith(MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED);
}

/**
 * The change has already happened: the client is reporting something done, not
 * asking whether to do it.
 *
 * Why this needs its own detector rather than reusing `DECISION_FRAMING`: that
 * pattern deliberately accepts all three kinds of decision (question, plan,
 * fresh report), because all three get the same prescriber route. Only the
 * third kind gets the "contact your doctor today" paragraph, and the sentence
 * "speak to them before you start, stop or change anything" reads as advice
 * arriving after the event for exactly that third kind.
 *
 * Completion is signalled by first-person past tense ("I stopped", "I've
 * skipped", "I came off") or an explicit temporal marker ("on Monday", "three
 * days ago", "since last week"). Forward-looking forms are then excluded, so
 * "I want to stop", "should I stop" and "I'm thinking of coming off" stay on
 * the plain reply.
 */
const ALREADY_HAPPENED: readonly RegExp[] = [
  // First-person past tense, with or without the auxiliary.
  /\bi\s+(?:have\s+|had\s+)?(?:already\s+)?(?:stopped|skipped|missed|changed|reduced|lowered|increased|raised|doubled|halved|quit|came\s+off|tapered|weaned|switched|adjusted)\b/i,
  /\bi(?:'ve|'d)\s+(?:already\s+)?(?:stopped|skipped|missed|changed|reduced|lowered|increased|raised|doubled|halved|quit|come\s+off|tapered|weaned|switched|adjusted)\b/i,
  // Change reported as a bare past-tense verb without a pronoun: "stopped them
  // on Monday", "stopped my antidepressants three days ago". Requires a
  // temporal or possessive anchor so "stopped" alone cannot fire it.
  /\b(?:stopped|skipped|missed|changed|reduced|halved|doubled|quit|tapered)\s+(?:them|it|my|the)\b[^.?!]{0,40}\b(?:on|since|last|yesterday|ago|this\s+week|for\s+\w+\s+days?)\b/i,
  // Unambiguous "since then I have been off it" shape.
  /\b(?:been|be)\s+off\s+(?:them|it|my)\b/i,
];

/**
 * Forward-looking signals. If any of these is present the change is still in
 * the future or the hypothetical, so the already-happened paragraph is wrong.
 *
 * "Should I have stopped?" and "would it have been better to stop?" are
 * retrospective questions about a decision already taken; they are excluded
 * deliberately, because the paragraph addresses the client's current state and
 * they have not said how they are now.
 */
const FORWARD_LOOKING: readonly RegExp[] = [
  /\b(?:can|could|should|shall|may|might|would|will|do|does)\s+i\b/i,
  /\b(?:can|could|should|shall|would|will|might|may)\s+i\s+have\b/i,
  /\bi\s+(?:want|wanna|need|plan|intend|am\s+planning|'m\s+planning|am\s+thinking|'m\s+thinking|am\s+considering|'m\s+considering|am\s+going|'m\s+going|have\s+decided|'ve\s+decided)\b/i,
  /\bi\s+(?:should|must|have\s+to|need\s+to|ought\s+to|gotta|think\s+i\s+should|think\s+i\s+need\s+to)\b/i,
  /\bthinking\s+(?:of|about)\b/i,
  /\bwhat\s+(?:if|happens)\b/i,
];

/**
 * Forms where the medicine is carried by a pronoun rather than named — "I have
 * been off them since Monday". In these the referent is unambiguous inside the
 * clause, so they do not need a medicine word beside them.
 */
const ALREADY_REFERENT_BOUND: readonly RegExp[] = [
  /\b(?:been|be|am|is)\s+off\s+(?:them|it|my)\b/i,
];

/** Clauses, so a past-tense verb has to belong to the same thought as the medicine. */
function clausesOf(message: string): string[] {
  return message
    .split(/[,.;!?\n]+/)
    .map((c) => c.trim())
    .filter((c) => c !== '');
}

/**
 * Did the message report a change as already done?
 *
 * Pure, no I/O, no clock. Called only after `matchMedicationQuestion` has
 * already established that this is a medication-change message, so it does not
 * re-check the medicine or the change verb.
 *
 * Matched **per clause**, not across the whole message. "I stopped going to the
 * gym, is that why my meds aren't working?" mentions a stopping and a medicine,
 * but the stopping is the gym — serving "if you've already stopped or changed
 * it and you're feeling unwell" to that person is answering a question they did
 * not ask. Requiring both in one clause is what keeps it out. Found by probing.
 */
export function isAlreadyHappened(message: string): boolean {
  if (typeof message !== 'string' || message.trim() === '') return false;
  for (const clause of clausesOf(message)) {
    // Scoped per clause, not per message. "I stopped them on Monday and I feel
    // awful, should I start again?" reports a change and then asks what to do
    // about it — the paragraph is exactly right for that person. A message-wide
    // check would cancel it because of the second clause.
    if (firstMatch(FORWARD_LOOKING, clause) !== null) continue;
    if (firstMatch(ALREADY_HAPPENED, clause) === null) continue;
    if (firstMatch(MEDICINE_TERMS, clause) !== null) return true;
    if (firstMatch(ALREADY_REFERENT_BOUND, clause) !== null) return true;
  }
  return false;
}

/**
 * The full reply for a turn: the approved block, plus the already-happened
 * paragraph when the client reported the change rather than asking about it.
 */
export function medicationReply(message: string): string {
  return isAlreadyHappened(message)
    ? `${MEDICATION_ROUTE_RESPONSE}\n\n${MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED}`
    : MEDICATION_ROUTE_RESPONSE;
}

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
  /\bi\s+(?:have\s+)?(?:stopped|started|skipped|missed|changed|reduced|lowered|increased|raised|doubled|halved|quit|come\s+off|came\s+off|tapered|weaned|switched|adjusted)\b/i,
  // Contracted past tense. `\bi\s+` above needs whitespace after "I", so
  // "I've stopped my meds" — the plainest way anyone reports this — was never
  // matched at all. Found by probing, not by review.
  /\bi(?:'ve|'d)\s+(?:already\s+)?(?:stopped|started|skipped|missed|changed|reduced|lowered|increased|raised|doubled|halved|quit|come\s+off|tapered|weaned|switched|adjusted)\b/i,
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
  // Past tense, so the contracted report added to DECISION_FRAMING cannot drag
  // a denial into the net: "I've never stopped my meds", "I never skipped them".
  /\b(?:never|not\s+once)\s+(?:ever\s+)?(?:have\s+i\s+)?(?:stopped|skipped|missed|changed|reduced|lowered|increased|raised|doubled|halved|quit|come\s+off|tapered|weaned|switched|adjusted)\b/i,
  /\b(?:haven'?t|have\s+not|hadn'?t)\s+(?:ever\s+)?(?:stopped|skipped|missed|changed|reduced|lowered|increased|raised|doubled|halved|quit|come\s+off|tapered|weaned|switched|adjusted)\b/i,
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
