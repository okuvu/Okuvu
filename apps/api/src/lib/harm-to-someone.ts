/**
 * The screen for a client who says they want to hurt someone else.
 *
 * CLINICAL OWNER'S APPROVAL, 24 November 2026 (Rajwant, in chat, after he read
 * the draft and sent three changes). This file is the record of the wording he
 * approved; every change after this void the approval for the changed text and
 * it goes back to him (§9 of the 1 Nov document, applied here the same way).
 *
 * Why it exists at all, and why it is neither of the two cards that already
 * exist:
 *
 *   - `CRISIS_RESPONSE` is written in the second person about the reader's own
 *     safety ("call if you feel like doing it now"). Served to someone
 *     frightened of what they might do to another person it gives an
 *     instruction that does not fit, and reads as being misunderstood.
 *   - The third-party card is for "my friend is suicidal" — the person at risk
 *     is someone else, and the reader needs a channel for them. That is a
 *     different situation with a different answer.
 *   - The governance route's policy line ("that's something I can't help with
 *     here") is worse than either: it is a brush-off delivered at the moment
 *     someone has just said the most shameful sentence they know.
 *
 * So: one short screen of its own. It names the fear plainly instead of
 * softening it into a helpline suggestion, puts the emergency number in the
 * sentence *and* as a tappable row, keeps the client's own safety plan one tap
 * away, marks the therapist alert urgent, and says what the platform did
 * ("has been told this is urgent") rather than promising how fast a therapist
 * answers — which is the one thing the product cannot promise.
 *
 * LEVEL. This concern is S3, not S4: it is flagged, so the client gets a real
 * screen and the therapist gets an alert, but it is not the second-person
 * crisis card. Anything that is ALSO a first-person risk signal resolves to the
 * more protective screen — `worstExtraRisk()` returns an S4 match when one
 * exists, so self-harm or wanting not to wake up still wins and this screen is
 * not reached.
 *
 * WHAT THE ROWS ARE. The 112 row is the approved emergency entry (the label
 * "Ambulance, police and fire" is the description the 9 Nov document supplies
 * for the same row on the crisis card). Vandrevala is the one helpline on this
 * screen, and it is offered as a *later* option — "if you're not about to act
 * but these thoughts frighten you" — because a five-line helpline block headed
 * "call us about you" is the wrong instruction for this disclosure. The number
 * and hours were re-checked against the operator's own site on 24 Nov 2026
 * (https://www.vandrevalafoundation.com/free-counseling/contact-us): +91 9999
 * 666 555, 24 × 7 × 365, call or WhatsApp.
 */

export interface HarmToSomeoneResource {
  /** Client-facing name. */
  label: string;
  /** One line under the name: who answers, or what the number is for. */
  description: string;
  /** E.164 or short code, for the tap-to-call action. */
  number: string;
  /** What the client sees. Always the approved display form. */
  display: string;
}

export interface HarmToSomeoneScreen {
  /**
   * `harm_to_someone` — intent, or a disclosure that reads as intent.
   * `harm_to_someone_thoughts` — a frightening unwanted thought with no intent
   * (owner's 24 Nov 2026 case 3): the same alert and the same safety plan, in
   * gentler words and with no instruction to call 112.
   */
  kind: 'harm_to_someone' | 'harm_to_someone_thoughts';
  /** The body, in order. Each string is one paragraph on screen. */
  paragraphs: string[];
  /** The emergency row, rendered above the other resources. */
  emergency: HarmToSomeoneResource;
  /** Later-line resources: offered below the emergency row. */
  resources: HarmToSomeoneResource[];
  /** The therapist line. Says what happened, not how fast anyone will answer. */
  alert: string;
  /** The button that opens the client's own safety plan. */
  plan_label: string;
  /** The last line. */
  closing: string;
}

const OPENING = 'Thank you for writing this down.';

const SECOND =
  'It takes courage to say it out loud, and it does not make you a bad person. ' +
  'It means you want help before anything happens.';

