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
 */
export const A2_PROMPT_VERSION = 'v2.3';

export const A2_PROMPT = readFileSync(
  join(__dirname, 'a2-okuvu-v2.3.txt'),
  'utf-8',
);
