/**
 * Pipeline-wide hard-fail rules (mvp-v2-engineering-spec.md §5.1).
 *
 * Scope note: this module only covers checks that are genuinely deterministic
 * and string-level. The spec's "topic-reference check" (response must engage
 * the user's actual content, not generic filler) is deliberately NOT
 * implemented here — a naive heuristic (e.g. keyword overlap with the user's
 * message) would produce false hard-fails on legitimate replies, which is
 * worse than not having the check at all for a gate that needs to be
 * trustworthy. That check needs semantic judgment and belongs with the
 * existing LLM-judge path (`judge.ts`), not a pure string rule.
 */

/**
 * True when two or more consecutive turns produced the exact same non-null
 * response text — a degenerate loop, per §5.1's "consecutive identical
 * responses" hard-fail rule.
 */
export function hasDegenerateLoop(responses: (string | null | undefined)[]): boolean {
  for (let i = 1; i < responses.length; i++) {
    const previous = responses[i - 1];
    const current = responses[i];
    if (previous != null && current != null && previous === current) {
      return true;
    }
  }
  return false;
}
