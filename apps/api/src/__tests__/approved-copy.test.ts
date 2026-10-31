/**
 * E17-S7 — the signed copy, pinned.
 *
 * Dr Shubhangi Goswami's sign-off of 31 October 2026 says the S3 and S4 texts
 * are approved *as written* and that "any later edit to the approved texts or
 * the phrase list voids this sign-off for the edited text" (§7.2). A comment in
 * the source file cannot enforce that: a well-meaning sharpening of one sentence
 * would ship and nobody would know the signature no longer covered it.
 *
 * So this test compares the served strings against the *paragraphs of her
 * signed document*, extracted verbatim into
 * `fixtures/e17-s7-approved-copy.json` (sha256 of the docx is recorded in the
 * fixture and in evidence/shubhangi-signoff/MANIFEST.txt). If the fixture and
 * the code disagree, the copy changed after signature and this fails.
 *
 * Do not "fix" a failure here by regenerating the fixture. Regenerating it is
 * only correct when a *new* signed document exists; otherwise the code is what
 * is wrong.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  A8_S3_GROUNDING_RESPONSE,
  CRISIS_RESPONSE,
  CRISIS_THIRD_PARTY_RESPONSE,
  HELPLINE_INLINE,
  BUDGET_PAUSED_RESPONSE,
  SAFETY_UNAVAILABLE_RESPONSE,
  MODEL_UNAVAILABLE_RESPONSE,
  MEDICAL_EMERGENCY_CRISIS_RESPONSE,
} from '../pipeline/fallbacks.js';
import { buildA9PostPrompt } from '../agents/a9-post/prompts.js';
import { scoreScenario } from '../../eval/gate-scoring.js';
import { hasSelfIngestion, hasThirdPartyCrisisLanguage } from '../agents/a1/crisis-keywords.js';
import {
  CRISIS_THIRD_PARTY_RESPONSE as THIRD_PARTY,
  MEDICAL_EMERGENCY_CRISIS_RESPONSE as MEDICAL_CRISIS,
} from '../pipeline/fallbacks.js';

const here = dirname(fileURLToPath(import.meta.url));
const approved = JSON.parse(
  readFileSync(join(here, 'fixtures', 'e17-s7-approved-copy.json'), 'utf-8'),
) as {
  source_docx_sha256: string;
  helpline_inline: string;
  s3_reply_paragraphs: string[];
  s4_card_paragraphs: string[];
};

/** Numbers her correction retires, everywhere they used to appear. */
const RETIRED = ['1860-2662-345', '18602662345', '080-46110007', '08046110007'];

/** Her list, in her order. */
const APPROVED_NUMBERS = ['14416', '+91 9999666555', '044-24640050', '9152987821'];

describe('E17-S7 — the two signed replies', () => {
  it('serves the S3 reply exactly as signed, paragraph for paragraph', () => {
    expect(A8_S3_GROUNDING_RESPONSE).toBe(approved.s3_reply_paragraphs.join('\n\n'));
  });

  it('serves the S4 card exactly as signed, paragraph for paragraph', () => {
    expect(CRISIS_RESPONSE).toBe(approved.s4_card_paragraphs.join('\n\n'));
  });

  it('matches the helpline sentence she wrote into both cards', () => {
    expect(HELPLINE_INLINE).toBe(approved.helpline_inline);
    expect(A8_S3_GROUNDING_RESPONSE).toContain(HELPLINE_INLINE);
    expect(CRISIS_RESPONSE).toContain(HELPLINE_INLINE);
  });

  it('is pinned to the document the sign-off was received in', () => {
    // sha256 of "Okuvu E17-S7 — Clinical Sign-off Response.docx", received by
    // email on 31 Oct 2026. Recorded so the fixture cannot drift from the
    // document it claims to quote.
    expect(approved.source_docx_sha256).toBe(
      'af36ceb9ca7b3995d2299670d9d4d32a515f67190da810a212d7903d5290a1c9',
    );
  });

  it('keeps the four things her text deliberately removed out of the S3 reply', () => {
    // Her §"Removed:" paragraph. "112" is included on purpose: she struck the
    // "if anyone is in immediate danger, call 112" sentence from S3, and it must
    // not creep back in.
    expect(A8_S3_GROUNDING_RESPONSE).not.toContain("I'm not going anywhere");
    expect(A8_S3_GROUNDING_RESPONSE).not.toContain('if one is closed or busy');
    expect(A8_S3_GROUNDING_RESPONSE).not.toMatch(/112/);
    expect(A8_S3_GROUNDING_RESPONSE).toContain('You can keep writing here as well');
  });

  it('keeps the therapist referral she added to the S4 card', () => {
    expect(CRISIS_RESPONSE).toContain(
      'I would suggest that you let your therapist or someone you trust know.',
    );
    expect(CRISIS_RESPONSE).not.toMatch(/NIMHANS|080-46110007/);
    expect(CRISIS_RESPONSE).not.toMatch(/112/);
  });
});

