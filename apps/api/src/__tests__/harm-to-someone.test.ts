/**
 * The harm-to-someone screen — owner-approved 24 Nov 2026.
 *
 * Three properties, each of which has a wrong version that reads fine in review:
 *
 *  1. **It is its own screen, at S3.** A client who says they want to hurt
 *     someone gets the short screen, not the crisis card (second person, about
 *     their own safety) and not the ordinary helpline list (an instruction that
 *     does not fit). The flag is still recorded and the therapist is still
 *     alerted — with `urgent`.
 *  2. **A first-person risk signal still wins.** "I want to hurt my brother and
 *     I cut myself again" is S4 with the crisis card, because two disclosures in
 *     one answer resolve to the more protective screen.
 *  3. **It only runs where the owner said it should** — on the worksheets that
 *     carry the deeper screen. The same words in an ordinary worksheet go
 *     through the shared check and nothing else.
 *
 * The copy itself is pinned separately (`harm-to-someone-copy.test.ts`); this
 * file is about routing and the flag.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockClassifySafety = vi.hoisted(() => vi.fn());

vi.mock('../agents/a1/agent.js', () => ({ classifySafety: mockClassifySafety }));

import { checkClientText } from '../lib/safety-check.js';
import {
  HARM_TO_SOMEONE_RESPONSE,
  HARM_TO_SOMEONE_SCREEN,
  HARM_TO_SOMEONE_FORBIDDEN,
} from '../lib/harm-to-someone.js';

const HARM_TEXT = 'I keep thinking I want to hurt my brother and I do not know what to do';

function classified(state: string) {
  return {
    safetyState: state,
    fallbackUsed: false,
    crisis_language_detected: state === 'S4',
    basis: 'literal',
    signal_strength: 'high',
    notes: null,
  };
}

describe('the harm-to-someone screen', () => {
  beforeEach(() => {
    mockClassifySafety.mockReset();
    mockClassifySafety.mockResolvedValue(classified('S1'));
  });

  it('is S3 with its own screen, flagged and urgent, and never the crisis card', async () => {
    const result = await checkClientText(HARM_TEXT, { sensitiveCheck: true });

    expect(result).toMatchObject({
      level: 'S3',
      flagged: true,
      showHelp: true,
      screen: 'harm_to_someone',
      urgent: true,
      degraded: false,
    });
    expect(result.reason).toBe('sensitive_worksheet_floor:wanting_to_hurt_someone');
    // The floor decided; the model was never asked.
    expect(mockClassifySafety).not.toHaveBeenCalled();
  });

  it('lets a first-person signal win: self-harm in the same answer is S4, no screen', async () => {
    const result = await checkClientText(
      'I want to hurt my brother and I cut myself again last night',
      { sensitiveCheck: true },
    );

    expect(result.level).toBe('S4');
    expect(result.flagged).toBe(true);
    // The crisis card, because the person is also describing their own risk.
    expect(result.screen).toBeNull();
    expect(result.urgent).toBe(false);
  });

  it('lets "wanting not to wake up" win over it too', async () => {
    const result = await checkClientText(
      'I want to hurt him, and some nights I want to go to sleep and never wake up',
      { sensitiveCheck: true },
    );

    expect(result.level).toBe('S4');
    expect(result.screen).toBeNull();
  });

  it('does not fire on an ordinary worksheet — the deeper screen is per row', async () => {
    const result = await checkClientText(HARM_TEXT, { sensitiveCheck: false });

    // The floor did not fire and the classifier said S1, so nothing is shown.
    expect(result.flagged).toBe(false);
    expect(result.screen).toBeNull();
    expect(result.urgent).toBe(false);
  });

  it('does not mark any other concern urgent', async () => {
    const result = await checkClientText('I have been skipping meals and I hate my body', {
      sensitiveCheck: true,
    });

    expect(result.level).toBe('S3');
    expect(result.flagged).toBe(true);
    expect(result.screen).toBeNull();
    expect(result.urgent).toBe(false);
  });
});

describe('the approved screen, as it is served', () => {
  it('puts the emergency number in the body and as its own row', () => {
    expect(HARM_TO_SOMEONE_SCREEN.emergency.number).toBe('112');
    expect(HARM_TO_SOMEONE_SCREEN.emergency.display).toBe('112');
    // The sentence says "call 112 now"; the row is what makes it a call action.
    expect(HARM_TO_SOMEONE_RESPONSE).toContain('call 112 now');
    expect(HARM_TO_SOMEONE_RESPONSE).toContain('Emergency services: 112');
  });

  it('offers the safety plan and says the alert is urgent', () => {
    expect(HARM_TO_SOMEONE_SCREEN.plan_label).toBe('My plan for hard moments');
    expect(HARM_TO_SOMEONE_SCREEN.alert).toContain('has been told this is urgent');
  });

  it('offers Vandrevala after the emergency row, for the person who is frightened', () => {
    const vandrevala = HARM_TO_SOMEONE_SCREEN.resources.find(
      (resource) => resource.label === 'Vandrevala Foundation',
    );
    expect(vandrevala).toBeDefined();
    // The approved number, and the operator's own hours (checked 24 Nov 2026).
    expect(vandrevala!.number).toBe('+919999666555');
    expect(vandrevala!.display).toBe('+91 9999 666 555');
    expect(vandrevala!.description).toBe('24 hours, call or WhatsApp');
  });

  it('never promises how fast a therapist answers', () => {
    for (const phrase of HARM_TO_SOMEONE_FORBIDDEN) {
      expect(HARM_TO_SOMEONE_RESPONSE.toLowerCase()).not.toContain(phrase);
    }
    // What it does say: what the platform did, and that 112 is the way to help
    // right now.
    expect(HARM_TO_SOMEONE_SCREEN.alert).toContain('They may not be able to reply straight away');
    expect(HARM_TO_SOMEONE_SCREEN.alert).toContain('call 112');
  });

  it('does not lead with a helpline list', () => {
    // Tele-MANAS, SNEHA and iCall belong to the crisis card; this screen names
    // one service, after the emergency row, for the person who is frightened
    // rather than in the act.
    expect(HARM_TO_SOMEONE_RESPONSE).not.toContain('Tele-MANAS');
    expect(HARM_TO_SOMEONE_RESPONSE).not.toContain('SNEHA');
    expect(HARM_TO_SOMEONE_RESPONSE).not.toContain('iCall');
  });
});
