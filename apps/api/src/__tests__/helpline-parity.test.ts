/**
 * The chat copy and the structured list must agree.
 *
 * `HELPLINE_BLOCK` is what a client sees in a chat reply; `HELPLINES` is what the
 * portal's safety-plan editor and the app's crisis screen render. They are two
 * renderings of one clinical decision, so this pins them to each other: same
 * five services, same numbers, same order. A number changed in one place and
 * not the other is how a therapist's plan ends up offering a retired line.
 */
import { describe, expect, it } from 'vitest';
import { HELPLINES } from '@okuvu/shared-types/safety';
import { HELPLINE_BLOCK } from '../pipeline/fallbacks.js';

describe('HELPLINE_BLOCK vs the central list', () => {
  const lines = HELPLINE_BLOCK.split('\n');

  it('is five lines, one service per line', () => {
    expect(lines).toHaveLength(5);
    expect(lines).toHaveLength(HELPLINES.length);
  });

  it('names the same services, with the same numbers, in the same order', () => {
    HELPLINES.forEach((line, index) => {
      expect(lines[index].startsWith(`${line.name}: ${line.display}`)).toBe(true);
    });
  });

  it('carries no number outside the central list', () => {
    const listed = new Set(HELPLINES.map((line) => line.phone.replace(/\D/g, '')));
    const numbers = HELPLINE_BLOCK.match(/\d[\d\s-]{4,}/g) ?? [];
    for (const number of numbers) {
      expect(listed.has(number.replace(/\D/g, ''))).toBe(true);
    }
  });
});
