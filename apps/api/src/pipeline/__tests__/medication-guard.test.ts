/**
 * The medication safety net — what it catches and what it deliberately does not.
 *
 * Owner's rule, 25 Nov 2026: "any message about starting, stopping, skipping or
 * changing medicine gets this reply, whatever the model would have said."
 *
 * The "must catch" list is the rule. The "must not catch" list matters just as
 * much: a net that fires on "I took my meds today and felt proud" tells someone
 * on a good day to go ask their doctor, and a client who learns the companion
 * says that will stop telling it things.
 *
 * Every string here is a sentence a client could plausibly type. The Hindi and
 * Hinglish cases are here because the product serves those registers and a
 * medication question in Hinglish is the same question.
 */

import { describe, it, expect } from 'vitest';
import {
  matchMedicationQuestion,
  shouldRouteMedication,
  isAlreadyHappened,
  medicationReply,
  MEDICATION_ROUTE_RESPONSE,
  MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED,
} from '../medication-guard.js';
import type { SafetyState } from '@okuvu/shared-types';

describe('the approved reply', () => {
  it('is the exact sentence the owner approved, byte for byte', () => {
    expect(MEDICATION_ROUTE_RESPONSE).toBe(
      "That's an important question, and it's one for the doctor who prescribed your medicine. Please speak to them before you start, stop or change anything, even if you're feeling better. If it helps, we can think together about what you'd like to ask them.",
    );
  });

  it('names the prescriber and does not advise on the change itself', () => {
    expect(MEDICATION_ROUTE_RESPONSE).toContain('the doctor who prescribed your medicine');
    expect(MEDICATION_ROUTE_RESPONSE).toContain('speak to them before you start, stop or change anything');
    // It must never contain dosing instructions of its own.
    expect(MEDICATION_ROUTE_RESPONSE).not.toMatch(/\bmg\b|milligram|half a tablet|twice a day/i);
  });
});

/**
 * The rule as the owner stated it, one case per way of asking. A failure here
 * means a medication question reaches the model, which is what the net exists
 * to prevent.
 */
const MUST_CATCH: Array<[string, string]> = [
  // The scenario the whole rule grew out of.
  ['the owner-cited form', 'I feel fine now, so can I just stop my medication on my own?'],
  // Stopping.
  ['want to stop', 'I want to stop my antidepressants'],
  ['already stopped', 'I stopped my tablets on Monday and I feel awful'],
  ['quit', 'I think I should quit my meds, they do nothing'],
  ['come off', 'my therapist says nothing but I want to come off sertraline'],
  // Skipping and missing.
  ['skip', 'should I skip my meds today?'],
  ['skipped', 'I skipped my pills yesterday'],
  ['missed', 'I missed two days of my meds, is that bad?'],
  // Changing, up or down.
  ['reduce', 'can I halve my dose?'],
  ['reduce, spelled out', "I've decided to halve my dose this week. Does that sound reasonable?"],
  ['increase', 'what happens if I double my dose?'],
  ['change', 'I want to change my medication'],
  ['swap', 'can I switch from prozac to zoloft on my own'],
  // Starting.
  ['start', 'I want to start my meds again, is that ok'],
  // Named drug, no generic word at all.
  ['brand only', 'is it safe to stop olanzapine suddenly'],
  ['brand only 2', 'should I take less xanax'],
  // Hinglish and Hindi.
  ['hinglish', 'meri dawai band kar sakta hoon?'],
  ['hindi', 'मैं अपनी दवाई बंद कर सकता हूँ?'],
  // A statement of a change already made, which is a question in disguise.
  ['reported change, no question mark', 'I stopped my meds last week and I feel worse'],
];

describe('catches every way of asking about changing a medicine', () => {
  it.each(MUST_CATCH)('%s', (_label, message) => {
    const match = matchMedicationQuestion(message);
    expect(match.matched, `should have caught: ${message}`).toBe(true);
    expect(match.reason).not.toBeNull();
  });
});

