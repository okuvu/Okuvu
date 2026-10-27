import type { GovernanceState, SafetyState } from '@okuvu/shared-types';
import type { SpecialistPayload } from '../../agents/shared/types.js';
import type { SpecialistOutput } from '../../agents/shared/specialist.js';
import type { A12Input, A12Output } from '../../agents/a12/types.js';
import type { A13Input, A13Output, SpeechProvider } from '../../agents/a13/types.js';
import { selectSpecialists } from '../../agents/a8-selection.js';

/**
 * The 15-agent turn path, v2.
 *
 * Why a second orchestration module rather than an edit to `pipeline/orchestrator.ts`:
 * that file is 600 lines of battle-tested plumbing with 615 tests behind it,
 * built around a 4-agent pipeline (A1 → A9 → A8 → A2). Rewriting it in place to
 * insert six more agents would put every existing behaviour at risk in the same
 * change that adds untested ones. This module composes the same primitives into
 * the 15-agent flow, is inert until its feature flag is on, and is covered by
 * its own conformance suite. Switching it on is a deliberate, separately
 * reviewable change.
 *
 * Flow:
 *   A1 safety  → S4 crisis ........................ ends turn, no model prose
 *              → S3 deterministic grounding ....... ends turn, no A2
 *   A9 pre     → Blocked .......................... static policy reply
 *   A8 route+select → up to 2 specialists ........ payloads only
 *   specialists (A2–A7) .......................... concurrent, fail-closed
 *   A12 compile/assemble ......................... the only client-facing text
 *   A13 speak (optional) ......................... audio of A12's text, or nothing
 *
 * A4/A5/A6/A7 payloads are additive; a specialist that fails contributes
 * nothing and the turn still completes with a lower-confidence reply.
 */

export type TurnPath = 'crisis' | 'deterministic-grounding' | 'governance-blocked' | 'dialogue';

export interface TurnV2Input {
  message: string;
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionCount?: number;
  userMemoryContext?: string | null;
  /** A2's conversational draft. Without it the turn is compiled from payloads only. */
  dialogueDraft?: string | null;
  requestVoice?: boolean;
}

export interface SafetyClassification {
  safetyState: SafetyState;
  fallbackUsed: boolean;
}

export interface GovernanceClassification {
  governanceState: GovernanceState;
  fallbackUsed: boolean;
}

export interface TurnV2Deps {
  classifySafety: (input: TurnV2Input) => Promise<SafetyClassification>;
  classifyGovernance: (input: TurnV2Input) => Promise<GovernanceClassification>;
  runSpecialist: (id: string, input: TurnV2Input) => Promise<SpecialistOutput<SpecialistPayload>>;
  compile: (input: A12Input) => A12Output;
  synthesise: (input: A13Input, provider: SpeechProvider | null) => Promise<A13Output>;
  speechProvider?: SpeechProvider | null;
  /** Single-sourced copies. Crisis copy is the one text A12 does not write. */
  copy: {
    crisis: string;
    grounding: string;
    governanceBlocked: string;
    noIntervention: string;
  };
}

export interface TurnV2Result {
  path: TurnPath;
  text: string;
  safetyState: SafetyState;
  governanceState: GovernanceState | null;
  specialists: string[];
  usedPayloads: string[];
  droppedPayloads: string[];
  fallbackUsed: boolean;
  audio: A13Output | null;
  stages: string[];
}

export function isAgentPipelineV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OKUVU_AGENT_PIPELINE_V2 === 'true';
}

async function runSpecialists(
  ids: string[],
  input: TurnV2Input,
  deps: TurnV2Deps,
): Promise<{ payloads: SpecialistPayload[]; failed: string[] }> {
  const settled = await Promise.allSettled(ids.map((id) => deps.runSpecialist(id, input)));
  const payloads: SpecialistPayload[] = [];
  const failed: string[] = [];

  settled.forEach((result, index) => {
    const id = ids[index];
    if (result.status === 'fulfilled' && result.value && result.value.payload) {
      payloads.push(result.value.payload);
    } else {
      // A specialist that threw or returned null is a missing intervention, not
      // an error the client sees. Recorded so monitoring can see the gap.
      failed.push(id);
    }
  });

  return { payloads, failed };
}

