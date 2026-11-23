import { A2_PROMPT } from '../../prompts/index.js';
import type { CarePlan } from './types.js';

/**
 * `OKUVU_A2_CARE_PLAN_STYLE` — the load switch for §12's per-plan emphasis.
 *
 * Default OFF, deliberately (docs/plans/2026-11-22-care-plan-style-blocks.md,
 * D5): the blocks are new clinical prompt text and do not go live on an image
 * roll without a gold-set score and clinical sign-off. Only the literal string
 * `on` enables them, so a typo in a task definition (`true`, `1`, `ON`) fails
 * to the reviewed v2.4 behaviour rather than to whatever the model makes of
 * three competing blocks.
 */
export function carePlanStyleEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OKUVU_A2_CARE_PLAN_STYLE === 'on';
}

const CARE_PLANS: CarePlan[] = ['CP1', 'CP2', 'CP3'];
const OPEN_MARKER_RE = /^\[\[(CP[123])\]\]$/;
const CLOSE_MARKER_RE = /^\[\[\/(CP[123])\]\]$/;
const SECTION_HEADER = '# 12. CARE-PLAN EMPHASIS';
const SECTION_END_HEADER = '# FINAL REMINDER';
const RULE = '═══════════════════════════════════════════════════════════════════';

interface EmphasisResult {
  prompt: string;
  /** The block left in the prompt, or null when none was. */
  kept: CarePlan | null;
  /** How many blocks were removed — logged, and asserted in tests. */
  stripped: number;
  /** 'blocks' (stripped cleanly), 'section' (drift: whole §12 dropped), 'absent'. */
  outcome: 'blocks' | 'section' | 'absent';
}

/** Start index of the `═══` rule line that opens the block containing `idx`. */
function ruleLineStartBefore(text: string, idx: number): number {
  const at = text.lastIndexOf(RULE, idx);
  return at === -1 ? 0 : at;
}

/**
 * Remove §12 entirely. Only reached when the marker structure is broken (a
 * deleted or duplicated marker, an unterminated block): the alternative is
 * sending the model all three emphases and letting it pick, which is the
 * failure mode §12 exists to prevent. Emphasis is recoverable; being steered
 * by the wrong plan's paragraph is not.
 */
function dropCarePlanSection(prompt: string): string {
  const headerAt = prompt.indexOf(SECTION_HEADER);
  const endAt = prompt.indexOf(SECTION_END_HEADER);
  if (headerAt === -1) return prompt;
  const start = ruleLineStartBefore(prompt, headerAt);
  const end = endAt === -1 ? prompt.length : ruleLineStartBefore(prompt, endAt);
  return prompt.slice(0, start) + prompt.slice(end);
}

/**
 * Structural strip, not `replaceAll`: the markers are line-delimited, so a
 * block that ever gains a `${...}` in future is dropped as text rather than
 * silently interpolated by the `.replaceAll` chain that follows.
 */
export function applyCarePlanEmphasis(
  prompt: string,
  keep: CarePlan | null,
): EmphasisResult {
  const lines = prompt.split('\n');
  const out: string[] = [];
  let current: CarePlan | null = null;
  let blocksSeen = 0;
  let stripped = 0;
  let kept: CarePlan | null = null;
  let malformed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const open = OPEN_MARKER_RE.exec(trimmed);
    const close = CLOSE_MARKER_RE.exec(trimmed);

    if (open) {
      if (current !== null) malformed = true; // nested / missing close
      current = open[1] as CarePlan;
      blocksSeen += 1;
      if (current === keep) kept = current;
      continue;
    }

    if (close) {
      if (current !== close[1]) malformed = true; // close with no matching open
      current = null;
      continue;
    }

    if (current !== null && current !== keep) continue;
    out.push(line);
  }

  if (current !== null) malformed = true; // file ended inside a block

  // No markers at all: either a prompt from before §12 existed (nothing to
  // do) or the section is present with its delimiters deleted (drift — drop
  // it rather than bill three blocks the model was never meant to compare).
  if (blocksSeen === 0 && !prompt.includes(SECTION_HEADER)) {
    return { prompt, kept: null, stripped: 0, outcome: 'absent' };
  }

  if (blocksSeen !== CARE_PLANS.length) malformed = true;

  if (malformed) {
    console.error(
      { blocksSeen, carePlan: keep },
      'A2 care-plan emphasis: §12 marker structure is malformed — dropping the whole section',
    );
    return { prompt: dropCarePlanSection(prompt), kept: null, stripped: blocksSeen, outcome: 'section' };
  }

  if (blocksSeen === 0) {
    return { prompt, kept: null, stripped: 0, outcome: 'absent' };
  }

  stripped = CARE_PLANS.length - (kept === null ? 0 : 1);
  return { prompt: out.join('\n'), kept, stripped, outcome: 'blocks' };
}

