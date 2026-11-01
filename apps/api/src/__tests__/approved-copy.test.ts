/**
 * E17-S7 — the signed copy, pinned.
 *
 * Dr Shubhangi Goswami's record revision 6 (1 November 2026, IST) is the
 * document of record. It supersedes revisions 1–5 and the returned signed form
 * of 31 October, and §9 says any later edit to the approved texts voids the
 * approval for the edited text: it goes back to her before it changes.
 *
 * A comment in the source file cannot enforce that. So this test compares the
 * served strings against the paragraphs of her documents, extracted verbatim
 * into `fixtures/e17-s7-approved-copy.json` by
 * `fixtures/build_e17s7_fixture.py` (which fails if a string is not in the
 * document). If the fixture and the code disagree, the copy changed after
 * approval and this fails.
 *
 * Do NOT "fix" a failure here by regenerating the fixture. Regenerating it is
 * only correct when a *new* signed document exists; otherwise the code is what
 * is wrong.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as fallbacks from '../pipeline/fallbacks.js';
import {
  A8_S3_GROUNDING_RESPONSE,
  CRISIS_RESPONSE,
  CRISIS_THIRD_PARTY_RESPONSE,
  HELPLINE_BLOCK,
  HELPLINE_SHORT_LINE,
  COME_BACK_CLOSING,
  BUDGET_PAUSED_RESPONSE,
  SAFETY_UNAVAILABLE_RESPONSE,
  MODEL_UNAVAILABLE_RESPONSE,
  MEDICAL_EMERGENCY_CRISIS_RESPONSE,
  A9_POST_S2_FALLBACK,
  A2_DEGRADED_RESPONSE,
} from '../pipeline/fallbacks.js';
import { buildA9PostPrompt } from '../agents/a9-post/prompts.js';
import { scoreScenario } from '../eval/gate-scoring.js';
import { hasSelfIngestion, hasThirdPartyCrisisLanguage } from '../agents/a1/crisis-keywords.js';

const here = dirname(fileURLToPath(import.meta.url));
const approved = JSON.parse(
  readFileSync(join(here, 'fixtures', 'e17-s7-approved-copy.json'), 'utf-8'),
) as {
  source_docx_sha256: string;
  s3_s4_source_docx_sha256: string;
  helpline_block: string;
  helpline_block_lines: string[];
  helpline_short_line: string;
  come_back_closing: string;
  s3_opening: string;
  s3_lead: string;
  s3_closing: string;
  s4_lead: string;
  s4_closing: string;
  shipping_texts: Record<string, string>;
};

/** The two signed replies, rebuilt from the document's own pieces. */
const signedS3 = [approved.s3_opening, `${approved.s3_lead}\n${approved.helpline_block}`, approved.s3_closing].join('\n\n');
const signedS4 = [`${approved.s4_lead}\n${approved.helpline_block}`, approved.s4_closing].join('\n\n');

/** Numbers her decision retires, everywhere they used to appear. */
const RETIRED = ['1860-2662-345', '18602662345', '080-46110007', '08046110007', 'NIMHANS'];

/** Her block, in her order. 112 is third, not last. */
const APPROVED_NUMBERS = [
  '14416',
  '+91 9999 666 555',
  'Emergency services: 112',
  '044-24640050',
  '9152987821',
];

/** The three phrases the promise rule strikes, failure paths included (§1.1). */
const PROMISES = ["I'm not going anywhere", "I'll stay with you", "I'm still here with you"];

/** Every governed constant in fallbacks.ts — the set the rules apply to. */
const GOVERNED = Object.entries(fallbacks).filter(
  ([name, value]) => typeof value === 'string' && name !== 'HELPLINE_SHORT_LINE',
) as Array<[string, string]>;

describe('E17-S7 rev 6 — the helpline block', () => {
  it('is the five lines she wrote, in her order, one service per line', () => {
    expect(HELPLINE_BLOCK).toBe(approved.helpline_block);
    expect(HELPLINE_BLOCK.split('\n')).toEqual(approved.helpline_block_lines);
  });

  it('carries her hours, not the old ones', () => {
    // iCall: TISS's own page says 10am–8pm; the shipped copy said 8am–9pm.
    expect(HELPLINE_BLOCK).toContain('iCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)');
    expect(HELPLINE_BLOCK).not.toContain('8 am');
    expect(HELPLINE_BLOCK).not.toContain('9 pm');
    expect(HELPLINE_BLOCK).toContain('SNEHA, Chennai: 044-24640050 (10am-10pm, every day)');
    expect(HELPLINE_BLOCK).toContain('Vandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)');
  });

  it('is pinned to the document that approved it', () => {
    expect(approved.source_docx_sha256).toBe(
      'bd352726ad83fdac3aa21e73508edc0a7f9c66853ecdb01b1d3f65317658c67b',
    );
    expect(approved.s3_s4_source_docx_sha256).toBe(
      'a0204cd69850dee7464c1a91d6dd2d7aa30e2c020fc9078543c308fb40af8e7c',
    );
  });

  it('carries the short line and the closing line she specified', () => {
    expect(HELPLINE_SHORT_LINE).toBe(approved.helpline_short_line);
    expect(COME_BACK_CLOSING).toBe(approved.come_back_closing);
    expect(A9_POST_S2_FALLBACK).toContain(HELPLINE_SHORT_LINE);
    expect(A2_DEGRADED_RESPONSE).toContain(HELPLINE_SHORT_LINE);
  });
});