/**
 * The other half of the rule. Each of these is an ordinary thing to say, and
 * answering any of them with "that's one for your doctor" would be wrong:
 * an adherence win, a side-effect observation, a decision already made by the
 * prescriber, a denial of intent, or a mention of medicine that is not about
 * the client changing anything.
 */
const MUST_NOT_CATCH: Array<[string, string]> = [
  // Adherence, not change.
  ['took them', 'I took my meds today and felt proud'],
  ['remembered them', 'I remembered my tablets this morning'],
  ['on time', 'I have been taking my medication on time all week'],
  // Observation, not a decision.
  ['side effect', 'my meds make me sleepy in the afternoon'],
  ['side effect 2', 'these antidepressants gave me a headache for the first week'],
  // The prescriber already decided — telling them to ask the prescriber is noise.
  ['doctor said stop', 'my doctor told me to stop my medication'],
  ['psychiatrist said reduce', 'the psychiatrist said I can reduce the dose'],
  ['as prescribed', 'I am only doing what my prescriber said'],
  // No decision raised.
  ['negated intent', 'I would never stop my meds without asking'],
  ['negated intent 2', "I don't want to come off my antidepressants"],
  // Medicine words, but no medicine change.
  ['gym, not meds', 'I stopped going to the gym last month'],
  ['someone else', 'my mother is on medication for BP'],
  ['no medicine at all', 'I feel fine now'],
  ['no medicine at all 2', 'I have a headache'],
  // A music band, not a stopped medicine.
  ['band', 'my band practice stopped last week'],
];

describe('leaves ordinary sentences alone', () => {
  it.each(MUST_NOT_CATCH)('%s', (_label, message) => {
    const match = matchMedicationQuestion(message);
    expect(match.matched, `should NOT have caught: ${message}`).toBe(false);
    expect(match.reason).toBeNull();
  });
});

describe('the reason names the words that matched, never the client text', () => {
  it('reports each component', () => {
    const match = matchMedicationQuestion('should I skip my meds today?');
    expect(match.matched).toBe(true);
    expect(match.reason).toBe('meds + skip + question');
    expect(match.medicine).toBe('meds');
    expect(match.change).toBe('skip');
  });

  it('distinguishes a question from a stated decision', () => {
    expect(matchMedicationQuestion('can I stop my tablets?').reason).toContain('question');
    expect(matchMedicationQuestion('I want to stop my tablets').reason).toContain('decision');
  });
});

/**
 * The state guard. A message that is also a crisis disclosure must serve the
 * crisis card and the helplines; the medication reply says nothing about risk,
 * so serving it at S3 or S4 would be a safety downgrade dressed as an
 * improvement.
 */
describe('never speaks above S2', () => {
  const message = 'I feel fine now, so can I just stop my medication on my own?';

  it.each<[SafetyState, boolean]>([
    ['S0', true],
    ['S1', true],
    ['S2', true],
    ['S3', false],
    ['S4', false],
  ])('%s -> %s', (state, expected) => {
    expect(shouldRouteMedication({ message, safetyState: state }).matched).toBe(expected);
  });

  it('a medication question carrying a crisis disclosure is refused at S4', () => {
    const mixed = 'I stopped my meds and now I want to kill myself';
    expect(matchMedicationQuestion(mixed).matched).toBe(true);
    expect(shouldRouteMedication({ message: mixed, safetyState: 'S4' }).matched).toBe(false);
  });
});

describe('degenerate input', () => {
  it('an empty message matches nothing', () => {
    expect(matchMedicationQuestion('').matched).toBe(false);
    expect(matchMedicationQuestion('   ').matched).toBe(false);
  });
});

/**
 * Owner's rule, 25 Nov 2026 — the already-happened case.
 *
 * "When the message says they have already stopped, skipped or changed their
 * medicine, add this after the approved reply ... Show it only for the
 * already-happened case."
 *
 * The approved block is unchanged and still asserted above, byte for byte. This
 * block is appended, never merged into it, so the string the owner signed stays
 * the string the owner signed.
 */
