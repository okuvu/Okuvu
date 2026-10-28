/**
 * E17-S6 — deterministic, zero-cost crisis-language screen.
 *
 * This is the S4 branch of A1's canned-mode heuristic (`agents/a1/agent.ts`)
 * lifted into its own module so there is exactly one keyword list: the canned
 * classifier reads it, and the budget gate reads it to decide whether an
 * over-budget turn may still run. Two copies of a crisis keyword list is the
 * kind of drift that ends with one path recognising a disclosure and the other
 * not.
 *
 * It is deliberately NOT a classifier and must never be treated as one: it
 * matches explicit, literal S4 phrasing only, with no context, negation or
 * idiom handling ("I could kill myself laughing" matches; "I don't want to be
 * here anymore" does not). Its only uses are all conservative — each one can
 * only ever make the pipeline serve a *more* protective path:
 *   • A1 canned/sandbox mode, which never calls a model,
 *   • the budget gate, where a match can only ever *admit* an otherwise
 *     refused turn, and
 *   • E17-S4: A1's own fallback, when the classifier is unreachable — a match
 *     there sets S4 and runs the crisis path with no model involved, so a
 *     technical failure can never answer a disclosure with chat.
 * A false positive costs one crisis card. A false negative changes nothing
 * here, because every turn that is *not* in a technical failure still goes
 * through A1's real classification.
 */
export const S4_CRISIS_PATTERN = /\b(kill myself|suicide|end my life|want to die|end it all)\b/;

export function hasCrisisLanguage(message: string): boolean {
  return S4_CRISIS_PATTERN.test(message.toLowerCase());
}