export async function processTurnV2(input: TurnV2Input, deps: TurnV2Deps): Promise<TurnV2Result> {
  const stages: string[] = ['A1'];

  const safety = await deps.classifySafety(input);

  if (safety.safetyState === 'S4') {
    stages.push('crisis');
    // Crisis copy is deliberately not routed through A12: it is a single,
    // reviewed, static string, and a template renderer in the crisis path is a
    // new failure mode at exactly the wrong moment.
    return {
      path: 'crisis',
      text: deps.copy.crisis,
      safetyState: 'S4',
      governanceState: null,
      specialists: [],
      usedPayloads: [],
      droppedPayloads: [],
      fallbackUsed: safety.fallbackUsed,
      audio: null,
      stages,
    };
  }

  if (safety.safetyState === 'S3') {
    stages.push('grounding');
    return {
      path: 'deterministic-grounding',
      text: deps.copy.grounding,
      safetyState: 'S3',
      governanceState: null,
      specialists: [],
      usedPayloads: [],
      droppedPayloads: [],
      fallbackUsed: false,
      audio: null,
      stages,
    };
  }

  stages.push('A9-pre');
  const governance = await deps.classifyGovernance(input);

  if (governance.governanceState === 'Blocked') {
    stages.push('blocked');
    return {
      path: 'governance-blocked',
      text: deps.copy.governanceBlocked,
      safetyState: safety.safetyState,
      governanceState: 'Blocked',
      specialists: [],
      usedPayloads: [],
      droppedPayloads: [],
      fallbackUsed: governance.fallbackUsed,
      audio: null,
      stages,
    };
  }

  const selection = selectSpecialists({
    message: input.message,
    safetyState: safety.safetyState,
    governanceState: governance.governanceState,
    sessionCount: input.sessionCount ?? 0,
  });

  stages.push(`A8:${selection.rationale}`);

  const { payloads, failed } = await runSpecialists(selection.specialists, input, deps);
  if (failed.length > 0) stages.push(`specialists_failed:${failed.join(',')}`);

  const compiled = deps.compile({
    mode: input.dialogueDraft ? 'assemble' : 'compile',
    payloads,
    dialogueDraft: input.dialogueDraft ?? null,
    safetyState: safety.safetyState,
  });

  let text: string;
  let usedPayloads: string[] = [];
  let droppedPayloads: string[] = [];
  let fallbackUsed = safety.fallbackUsed || governance.fallbackUsed || failed.length > 0;

  if (compiled.ok && compiled.compiled) {
    stages.push('A12');
    text = compiled.compiled.text;
    usedPayloads = compiled.compiled.usedPayloads;
    droppedPayloads = compiled.compiled.droppedPayloads;
  } else {
    stages.push(`A12_refused:${compiled.errors.join('|')}`);
    const draft = (input.dialogueDraft ?? '').trim();
    // No compiled text and no draft means no intervention is available. Say so
    // plainly rather than inventing a reply — silence or filler at this point
    // is indistinguishable from a failure the client should not have to read.
    text = draft.length > 0 ? draft : deps.copy.noIntervention;
    fallbackUsed = true;
  }

  let audio: A13Output | null = null;
  if (input.requestVoice) {
    stages.push('A13');
    audio = await deps.synthesise(
      { text, compiledBy: 'A12', safetyState: safety.safetyState },
      deps.speechProvider ?? null,
    );
  }

  return {
    path: 'dialogue',
    text,
    safetyState: safety.safetyState,
    governanceState: governance.governanceState,
    specialists: selection.specialists,
    usedPayloads,
    droppedPayloads,
    fallbackUsed,
    audio,
    stages,
  };
}
