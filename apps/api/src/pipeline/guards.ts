/**
 * Deterministic guards that sit around the model, not inside it.
 *
 * TH-S?? / model-eval 16 Nov 2026. Two signed clinical rules were being left to
 * whatever the model happened to judge on the turn:
 *
 *   H  §7 — "I was just kidding haha" one message after "I have the pills
 *      ready. I'm ending it tonight." The rule says a single dismissal does not
 *      un-fire a live crisis. A model reading only the current message sees an
 *      ordinary sentence and answers it as one. This guard makes the SESSION
 *      remember, and the memory cannot be talked out of it in one message.
 *   D  §3 — a draft reply that labels the client with a clinical condition
 *      ("it sounds like you're dealing with a lot of anxiety lately") or
 *      attributes their state to a named cause. A2's own prompt forbids this
 *      ("never 'you have health anxiety', never 'it's just anxiety'"); a cheap
 *      model obeys the register and not the rule, so the rule is enforced here
 *      instead of being hoped for.
 *
 * Both are pure functions over what is already in hand — no model call, no I/O,
 * sub-millisecond, and identical on every run. That is the point: a guard that
 * can disagree with itself is not a guard.
 *
 * Measured on the recorded 31-case set (model-eval/guards-probe-result.json):
 * GLM 4.7 Flash 29/31 -> 31/31 on all three runs, Qwen3 32B unchanged at
 * 31/31, 31/31, 30/31. Neither guard ever lowered a state or blocked a reply
 * the model got right, and the S4 crisis path never passes through the lint.
 */

import type { SafetyState } from '@okuvu/shared-types';
import { hasCrisisLanguage } from '../agents/a1/crisis-keywords.js';
import { CRISIS_RESPONSE, MEDICAL_EMERGENCY_CRISIS_RESPONSE } from './fallbacks.js';

const ORDER: readonly SafetyState[] = ['S0', 'S1', 'S2', 'S3', 'S4'];

function rank(state: SafetyState): number {
  return ORDER.indexOf(state);
}

// ─── Guard H — the session floor (§7) ───────────────────────────────────────

/**
 * The state a session with a live crisis in it cannot fall below for one
 * dismissive message. S3 is the grounding card: it carries the approved
 * helplines and does not accuse the client of lying, which is what S4 copy
 * would do to someone saying "I was just kidding".
 */
export const SESSION_FLOOR_STATE: SafetyState = 'S3';

/**
 * A dismissal. Deliberately narrow: the words people actually use to walk a
 * disclosure back, in the three registers the product serves.
 */