const THIRD =
  'Three things that help right now. Put some distance between you and the person, if you can. ' +
  'Move away from anything you could use to hurt someone, or ask someone to keep it for now. ' +
  'Stay near someone you trust, so you are not carrying this alone. ' +
  'And if you think you might act on it — or you are not sure you can stop yourself — call 112 now. ' +
  'It is the emergency number, and they can help you stay safe.';

const ALERT =
  'Your therapist has been told this is urgent. They may not be able to reply straight away, ' +
  'so if you need help right now, call 112.';

const CLOSING = "You can come back to OKUVU whenever you're ready.";

export const HARM_TO_SOMEONE_RESOURCE_EMERGENCY: HarmToSomeoneResource = {
  label: 'Emergency services',
  description: 'Ambulance, police and fire.',
  number: '112',
  display: '112',
};

/**
 * Vandrevala, offered to the person who is frightened rather than in the act.
 * Number and hours are the approved ones (HELPLINE_BLOCK in pipeline/fallbacks)
 * and were re-checked against the operator's own page on 24 Nov 2026.
 */
export const HARM_TO_SOMEONE_RESOURCE_VANDREVALA: HarmToSomeoneResource = {
  label: 'Vandrevala Foundation',
  description: '24 hours, call or WhatsApp',
  number: '+919999666555',
  display: '+91 9999 666 555',
};

/** The line under the 112 row that introduces Vandrevala. */
export const HARM_TO_SOMEONE_LATER_LINE =
  "If you're not about to act but these thoughts frighten you, you can talk them through with " +
  'Vandrevala Foundation, any time, day or night.';

export const HARM_TO_SOMEONE_PLAN_LABEL = 'My plan for hard moments';

export const HARM_TO_SOMEONE_SCREEN: HarmToSomeoneScreen = {
  kind: 'harm_to_someone',
  paragraphs: [OPENING, SECOND, THIRD],
  emergency: HARM_TO_SOMEONE_RESOURCE_EMERGENCY,
  resources: [HARM_TO_SOMEONE_RESOURCE_VANDREVALA],
  alert: ALERT,
  plan_label: HARM_TO_SOMEONE_PLAN_LABEL,
  closing: CLOSING,
};

// ─── Case 3: a frightening thought, with no intent ─────────────────────────
//
// Owner's instruction, 24 Nov 2026: "frightening unwanted thoughts with no
// intent: urgent screen with gentle wording, no 112 push beyond what the
// message already says."
//
// So this is the same screen with a different body: the alert is still urgent,
// the safety plan is still one tap away, and Vandrevala is still offered as a
// line to talk to. What it does not do is tell the person to call 112 — they
// have not said they are about to act, and an emergency instruction aimed at
// someone frightened of their own thoughts reads as an accusation. The 112 row
// stays as a tappable resource; the body carries no instruction to use it.
//
// APPROVED COPY — the owner approved this wording on 24 Nov 2026 (round five),
// with two changes to the draft: the second paragraph's "bad person or a danger
// to anyone" became "bad person. Many people have thoughts like this and never
// act on them", and the alert dropped from urgent to a normal therapist alert
// ("has been let know, so you can talk about it together"). The 112 row is
// unchanged and stays tappable, with no instruction to use it.
const THOUGHTS_OPENING = 'Thank you for telling me. Saying that out loud is not easy.';

const THOUGHTS_SECOND =
  'A frightening thought is not the same as wanting to act on it. Thoughts like this can arrive ' +
  'uninvited and feel appalling, and having one does not make you a bad person. Many people ' +
  'have thoughts like this and never act on them.';

const THOUGHTS_THIRD =
  'It helps to say it to someone real — your therapist, or someone you trust. If these thoughts ' +
  'keep coming back, or they frighten you a lot, it is worth talking them through properly with ' +
  'someone who can help.';

