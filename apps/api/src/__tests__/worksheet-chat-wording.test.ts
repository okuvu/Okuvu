/**
 * The chat's worksheet paragraph, pinned (v2.7).
 *
 * The owner approves all chat wording, and this paragraph is the one place the
 * companion is allowed to bring a worksheet up. So the test is a copy gate, not
 * a behaviour probe: it asserts the sentences he approved are present, that the
 * clause he replaced is gone, and that the prohibitions that stop the model
 * doing the worksheet for the client are all there.
 *
 * Written as exact substrings rather than a hash on purpose: a hash tells you
 * "something changed", which sends the next person diffing a 55 KB file. A
 * failing sentence here names the line a reviewer needs to look at.
 */

import { describe, expect, it } from 'vitest';
import { A2_PROMPT, A2_PROMPT_VERSION } from '../prompts/index.js';

const START = 'Worksheets. Some of the Library';
const END = '# 7.1 One next move';

function paragraph(): string {
  const start = A2_PROMPT.indexOf(START);
  expect(start).toBeGreaterThan(-1);
  // The paragraph ends where the §7.1 heading begins.
  const end = A2_PROMPT.indexOf(END, start);
  expect(end).toBeGreaterThan(start);
  return A2_PROMPT.slice(start, end);
}

describe('the v2.7 worksheets paragraph', () => {
  it('sits under Toolkit, before §7.1', () => {
    expect(A2_PROMPT_VERSION).toBe('v2.7');
    const toolkit = A2_PROMPT.indexOf('Toolkit. You work from the OKUVU tools library');
    const start = A2_PROMPT.indexOf(START);
    const section = A2_PROMPT.indexOf('# 7.1 One next move');
    expect(toolkit).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(toolkit);
    expect(section).toBeGreaterThan(start);
  });

  it('permits exactly three things: naming, encouraging, one open question', () => {
    const text = paragraph();
    expect(text).toContain('You may name one worksheet that fits what they are describing');
    expect(text).toContain('You may encourage them');
    expect(text).toContain('you may ask one open question so they find their own words');
  });

  it('forbids writing the answer, in the owner’s words', () => {
    const text = paragraph();
    expect(text).toContain('You must never do the worksheet for them');
    expect(text).toContain('Do not write, draft, suggest or complete an answer');
    expect(text).toContain("not a thought record's \"balanced thought\"");
    expect(text).toContain('not "another way to see it"');
    expect(text).toContain('Never tell them a thought is wrong');
    // His edit: the trap ban is about what the client said, and the worksheet's
    // name is allowed.
    expect(text).toContain('thinking trap in what they said. You may say the name of the worksheet');
    // The clause his edit replaced must be gone.
    expect(text).not.toContain('or name a thinking trap at all');
    expect(text).toContain('Never explain the step by describing the answer you are not giving');
  });

  it('carries the four sentences the owner added', () => {
    const text = paragraph();
    expect(text).toContain(
      'Do not suggest a worksheet when they are very distressed or in crisis. Help them settle first.',
    );
    expect(text).toContain(
      'Only suggest worksheets they can open on their own, or ones their therapist has assigned to them.',
    );
    expect(text).toContain(
      'Never suggest the Unsent letter, A letter from a kind friend, or any other high-load worksheet unless their therapist assigned it.',
    );
    expect(text).toContain(
      "Suggest one worksheet at a time. If they say no or ignore it, don't suggest a worksheet again in this conversation.",
    );
  });

  it('points at the list, and knows nothing outside it', () => {
    const text = paragraph();
    expect(text).toContain('You may suggest a worksheet only if it is in the Library list you were given');
    expect(text).toContain('If it is not there, you do not know it exists');
    expect(text).toContain('${library_worksheets}');
    // The list's three facts are named, so the model knows what the lines mean.
    expect(text).toContain('whether it is light or demanding');
    expect(text).toContain('whether they can open it themselves or their therapist assigned it');
  });

  it('never mentions the exposure ladder — it is therapist-only (rule 6)', () => {
    expect(paragraph().toLowerCase()).not.toContain('exposure ladder');
    expect(paragraph().toLowerCase()).not.toContain('ladder');
  });
});
