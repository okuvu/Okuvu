import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultPromptVersion } from './gate.js';

export { defaultPromptVersion, isEligibleAsDefault, PROMPT_GATE, promptGateEntry } from './gate.js';
export type { PromptGateEntry, PromptGateState } from './gate.js';

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
 * v2.4 → v2.5 (docs/plans/2026-11-22-care-plan-style-blocks.md, PR 1): §12 is
 * new — the care plan stops being a label plus one phrase and starts choosing
 * an emphasis. All three blocks live in this file so the hash and clinical
 * review cover them; buildConversationalPrompt() strips the two that do not
 * match the client's plan, so exactly one reaches the model. Precedence is
 * stated in the section itself: §6, §7.1 and §5.1 win on any disagreement, and
 * a client with no plan gets no block (§7.1 alone, never a default CP1).
 * Ships behind OKUVU_A2_CARE_PLAN_STYLE=on (default off) — new clinical prompt
 * text waits for a gold-set score and sign-off, not an image roll.
 * Measured cost (cl100k_base over the built prompt, not the file):
 *   v2.4 billed today                     12,606
 *   + cross-reference in §7 Pacing           39
 *   + §12 header + fallback + markers       140
 *   + the one block that plan carries    118-127
 *   → per turn when on               12,903-12,912 (+2.4%)
 * File growth (all three blocks, one billed): 568. Recoverable: the two
 * plan-flavoured pacing bullets in §7.1 (~14 tokens) say per-plan what the
 * blocks now say, so they can retire once every plan has a block and the
 * switch is on by default.
 *
 * v2.5 → v2.6 (clinical direction, Shubhangi Goswami, 23 Nov 2026): §7.1 rule
 * 1 was "offer exactly one step". It is now, in the arm the switch selects,
 * "ask first whether they would rather talk it through or try something" — the
 * client chooses, and talking is a legitimate move with no technique attached.
 * §7.1 exists because the v2 gate measured replies that validated and then
 * offered nothing; that failure is unchanged, because the question IS the move
 * in this arm. Six carve-outs keep it from swallowing work the prompt already
 * does well: high intensity and acute panic stay body-first (no preference
 * question in that moment), the rows that name their own move (acute grief,
 * caregiver burnout, the checking loop, self-criticism, "is this normal")
 * still supply it without a choice in front of them, and §5.1's refusal plus
 * named route is still the whole reply on its four topics.
 *
 * Both arms live in this file behind [[RULE1_STEP]] / [[RULE1_CHOICE]], so the
 * hash and clinical review cover what may ship and the gate can score both
 * arms from one artefact. buildConversationalPrompt() keeps exactly one and the
 * markers never reach the model. Drift falls back to the STEP arm — the arm in
 * production — which is the opposite direction from §12's "drop the section":
 * §12 can be dropped and the prompt is still coherent, but rules 2-5 assume
 * rule 1 decided the move.
 *
 * Ships behind OKUVU_A2_TALK_OR_DO=on (default off) like every other new
 * clinical prompt: sign-off is on record, the gold-set score is not yet run.
 * Measured cost (cl100k_base over the built prompt, not the file):
 *   v2.5 per plan (step arm, today)         12,903-12,912
 *   step arm, unchanged behaviour           12,954-12,963  (+51: header
 *     correction to the real model id, the two-line version note, and the
 *     arm-neutral wording of the §7.1 summary)
 *   choice arm                              13,332-13,341  (+378 vs the step
 *     arm, +2.9%, once the switch is on; +429 vs v2.5)
 * File growth (both arms, one billed): 1,977 bytes.
 * Also corrected in this version: the header named v2.4 and
 * Llama-3.1-8B-Instruct (OpenRouter), a copy-forward from the version written
 * before the Bedrock cutover — v2.6 names v2.6 and qwen.qwen3-32b-v1:0, and a
 * guard in a2.test.ts now fails if the header and A2_PROMPT_VERSION disagree or
 * name any vendor but Bedrock. v2.5's header stays wrong: superseded files are
 * frozen because their sha256 appears in the evidence records.
 *
 * v2.6 → v2.7 (owner-approved wording, Rajwant, 24 Nov 2026): a new paragraph
 * under Toolkit. The companion may name one worksheet, say what it is for in a
 * sentence, encourage, and ask one open question. It must never write, draft or
 * complete an answer, never tell the client a thought is wrong or that they are
 * in a thinking trap, and may say only the worksheet's name. Four sentences the
 * owner added on top of the proposal: no worksheet suggestion while someone is
 * very distressed or in crisis; only worksheets they can open themselves or
 * their therapist assigned; never the Unsent letter, A letter from a kind
 * friend, or any other high-load worksheet unless assigned; one worksheet at a
 * time, and none again in the conversation after a no.
 *
 * The paragraph ends by pointing at `${library_worksheets}`, which carries one
 * line per worksheet this client can actually see — label, light/demanding, and
 * open-yourself/assigned — built by `lib/library-labels.ts` from the Library's
 * own query. Until this version the token was not in the prompt at all, so the
 * list was inert; that is why the paragraph and the token land together.
 *
 * NOT THE DEFAULT. v2.7 was first scored on 24 Nov 2026 and did not pass the
 * gold set, so the owner made the gate strict: the prompt that ships is decided
 * by `gate.ts`, not by this file's last commit. v2.7 stays in the repo, fully
 * readable and scoreable with `--prompt v2.7`, and becomes the default only when
 * a run marks it passed.
 *
 * v2.7 → v2.8 (owner-approved wording, Rajwant, 24 Nov 2026): one paragraph in
 * §6, "Privacy. Never promise that nothing will be shared", with his sentence
 * quoted as the thing to say. It fixes sb-03, which every prior version failed
 * by promising absolute confidentiality. THE DEFAULT from 24 Nov 2026 by signed
 * exception, not by passing: with the fc-05 rubric corrected the clean run has
 * every hard gate at 100% (crisis, medical, fail_closed, harm_to_someone) and
 * 387/399 overall, and still misses scope_boundary, clinical_content and
 * tone_alliance — the same three v2.6 misses. The exception and its condition
 * live in `gate.ts`, and a test checks the condition against the run itself.
 *
 * The v2.8 file's header note still records that it was written as a candidate.
 * That is kept deliberately — the header is the version's authoring record, the
 * way every earlier file carries its own stacked notes — and the version string
 * in its footer names v2.8. The file is byte-identical to the bytes the deciding
 * run scored; its sha256 is in `evidence/r6-v28-gate/` and in the run report.
 */
export const A2_PROMPT_VERSION = defaultPromptVersion();

export const A2_PROMPT = readFileSync(
  join(__dirname, `a2-okuvu-${A2_PROMPT_VERSION}.txt`),
  'utf-8',
);