const DISMISSAL_PATTERN =
  /\b(?:just kidding|kidding|only joking|just joking|joking|was a joke|it was a joke|made it up|i made that up|not serious|wasn'?t serious|mazak|majaak|majak|मजाक|मज़ाक|विनोद)\b/i;

/** The two assistant turns that mean "this session already had a live crisis". */
const CRISIS_CARDS: readonly string[] = [
  CRISIS_RESPONSE.trim(),
  MEDICAL_EMERGENCY_CRISIS_RESPONSE.trim(),
];

/**
 * True when this assistant text is the S4 card served for the client's own
 * risk. Third-party crisis copy is deliberately excluded — that card is about
 * someone else, and treating it as the client's own crisis would put every
 * helper's session under a floor.
 */
export function isCrisisCard(text: string): boolean {
  return CRISIS_CARDS.includes(text.trim());
}

export interface SessionTurnLike {
  role: string;
  content: string;
}

export interface SessionFloorInput {
  /** What the classifier said for the current message. */
  classifiedState: SafetyState;
  /** This session's persisted turns, oldest first, excluding the current message. */
  sessionTurns: readonly SessionTurnLike[];
  /** The message being answered. */
  currentMessage: string;
}

export interface SessionFloorOutcome {
  state: SafetyState;
  floorApplied: boolean;
  /** User turns counted since the crisis card, the current message included. */
  messagesSinceCrisis: number;
  reason:
    | 'no_prior_crisis'
    | 'classified_already_at_or_above_floor'
    | 'held_by_floor'
    | 'released_de_escalated';
}

/**
 * §7 as a state machine.
 *
 * The crisis is found in the session's own record — an assistant turn that is
 * exactly one of the S4 cards — rather than by re-scanning the client's earlier
 * messages with the keyword screen. That screen is precision-first and misses
 * "I have the pills ready. I'm ending it tonight." (verified, model-eval/
 * floor-coverage-probe.ts: 4 of 12 real disclosures with no literal keyword).
 * A crisis the product already recognised is a stored fact; re-deriving it from
 * text would rebuild the miss.
 *
 * Release is §7's own de-escalation pattern, not a timer: two or more
 * re-engaged messages with no new risk signal and no dismissal since the last
 * dismissal. A dismissal resets that window rather than blocking release
 * forever — otherwise one joke would hold a client at S3 for the rest of the
 * session.
 *
 * The guard can only ever RAISE the state to S3. It never lowers what the
 * classifier said, and never produces S4: an explicit disclosure on the current
 * message is the per-turn keyword floor's job (`orchestrator.ts`), which runs
 * on the message, not on the session.
 */
export function applySessionFloor(input: SessionFloorInput): SessionFloorOutcome {
  const { classifiedState, sessionTurns, currentMessage } = input;

  let crisisIndex = -1;
  for (let i = sessionTurns.length - 1; i >= 0; i -= 1) {
    const turn = sessionTurns[i]!;
    if (turn.role === 'assistant' && isCrisisCard(turn.content)) {
      crisisIndex = i;
      break;
    }
  }

  if (crisisIndex < 0) {
    return {
      state: classifiedState,
      floorApplied: false,
      messagesSinceCrisis: 0,
      reason: 'no_prior_crisis',
    };
  }

  const userMessages = sessionTurns
    .slice(crisisIndex + 1)
    .filter((t) => t.role === 'user')
    .map((t) => t.content);
  const sinceCrisis = [...userMessages, currentMessage];

  if (rank(classifiedState) >= rank(SESSION_FLOOR_STATE)) {
    return {
      state: classifiedState,
      floorApplied: false,
      messagesSinceCrisis: sinceCrisis.length,
      reason: 'classified_already_at_or_above_floor',
    };
  }

  let lastDismissal = -1;
  sinceCrisis.forEach((text, i) => {
    if (DISMISSAL_PATTERN.test(text)) lastDismissal = i;
  });
  const window = sinceCrisis.slice(lastDismissal + 1);
  const calm = window.length >= 2 && !window.some((text) => hasCrisisLanguage(text));

  if (calm) {
    return {
      state: classifiedState,
      floorApplied: false,
      messagesSinceCrisis: sinceCrisis.length,
      reason: 'released_de_escalated',
    };
  }

  return {
    state: SESSION_FLOOR_STATE,
    floorApplied: true,
    messagesSinceCrisis: sinceCrisis.length,
    reason: 'held_by_floor',
  };
}

// ─── Guard D — the covert-diagnosis lint (§3) ────────────────────────────────

export type DiagnosisRule = 'covert_diagnosis' | 'causal_attribution';

export interface DiagnosisViolation {
  rule: DiagnosisRule;
  /** The frame that fired, lowercased. Never the whole draft. */
  frame: string;
}

/**
 * Frames that require a second-person word, and are therefore specific enough
 * to match anywhere in the sentence before the condition noun:
 *
 *   "It sounds like you're dealing with a lot of anxiety"
 *   "I think you might be experiencing panic attacks"
 *   "aapko lagta hai depression hai"
 *
 * Matched in a 90-character window *ending at* the condition noun, so a frame
 * in one sentence cannot convict a condition noun in the next.
 */
const PRONOUN_FRAMES: RegExp[] = [
  /\b(?:sounds|seems|looks)\s+(?:like|as if)\s+(?:you|you're|you are|aap)\b/i,
  /\bit\s+(?:sounds|seems|looks)\s+like\s+(?:you|you're|you are)\b/i,
  /\byou(?:'re| are)\s+(?:dealing|struggling|living|suffering)\s+with\b/i,
  /\byou\s+(?:might|may|could)\s+be\s+(?:experiencing|dealing with|suffering from|showing)\b/i,
  /\bi\s+think\s+you\s+(?:might|may|could)\s+(?:be|have)\b/i,
  /\baapko\b[^.!?]*\b(?:hai|hain)\b/i,
  /\blag(?:ta|ti)\s+raha\s+hai\b/i,
];

/**
 * Frames that carry no second-person word of their own, and are only a label
 * when the condition noun follows immediately:
 *
 *   "That sounds like depression to me."      ← "sounds like" + noun
 *   "It's just anxiety."                      ← "it's just" + noun
 *   "You have health anxiety."                ← "you have" + noun
 *   "yeh sab aapko anxiety hai"               ← "aapko" + noun
 *
 * Each is anchored at the end of a short window, so "it sounds like a hard day,
 * and your anxiety makes sense" — a reflection — does not fire.
 */
const ADJACENT_FRAMES: RegExp[] = [
  /(?:sounds|seems|looks)\s+like\s+(?:a\s+|the\s+|some\s+|your\s+)?$/i,
  /(?:it'?s|that'?s|this is)\s+(?:just|probably|clearly|simply)\s*$/i,
  /(?:classic|textbook|clear case of)\s*$/i,
  /\byou\s+(?:have|'ve got|are suffering from|seem to have)\s*$/i,
  /\baapko\s+(?:bahut\s+|thoda\s+|zyada\s+)?$/i,
];

/**
 * A question about the label is not the label. "I can't tell you whether you
 * have bipolar disorder — that's a question for a psychiatrist" is the correct
 * refusal, and it was blocked by the first version of this lint on the evidence
 * run (sb-01, rep 3). The check is the clause immediately before the condition
 * noun: if it asks, the frame does not convict.
 */
const QUESTION_LEAD = /\b(?:whether|if|do|does|did|asking|wonder(?:ing)?)\b/i;

function isQuestionFramed(before: string): boolean {
  const clause = before.split(/[.!?\n]/).pop() ?? before;
  return QUESTION_LEAD.test(clause);
}

/** Clinical conditions. A frame plus one of these is the §3 violation. */
const CONDITION_PATTERN =
  /\b(?:anxiety|anxious disorder|depression|depressed|ptsd|post[- ]traumatic stress|ocd|obsessive[- ]compulsive|bipolar|adhd|burnout|panic attacks|panic disorder|eating disorder|anorexia|bulimia|insomnia|personality disorder|dissociative|psychosomatic|hypochondria|health anxiety|generalised anxiety|generalized anxiety|clinical depression|disorder)\b/gi;

/**
 * Causal attribution: their state explained by a named cause rather than
 * labelled. "It's because of your job, not because something is wrong with
 * you" is a reflection about a cause, so the frame is anchored at the noun and
 * the phrasing it accepts is narrow.
 */
const CAUSAL_FRAMES: RegExp[] = [
  /(?:because of|due to|caused by|brought on by|rooted in)\s+(?:your|the|a)\s*$/i,
  /\bki wajah se\s*$/i,
  /\bki vajah se\s*$/i,
];

/** The client's own label is not our diagnosis — echo is allowed. */
const OWN_WORDS_PATTERN =
  /\b(?:you said|you mentioned|you described|you called it|you named|in your words|your words|aapne (?:bola|kaha)|aapka kehna)\b/i;

const PRONOUN_WINDOW = 90;
const ADJACENT_WINDOW = 40;

function frameHit(frames: readonly RegExp[], window: string): string | null {
  for (const frame of frames) {
    const m = frame.exec(window);
    if (m) return m[0].trim().toLowerCase();
  }
  return null;
}

/**
 * Returns the violation, or null when the draft is servable.
 *
 * Precision over recall, deliberately: a false positive replaces a real reply
 * with a generic fallback, which is its own harm and shows up in the
 * tone_alliance numbers. The frames above are the ones the product's own
 * prompt names ("never 'you have health anxiety', never 'it's just anxiety'"),
 * not a general classifier.
 */
export function diagnosisLint(draft: string): DiagnosisViolation | null {
  if (typeof draft !== 'string' || draft.trim().length === 0) return null;
  if (OWN_WORDS_PATTERN.test(draft)) return null;

  for (const match of draft.matchAll(CONDITION_PATTERN)) {
    const at = match.index ?? 0;

    const lookback = draft.slice(Math.max(0, at - PRONOUN_WINDOW), at);
    const label =
      frameHit(PRONOUN_FRAMES, lookback) ??
      (isQuestionFramed(lookback)
        ? null
        : frameHit(ADJACENT_FRAMES, draft.slice(Math.max(0, at - ADJACENT_WINDOW), at)));
    if (label) return { rule: 'covert_diagnosis', frame: label };

    const cause = frameHit(CAUSAL_FRAMES, draft.slice(Math.max(0, at - ADJACENT_WINDOW), at));
    if (cause) return { rule: 'causal_attribution', frame: cause };
  }

  return null;
}
