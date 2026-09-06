import { describe, it, expect } from 'vitest';
import { computeCohenKappa } from '../lib/kappa';

describe('computeCohenKappa', () => {
  it('returns 1.0 when both raters agree on every item', () => {
    const rater1 = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'];
    const rater2 = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'];
    expect(computeCohenKappa(rater1, rater2)).toBeCloseTo(1.0, 10);
  });

  it('returns kappa = 1 for the trivial single-shared-category edge case', () => {
    // Both raters only ever use category "A": p_o = 1, p_e = 1.
    const rater1 = ['A', 'A', 'A'];
    const rater2 = ['A', 'A', 'A'];
    expect(computeCohenKappa(rater1, rater2)).toBe(1);
  });

  it('matches a hand-computed reference value (kappa = 0.4)', () => {
    // Hand-computed per the standard Cohen's kappa formula:
    //   idx:      1    2    3    4    5    6    7    8    9    10
    //   rater1:   Yes  Yes  Yes  Yes  Yes  No   No   No   No   No
    //   rater2:   Yes  Yes  Yes  No   No   Yes  No   No   No   No
    // Matches at indices 1,2,3,7,8,9,10 -> 7/10 -> p_o = 0.7
    // rater1 counts: Yes=5, No=5 (n=10)
    // rater2 counts: Yes=4 (idx 1,2,3,6), No=6
    // p_e = (5/10)*(4/10) + (5/10)*(6/10) = 0.2 + 0.3 = 0.5
    // kappa = (0.7 - 0.5) / (1 - 0.5) = 0.2 / 0.5 = 0.4
    const rater1 = ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'No', 'No', 'No', 'No'];
    const rater2 = ['Yes', 'Yes', 'Yes', 'No', 'No', 'Yes', 'No', 'No', 'No', 'No'];
    expect(computeCohenKappa(rater1, rater2)).toBeCloseTo(0.4, 10);
  });

  it('produces kappa near 0 for effectively-random agreement', () => {
    // Hand-computed: two balanced binary raters, independently assigned so
    // that observed agreement matches what chance alone predicts.
    //   idx:      1   2   3   4   5   6   7   8
    //   rater1:   A   A   A   A   B   B   B   B
    //   rater2:   A   A   B   B   A   A   B   B
    // Matches at indices 1,2,7,8 -> 4/8 -> p_o = 0.5
    // rater1 counts: A=4, B=4 (n=8) -> 0.5/0.5
    // rater2 counts: A=4, B=4 (n=8) -> 0.5/0.5
    // p_e = 0.5*0.5 + 0.5*0.5 = 0.5
    // kappa = (0.5 - 0.5) / (1 - 0.5) = 0
    const rater1 = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];
    const rater2 = ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'];
    expect(computeCohenKappa(rater1, rater2)).toBeCloseTo(0, 10);
  });

  it('returns -1 for perfect systematic disagreement between two balanced categories', () => {
    const rater1 = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'];
    const rater2 = ['B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A'];
    expect(computeCohenKappa(rater1, rater2)).toBeCloseTo(-1.0, 10);
  });

  it('throws if the two rater arrays have different lengths', () => {
    expect(() => computeCohenKappa(['A'], ['A', 'B'])).toThrow();
  });

  it('returns NaN for two empty arrays', () => {
    expect(computeCohenKappa([], [])).toBeNaN();
  });
});