describe('E17-S7 — her condition: the corrected list replaces the old one everywhere', () => {
  // Her condition names four fixed replies by function, plus the third-party
  // card, the A9-post list and the app's crisis screen. The app is checked in
  // the Flutter suite (test/features/safety/approved_copy_test.dart); the rest
  // is here.
  const fixedReplies: Array<[string, string]> = [
    ['classifier-unavailable', SAFETY_UNAVAILABLE_RESPONSE],
    ['budget-paused', BUDGET_PAUSED_RESPONSE],
    ['reply-model-unavailable', MODEL_UNAVAILABLE_RESPONSE],
    ['medical + crisis overlap', MEDICAL_EMERGENCY_CRISIS_RESPONSE],
    ['third-party crisis', CRISIS_THIRD_PARTY_RESPONSE],
  ];

  it.each(fixedReplies)('%s names Tele-MANAS and no retired number', (_label, text) => {
    expect(text).toContain('14416');
    for (const retired of RETIRED) expect(text).not.toContain(retired);
  });

  it.each(fixedReplies)('%s keeps the numbers in her order', (_label, text) => {
    const positions = APPROVED_NUMBERS.map((n) => text.indexOf(n));
    // Some replies name a subset; whatever they name must be in her order.
    const present = positions.filter((i) => i > -1);
    expect(present.length).toBeGreaterThan(0);
    expect(present).toEqual([...present].sort((a, b) => a - b));
  });

  it('gives the A9-post reviewer the corrected approved set, not the retired one', () => {
    const prompt = buildA9PostPrompt('a draft', 'S1', 'no care plan');
    for (const number of APPROVED_NUMBERS) expect(prompt).toContain(number);
    for (const retired of RETIRED) expect(prompt).not.toContain(retired);
    // NIMHANS is dropped from the set, and the prompt must say so rather than
    // leave a reviewer guessing whether its absence is an oversight.
    expect(prompt).not.toMatch(/NIMHANS/);
  });
});

describe('E17-S7 — the gate still scores the signed copy as passing', () => {
  // Appendix A step 2 of her sign-off, as a test so CI keeps it true:
  // the gate's own scorer, the gold set's crisis scenarios, the text
  // production actually serves for each of them.
  const goldSet = JSON.parse(
    readFileSync(join(here, '../../eval/gold-set.json'), 'utf-8'),
  ) as { scenarios: Array<{ id: string; category: string; message: string }> };
  const crisis = goldSet.scenarios.filter((s) => s.category === 'crisis_self_harm');

  function servedTexts(message: string): Array<[string, string, 'crisis' | 'grounding']> {
    if (hasThirdPartyCrisisLanguage(message)) return [['third-party', THIRD_PARTY, 'crisis']];
    if (hasSelfIngestion(message)) return [['medical overlap', MEDICAL_CRISIS, 'crisis']];
    return [
      ['S4 card', CRISIS_RESPONSE, 'crisis'],
      ['S3 reply', A8_S3_GROUNDING_RESPONSE, 'grounding'],
    ];
  }

  it.each(crisis.map((s) => [s.id, s] as const))('%s passes on every text it can be served', (_id, scenario) => {
    for (const [label, text, path] of servedTexts(scenario.message)) {
      expect(scoreScenario(scenario as never, text, path), `${label} @ ${path}`).toEqual([]);
    }
  });

  it('is not vacuous: the scorer fails a card with no channels in it', () => {
    const csh01 = crisis.find((s) => s.id === 'csh-01')!;
    expect(scoreScenario(csh01 as never, 'I am here to support you.', 'crisis').length).toBeGreaterThan(0);
  });
});
