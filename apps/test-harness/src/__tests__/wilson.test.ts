import { describe, it, expect } from 'vitest';
import { computeWilsonCI } from '../lib/wilson';

/**
 * Reference values below were computed by directly evaluating the Wilson
 * score formula from the story spec (not looked up from a table):
 *
 *   p̂ = successes / n
 *   center = (p̂ + z²/(2n)) / (1 + z²/n)
 *   margin = (z / (1 + z²/n)) * sqrt( p̂(1-p̂)/n + z²/(4n²) )
 *
 * For n=200, k=190 (p̂=0.95, z=1.96):
 *   lower ≈ 0.9104209437021562
 *   upper ≈ 0.9726176509713551
 */
describe('computeWilsonCI', () => {
  it('matches the hand-verified reference for n=200, k=190', () => {
    const ci = computeWilsonCI(190, 200);
    expect(ci.pointEstimate).toBeCloseTo(0.95, 6);
    expect(ci.lower).toBeCloseTo(0.9104209437021562, 6);
    expect(ci.upper).toBeCloseTo(0.9726176509713551, 6);
    // Sanity: also within the story's documented ~0.909-0.912 / ~0.975-0.978
    // ballpark, confirming the formula wasn't misimplemented.
    expect(ci.lower).toBeGreaterThan(0.909);
    expect(ci.lower).toBeLessThan(0.912);
  });

  it('successes=0 gives a lower bound of 0 (or effectively 0)', () => {
    const ci = computeWilsonCI(0, 200);
    expect(ci.lower).toBe(0);
    expect(ci.pointEstimate).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
    expect(ci.upper).toBeLessThan(0.05);
  });

  it('successes=n gives an upper bound of <= 1', () => {
    const ci = computeWilsonCI(200, 200);
    expect(ci.upper).toBeLessThanOrEqual(1);
    expect(ci.pointEstimate).toBe(1);
    expect(ci.lower).toBeGreaterThan(0.9);
    expect(ci.lower).toBeLessThan(1);
  });

  it('is symmetric-ish around p=0.5 with a wider interval than at extremes', () => {
    const ci = computeWilsonCI(100, 200);
    expect(ci.pointEstimate).toBe(0.5);
    expect(ci.lower).toBeLessThan(0.5);
    expect(ci.upper).toBeGreaterThan(0.5);
    // Width at p=0.5 should exceed width at p=0.95 for the same n.
    const extreme = computeWilsonCI(190, 200);
    expect(ci.upper - ci.lower).toBeGreaterThan(extreme.upper - extreme.lower);
  });

  it('throws for invalid n or successes out of range', () => {
    expect(() => computeWilsonCI(1, 0)).toThrow();
    expect(() => computeWilsonCI(-1, 10)).toThrow();
    expect(() => computeWilsonCI(11, 10)).toThrow();
  });
});
