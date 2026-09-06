/**
 * TH-S15 — Wilson score confidence interval for a binomial proportion.
 *
 * Used to gate stochastic sampling runs: given `n` samples of which
 * `successes` passed some target metric, compute a confidence interval for
 * the true pass rate and gate on its lower bound rather than the raw point
 * estimate, so a small sample of good luck doesn't pass a flaky agent.
 *
 * This is the exact Wilson score interval (not the plain normal/Wald
 * approximation, which is a poor approximation for small n or p near 0/1):
 *
 *   p̂ = successes / n
 *   center = (p̂ + z²/(2n)) / (1 + z²/n)
 *   margin = (z / (1 + z²/n)) * sqrt( p̂(1-p̂)/n + z²/(4n²) )
 *   lower = center - margin
 *   upper = center + margin
 *
 * z defaults to 1.96 (~95% confidence).
 */
export interface WilsonCI {
  lower: number;
  upper: number;
  pointEstimate: number;
}

export function computeWilsonCI(successes: number, n: number, z = 1.96): WilsonCI {
  if (n <= 0 || !Number.isFinite(n)) {
    throw new Error(`computeWilsonCI: n must be a positive finite number, got ${n}`);
  }
  if (successes < 0 || successes > n) {
    throw new Error(`computeWilsonCI: successes (${successes}) must be within [0, n=${n}]`);
  }

  const pHat = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (pHat + z2 / (2 * n)) / denominator;
  const margin =
    (z / denominator) * Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n));

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    pointEstimate: pHat,
  };
}