describe('E17-S7 rev 6 — the twelve strings', () => {
  // §4.1–§4.9 are API constants. Each is asserted byte-for-byte against the
  // paragraph of her document, so a sharpened sentence fails here rather than
  // shipping under an approval it no longer has.
  const shipping = Object.entries(approved.shipping_texts);
  it.each(shipping)('%s is served exactly as approved', (name, text) => {
    expect((fallbacks as unknown as Record<string, unknown>)[name], name).toBe(text);
  });

  it('serves the S3 reply exactly as signed, with the block inside it', () => {
    expect(A8_S3_GROUNDING_RESPONSE).toBe(signedS3);
    expect(A8_S3_GROUNDING_RESPONSE).toContain(HELPLINE_BLOCK);
  });

  it('serves the S4 card exactly as signed, with the block inside it', () => {
    expect(CRISIS_RESPONSE).toBe(signedS4);
    expect(CRISIS_RESPONSE).toContain(HELPLINE_BLOCK);
  });

  it('keeps 112 in the S3 reply, which she has since stated is intended (§5.2)', () => {
    expect(A8_S3_GROUNDING_RESPONSE).toContain('Emergency services: 112');
    expect(CRISIS_RESPONSE).toContain('Emergency services: 112');
  });

  it('keeps the therapist referral she added to the S4 card', () => {
    expect(CRISIS_RESPONSE).toContain(
      'I would suggest that you let your therapist or someone you trust know.',
    );
  });

  it('gives the friend card her block and keeps 112 in the body', () => {
    expect(CRISIS_THIRD_PARTY_RESPONSE).toContain(HELPLINE_BLOCK);
    expect(CRISIS_THIRD_PARTY_RESPONSE).toContain('call 112 for emergency help');
  });
});

describe('E17-S7 rev 6 — the promise rule (§1.1)', () => {
  it.each(GOVERNED)('%s makes no promise the product cannot keep', (_name, text) => {
    for (const promise of PROMISES) expect(text).not.toContain(promise);
  });

  it('closes on the invitation she specified, not on a claim of presence', () => {
    for (const text of [BUDGET_PAUSED_RESPONSE, SAFETY_UNAVAILABLE_RESPONSE]) {
      expect(text.endsWith(COME_BACK_CLOSING)).toBe(true);
    }
    expect(MODEL_UNAVAILABLE_RESPONSE).not.toContain('still be here');
    expect(MODEL_UNAVAILABLE_RESPONSE).not.toContain("I'm here with you");
  });
});

describe('E17-S7 rev 6 — retired numbers stay retired, everywhere', () => {
  it.each(GOVERNED)('%s names no retired number', (_name, text) => {
    for (const retired of RETIRED) expect(text).not.toContain(retired);
  });

  it('names the four services in her order wherever it names them', () => {
    const replies = [A8_S3_GROUNDING_RESPONSE, CRISIS_RESPONSE, BUDGET_PAUSED_RESPONSE,
      SAFETY_UNAVAILABLE_RESPONSE, MODEL_UNAVAILABLE_RESPONSE, MEDICAL_EMERGENCY_CRISIS_RESPONSE,
      CRISIS_THIRD_PARTY_RESPONSE];
    for (const text of replies) {
      const positions = APPROVED_NUMBERS.map((n) => text.indexOf(n)).filter((i) => i > -1);
      expect(positions.length).toBe(APPROVED_NUMBERS.length);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('gives the A9-post reviewer the corrected approved set, not the retired one', () => {
    const prompt = buildA9PostPrompt('a draft', 'S1', 'no care plan');
    // The prompt names services and numbers inline ("Emergency services (112)"),
    // so it is checked on the numbers themselves.
    const promptNumbers = ['14416', '+91 9999 666 555', '112', '044-24640050', '9152987821'];
    for (const number of promptNumbers) expect(prompt).toContain(number);
    const positions = promptNumbers.map((n) => prompt.indexOf(n));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const retired of RETIRED) expect(prompt).not.toContain(retired);
    // She retired one service from the set; the prompt must say the set is
    // closed and current, without naming the retired number back to the model.
    expect(prompt).toContain('1 November 2026');
  });
});

describe('E17-S7 rev 6 §4.10 — SAFE_FALLBACK is gone', () => {
  it('is not in the code anywhere, so no user can receive the old wording', () => {
    const root = join(here, '..');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && !path.includes('__tests__')) {
          if (readFileSync(path, 'utf-8').includes("I'm here to support you")) hits.push(path);
        }
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });

  it('has no SAFE_FALLBACK export left to reach for', () => {
    expect('SAFE_FALLBACK' in fallbacks).toBe(false);
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
    if (hasThirdPartyCrisisLanguage(message)) return [['third-party', CRISIS_THIRD_PARTY_RESPONSE, 'crisis']];
    if (hasSelfIngestion(message)) return [['medical overlap', MEDICAL_EMERGENCY_CRISIS_RESPONSE, 'crisis']];
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
