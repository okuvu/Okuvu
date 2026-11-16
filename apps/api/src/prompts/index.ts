import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Kept in sync with the filename by hand — there is no other source of truth
 * for this version string (see prompt-hash.ts's manifest, which duplicates it
 * the same way).
 *
 * v2.0 → v2.1 (OKUVU — Plumbing Fixes & Rationale v1.0, fix A2): §3.1 added —
 * continuity is the default; short affirmations never trigger a
 * new-session/onboarding branch. The doc also fixes the underlying WIRING:
 * the orchestrator now passes the current session's own turns into
 * `recentHistory` (see orchestrator.ts), which this version pairs with.
 *
 * v2.1 → v2.2: §7.1 added — one concrete step per distress reply, chosen by
 * presentation (anhedonia, grief, panic, health anxiety), not one move for
 * everything.
 *
 * v2.2 → v2.3 (E17-S14): the tone_alliance gap the v2 gate measured was
 * structural, not missing prose. Three fixes, all inside the prompt:
 *   1. §7.1 stopped contradicting the product's own requirements — it now
 *      reconciles "one step" with the ambiguous case (a small menu), the
 *      request for quiet (no step at all) and the closing turn (no new step
 *      or question), and says so in words with an explicit precedence order.
 *   2. §3.1's continuity rule was stated and inert; §3.1.1 now carries the
 *      continuation exchanges written out in full — five PASS, five FAIL —
 *      so the rule exists as a shape to copy rather than a sentence to agree
 *      with. §3's "answers are monosyllabic → going nowhere" no longer
 *      licenses a close or a restart on "okay"/"k"/"yeah".
 *   3. §3.1.2 bans the restart openers the model actually produced on
 *      continuation turns.
 * No threshold, gold-set scenario, judge prompt or instrument file moved.
 *
 * v2.3 → v2.4 (E17-S14): scope_boundary regressed under v2.3 (9 failing
 * judgements per run under v2.2, then 13, 13, 17) because the reply declined
 * vaguely and then pivoted to a question or a technique without ever naming
 * the professional route the requirement asks for. Two fixes, both additive;
 * v2.3's ladder, continuation exchanges and banned-phrase list are untouched:
 *   1. §5.1 is new — on four topics only (medication, diagnosis, clinical
 *      documentation, interpretation-as-diagnosis) the reply must NAME who
 *      can answer, and a technique, a "free tool" or a further question may
 *      not stand in for that name. Eight PASS/FAIL exchanges in the §3.1.1
 *      style. §1 and §5 now route medication and diagnosis to the prescriber,
 *      doctor or psychiatrist rather than "your therapist", who cannot
 *      prescribe or diagnose.
 *   2. §7.1's grief, caregiver-burnout and health-anxiety-checking rows are
 *      split and sharpened, with three exchanges written out in §7.2, so a
 *      breathing exercise stops being the answer to all three.
 * No threshold, gold-set scenario, judge prompt or instrument file moved.
 *
 * v2.4 → v2.5: a layout change, for cost, with no change to a rule, threshold,
 * example, banned phrase or clinical sentence. The ten per-turn values used to
 * be interpolated into the body — the first at 6% depth — so the prompt differed
 * from byte 3,093 onward on every single turn. A provider prompt cache matches a
 * prefix from byte zero, which meant ~848 of A2's 12,634 instruction tokens were
 * reusable and the other 11.8k were re-billed on every call. §12 at the end of
 * the file now carries the values and the body only names the fields, so the
 * instruction block is byte-identical turn to turn: the first `${` moved from
 * 6% depth to 98.96% depth, and the cacheable prefix from ~7% to ~99%.
 * The substitution contract in agents/a2/prompts.ts is unchanged — same ten
 * `${snake_case}` tokens, just relocated.
 * Measured cacheability and the hash of both files: evidence/E17-S14-prompt-v25.md.
 */
export const A2_PROMPT_VERSION = 'v2.5';

export const A2_PROMPT = readFileSync(
  join(__dirname, 'a2-okuvu-v2.5.txt'),
  'utf-8',
);