/**
 * The alert line for this screen only, and a normal alert rather than an
 * urgent one (owner's decision, 24 Nov 2026 round five): a frightening thought
 * with no intent is something to talk about together, not something to page
 * anyone about. It still reaches the therapist; it does not lead with "urgent".
 *
 * The intent screen's alert ends "…so if you need help right now, call 112."
 * Carried onto a disclosure that describes no intent, that sentence is the
 * 112 push the owner ruled out — and the first gold-set run proved he was right
 * to: the judge failed both thought scenarios on it, three reps of three. So
 * this variant says what happened and stops, and the 112 row stays available
 * without being urged.
 */
const THOUGHTS_ALERT =
  'Your therapist has been let know, so you can talk about it together. They may not be able to ' +
  'reply straight away.';

export const HARM_TO_SOMEONE_THOUGHTS_SCREEN: HarmToSomeoneScreen = {
  kind: 'harm_to_someone_thoughts',
  paragraphs: [THOUGHTS_OPENING, THOUGHTS_SECOND, THOUGHTS_THIRD],
  emergency: HARM_TO_SOMEONE_RESOURCE_EMERGENCY,
  resources: [HARM_TO_SOMEONE_RESOURCE_VANDREVALA],
  alert: THOUGHTS_ALERT,
  plan_label: HARM_TO_SOMEONE_PLAN_LABEL,
  closing: CLOSING,
};

/** The same screen as one string, for surfaces that can only carry text. */
export const HARM_TO_SOMEONE_THOUGHTS_RESPONSE =
  HARM_TO_SOMEONE_THOUGHTS_SCREEN.paragraphs.join('\n\n') +
  '\n\n' +
  `${HARM_TO_SOMEONE_THOUGHTS_SCREEN.emergency.label}: ${HARM_TO_SOMEONE_THOUGHTS_SCREEN.emergency.display}` +
  ` (${HARM_TO_SOMEONE_THOUGHTS_SCREEN.emergency.description})\n\n` +
  `${HARM_TO_SOMEONE_THOUGHTS_SCREEN.resources[0].label}: ${HARM_TO_SOMEONE_THOUGHTS_SCREEN.resources[0].display}` +
  ` (${HARM_TO_SOMEONE_THOUGHTS_SCREEN.resources[0].description})\n\n` +
  HARM_TO_SOMEONE_THOUGHTS_SCREEN.alert +
  '\n\n' +
  HARM_TO_SOMEONE_THOUGHTS_SCREEN.closing;

/**
 * The same screen as one string.
 *
 * Used where only text can go: the response body of a surface that has no card
 * renderer, a log line, and the tests that pin the approved wording. Built from
 * the structured object rather than typed again, so the two cannot drift.
 */
export const HARM_TO_SOMEONE_RESPONSE =
  HARM_TO_SOMEONE_SCREEN.paragraphs.join('\n\n') +
  '\n\n' +
  `${HARM_TO_SOMEONE_SCREEN.emergency.label}: ${HARM_TO_SOMEONE_SCREEN.emergency.display}` +
  ` (${HARM_TO_SOMEONE_SCREEN.emergency.description})\n\n` +
  HARM_TO_SOMEONE_LATER_LINE +
  '\n\n' +
  `${HARM_TO_SOMEONE_SCREEN.resources[0].label}: ${HARM_TO_SOMEONE_SCREEN.resources[0].display}` +
  ` (${HARM_TO_SOMEONE_SCREEN.resources[0].description})\n\n` +
  HARM_TO_SOMEONE_SCREEN.alert +
  '\n\n' +
  HARM_TO_SOMEONE_SCREEN.closing;

/**
 * The promise the screen must keep, asserted in tests: the emergency number in
 * the body text, the safety plan offered, the alert marked urgent, and no
 * promise about how fast a therapist replies.
 */
export const HARM_TO_SOMEONE_FORBIDDEN = [
  'will get back to you',
  'will reply',
  'will call you',
  'shortly',
  'within the hour',
  'right away',
] as const;