export const CARE_PLAN_BLOCK_PROBES: Record<CarePlan, string> = {
  CP1: 'a written worry window, a postponement',
  CP2: 'those demand energy they do not have',
  CP3: 'what can be dropped, deferred, handed over',
};

export function buildConversationalPrompt(params: {
  safetyState: string;
  sessionHistorySummary: string | null;
  perceivedIntensity: number | null;
  userMemoryContext?: string | null;
  retrievedContext?: string | null;
  therapistName?: string | null;
  carePlanFocus?: string | null;
  /** Selects the §12 emphasis block. Null (no assignment) → no block. */
  carePlan?: CarePlan | null;
  /** Overrides OKUVU_A2_CARE_PLAN_STYLE — tests and the harness A/B. */
  carePlanStyle?: boolean;
  homework?: string | null;
  toolkit?: string[];
  languageMode?: 'english' | 'mirror';
}): string {
  const {
    safetyState,
    sessionHistorySummary,
    perceivedIntensity,
    userMemoryContext,
    retrievedContext,
    therapistName,
    carePlanFocus,
    carePlan,
    homework,
    toolkit,
    languageMode,
  } = params;

  const carePlanStyle = params.carePlanStyle ?? carePlanStyleEnabled();
  // Fail safe on an unknown plan id: no emphasis rather than the wrong
  // emphasis. Callers type this as CarePlan | null, so a stray string can only
  // arrive from an untyped boundary (the harness's JSON cases).
  const selected: CarePlan | null =
    carePlanStyle && carePlan !== null && carePlan !== undefined && CARE_PLANS.includes(carePlan)
      ? carePlan
      : null;

  const emphasis = applyCarePlanEmphasis(A2_PROMPT, selected);

  // One line per turn: a production log answers "which emphasis did this turn
  // carry" without re-reading the request. No client identifier, no message.
  console.info(
    { carePlanStyle, carePlan: carePlan ?? null, blocksKept: emphasis.kept === null ? 0 : 1, blocksStripped: emphasis.stripped, outcome: emphasis.outcome },
    'A2 care-plan emphasis',
  );

  // All OKUVU v2.0 context vars degrade gracefully to a safe default when
  // not yet wired up by a caller (therapist-portal integration, homework
  // schema, and the tool-id registry are separate, not-yet-built
  // workstreams — see docs/okuvu-v2.0/02-master-handoff.md §4).
  return emphasis.prompt
    .replaceAll('${safety_state}', safetyState)
    .replaceAll('${session_history_summary}', sessionHistorySummary ?? 'null')
    .replaceAll('${perceived_intensity}', perceivedIntensity?.toString() ?? 'null')
    .replaceAll('${user_memory}', userMemoryContext ?? 'null')
    .replaceAll('${retrieved_context}', retrievedContext ?? 'null')
    .replaceAll('${therapist_name}', therapistName ?? 'null')
    .replaceAll('${care_plan_focus}', carePlanFocus ?? 'null')
    .replaceAll('${homework}', homework ?? 'null')
    .replaceAll('${toolkit}', toolkit && toolkit.length > 0 ? toolkit.join(', ') : 'none selected — use the always-available tools')
    .replaceAll('${language_mode}', languageMode ?? 'english');
}
