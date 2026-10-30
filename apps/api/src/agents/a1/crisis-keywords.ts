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
 * matches explicit, literal, self-directed S4 phrasing only, with no context
 * handling and no negation handling ("I don't want to die" still matches, on
 * purpose). The one concession is a narrow set of idiom guards, listed under
 * `S4_CRISIS_PATTERN`: they exist so that the small number of everyday
 * sentences built out of the same words ("I could kill myself laughing", "I
 * want to die of embarrassment") do not pull a crisis card. They never remove
 * the term itself — only the one continuation that makes it an idiom.
 *
 * It is also deliberately blind to *third-party* risk phrasing: "killing
 * herself" and "my friend wants to die" are not matched. The crisis card is
 * written in the second person, so serving it for a friend's risk would tell
 * the user to call a helpline about themselves, which is the wrong
 * instruction. Those turns are handled by the S3 grounding copy, which carries
 * the same approved helplines without assuming who is at risk.
 *
 * Its uses are all conservative — each one can only ever make the pipeline
 * serve a *more* protective path:
 *   • A1 canned/sandbox mode, which never calls a model,
 *   • the budget gate, where a match can only ever *admit* an otherwise
 *     refused turn, and
 *   • E17-S4: A1's own fallback, when the classifier is unreachable — a match
 *     there sets S4 and runs the crisis path with no model involved, so a
 *     technical failure can never answer a disclosure with chat,
 *   • E17-S10: the per-turn floor in `pipeline/orchestrator.ts`, which runs on
 *     every turn — an explicit disclosure routes to S4 even when a confident
 *     model classification said S1/S2/S3. The floor can only raise the state,
 *     never lower it, and the turn records that the keywords raised it.
 *
 * A false positive costs one crisis card. A false negative is a user in crisis
 * answered by whatever the model happened to classify — which is exactly what
 * scored 6/10 on crisis_self_harm (evidence/E17-S5b-merged.md).
 */
export const S4_CRISIS_PATTERN =
  // Explicit self-directed intent. Every alternative is something a person
  // says about *themselves*; the negative lookaheads are the idiom guards.
  //
  //   "kill myself" / "killing myself" / "killed myself"
  //     but not "I could kill myself laughing"      → (?!\s+laughing)
  //   "want to die"
  //     but not "want to die of embarrassment",
  //             "want to die laughing"              → (?!\s+(?:of|laughing))
  //
  // The guards are deliberately as narrow as the idioms they exclude: any
  // other continuation after the phrase still matches.
  /\b(?:(?:kill|killing|killed) myself(?!\s+laughing)|suicid(?:e|al)|end(?:ing)? my life|tak(?:e|ing) my (?:own )?life|end(?:ing)? it all|want to die(?!\s+(?:of|laughing))|don['’]?t want to (?:live|be alive)|no reason to live|life (?:isn['’]?t|is not) worth living)\b/;

export function hasCrisisLanguage(message: string): boolean {
  return S4_CRISIS_PATTERN.test(message.toLowerCase());
}