describe('the already-happened addition', () => {
  it('is the exact sentence the owner approved, byte for byte', () => {
    expect(MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED).toBe(
      "If you've already stopped or changed it and you're feeling unwell, contact your doctor today. If you feel very unwell or unsafe, call 112.",
    );
  });

  it('is appended after the approved reply, never before it', () => {
    const reply = medicationReply('I stopped my antidepressants three days ago and I feel awful');
    expect(reply.startsWith(MEDICATION_ROUTE_RESPONSE)).toBe(true);
    expect(reply.endsWith(MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED)).toBe(true);
    expect(reply).toBe(`${MEDICATION_ROUTE_RESPONSE}\n\n${MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED}`);
  });

  /**
   * The rule: shown for a report, never for a question or a plan. A question
   * answered with "if you've already stopped" reads as though the companion was
   * not listening.
   */
  const ALREADY: readonly string[] = [
    'I stopped my antidepressants three days ago and I feel awful',
    "I've stopped taking my meds",
    'I skipped two days of my tablets',
    'I came off my medication last week',
    'I missed my meds yesterday',
    'stopped my antidepressants three days ago',
  ];
  it.each(ALREADY)('adds the paragraph for a report: %s', (message) => {
    expect(isAlreadyHappened(message)).toBe(true);
    expect(medicationReply(message)).toContain(MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED);
  });

  const NOT_ALREADY: readonly string[] = [
    'I feel fine now, so can I just stop my medication on my own?',
    'should I skip my meds today',
    'I want to stop my medication',
    "I'm thinking of coming off my tablets",
    'what if I halve my dose',
    'is it safe to stop olanzapine suddenly',
    'should I have stopped my meds earlier',
    // A stopping that belongs to something else entirely. The message is a
    // medication question and does route — but not as already-happened.
    'I stopped going to the gym, is that why my meds are not working?',
  ];
  it.each(NOT_ALREADY)('leaves the reply unextended for a question or plan: %s', (message) => {
    expect(isAlreadyHappened(message)).toBe(false);
    expect(medicationReply(message)).toBe(MEDICATION_ROUTE_RESPONSE);
  });

  it('a report with no medicine named anywhere routes nowhere at all', () => {
    // "them" has no referent in this message, so there is nothing for the net
    // to be about — it does not fire, and the paragraph never appears.
    expect(matchMedicationQuestion('I already stopped them').matched).toBe(false);
    expect(medicationReply('I already stopped them')).toBe(MEDICATION_ROUTE_RESPONSE);
  });

  it('an ordinary reply never carries the already-happened paragraph', () => {
    // Both halves are true of a turn the net does not answer at all.
    for (const m of ['my doctor told me to stop my medication', 'I took my meds today and felt proud']) {
      expect(medicationReply(m)).toBe(MEDICATION_ROUTE_RESPONSE);
    }
  });
});

/**
 * Two gaps found by probing this round rather than by review. Both are recorded
 * here because a regression in either is silent: the first drops the net on the
 * plainest phrasing anyone uses, the second puts an emergency number in front of
 * someone who mentioned a gym.
 */
describe('phrasings the net must not lose', () => {
  it("routes the contracted report, which had no framing pattern at all", () => {
    // `\bi\s+` needs whitespace after "I", so "I've stopped my meds" matched no
    // decision framing and the net never fired on it.
    const m = matchMedicationQuestion("I've stopped taking my meds");
    expect(m.matched).toBe(true);
    expect(isAlreadyHappened("I've stopped taking my meds")).toBe(true);
  });

  it.each([
    "I've never stopped my meds",
    "I haven't skipped my tablets",
    'I never changed my dose',
    "I've never missed my meds",
  ])('still refuses a denial: %s', (message) => {
    expect(matchMedicationQuestion(message).matched).toBe(false);
  });

  it('binds the past-tense verb to the medicine, not to the whole message', () => {
    // Contains "stopped" and "meds" in different clauses.
    expect(isAlreadyHappened('I stopped going to the gym, is that why my meds are not working?')).toBe(false);
    expect(isAlreadyHappened('I stopped my meds, is that why the gym feels harder?')).toBe(true);
  });
});
