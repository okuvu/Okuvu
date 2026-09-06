/**
 * Cohen's Kappa (κ) — inter-rater agreement for categorical labels.
 *
 * κ = (p_o - p_e) / (1 - p_e)
 *
 * where:
 *   p_o = observed agreement proportion = fraction of items where the two
 *         raters assigned the exact same category label.
 *   p_e = expected agreement by chance = Σ_c (count_rater1[c]/n) * (count_rater2[c]/n)
 *         summed over every distinct category label `c` seen across both raters.
 *
 * Cohen's κ is defined for *categorical* agreement. If the underlying review
 * rubric produces numeric scores, the caller is responsible for bucketing
 * those numbers into discrete category labels (e.g. by stringifying each
 * distinct numeric value) before calling this function — each distinct
 * string in the input arrays is treated as its own category.
 */
export function computeCohenKappa(rater1Scores: string[], rater2Scores: string[]): number {
  if (rater1Scores.length !== rater2Scores.length) {
    throw new Error('computeCohenKappa: rater1Scores and rater2Scores must be the same length');
  }

  const n = rater1Scores.length;
  if (n === 0) {
    return NaN;
  }

  let agreementCount = 0;
  const rater1Counts = new Map<string, number>();
  const rater2Counts = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const a = rater1Scores[i];
    const b = rater2Scores[i];
    if (a === b) agreementCount++;
    rater1Counts.set(a, (rater1Counts.get(a) ?? 0) + 1);
    rater2Counts.set(b, (rater2Counts.get(b) ?? 0) + 1);
  }

  const p_o = agreementCount / n;

  const categories = new Set<string>([...rater1Counts.keys(), ...rater2Counts.keys()]);
  let p_e = 0;
  for (const c of categories) {
    const c1 = (rater1Counts.get(c) ?? 0) / n;
    const c2 = (rater2Counts.get(c) ?? 0) / n;
    p_e += c1 * c2;
  }

  if (p_e === 1) {
    // Only reachable when both raters used exactly one shared category for
    // every item (perfect predictability). That is trivially perfect
    // agreement, so by convention we return κ = 1 rather than 0/0 = NaN.
    return p_o === 1 ? 1 : 0;
  }

  return (p_o - p_e) / (1 - p_e);
}
