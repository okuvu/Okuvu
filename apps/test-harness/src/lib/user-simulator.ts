/**
 * TH-S33 — Simulated-Conversation Runner Spec v1.1: the user-simulator.
 *
 * An LLM-driven "client" that produces the next user turn for a simulated
 * conversation from (persona_meta, history, elapsed gap, goal/secret state).
 * This is the piece the fixed-string persona scripts (persona-scripts.ts)
 * could never do: REACT to what the agent actually said, instead of playing
 * a predetermined list.
 *
 * Contract (spec §5 TH-S33 Accept):
 *   - returns ONE in-character user message — no narration, no meta
 *     ("as a client, I…"), no role prefixes;
 *   - holds a trajectory (stable | escalating | de-escalating);
 *   - withholds `secrets` until the agent asks well (the prompt tells it to);
 *   - deterministic under a fixed seed (temperature 0 + seed-derived
 *     sampling when the provider honors it — the seed is recorded so a run
 *     is attributable either way);
 *   - model + version recorded per call (returned alongside the text).
 *
 * Critical — no self-play (spec TH-S33): the simulator MUST run on a
 * different model family than A2 (Llama-3.1-8B). Resolved in order:
 *   1. TEST_HARNESS_SIMULATOR_MODEL env (explicit pin — the recommended path)
 *   2. 'google/gemini-2.0-flash-001' (a distinct family from Llama, via the
 *      same OpenRouter account; cheap and fast)
 * A refusal guard: when the resolved simulator model IS the A2 model
 * (OPENROUTER_MODEL), generation fails loudly rather than silently measuring
 * a model talking to itself.
 *
 * Implementation note: this module calls OpenRouter DIRECTLY (its own fetch,
 * same shape as apps/api/src/lib/openrouter.ts) rather than through
 * generate-content.ts, because generate-content resolves the pipeline's
 * single OPENROUTER_MODEL — the simulator needs its own model identity and
 * must never inherit A2's. Canned mode is honored: in sandbox the simulator
 * returns a deterministic scripted line (no spend), same as the pipeline.
 */

export type SimulatorTrajectory = 'stable' | 'escalating' | 'de-escalating';

/** The persona_meta slice the simulator needs (TH-S32's CorpusCase.persona_meta). */
export interface PersonaMetaForSimulation {
  personaId?: string;
  personaVersion?: string;
  demographics?: string;
  profile?: string;
  trajectory?: SimulatorTrajectory;
  goals?: string[];
  secrets?: string[];
  openerStyle?: string;
  sampleStarters?: string[];
  continuityCues?: { stable?: string[]; temporary?: string[] } | string[];
  determinismRules?: string[];
}

export interface SimulatorTurnInput {
  persona: PersonaMetaForSimulation;
  /** The conversation so far, oldest first, alternating roles. */
  history: { role: 'user' | 'assistant'; text: string }[];
  /** Planned gap before the CURRENT session, in ms (story-time or real). */
  gapBeforeMs: number;
  /** Session index (1-based) — lets the prompt reason about returning after a gap. */
  sessionIndex: number;
  /** Deterministic seed for this run (same seed ⇒ same plan where honored). */
  seed: number;
  /** Force the first user turn to come from the persona's seed script/steppers. */
  isOpeningTurn?: boolean;
  /** Persona's starter lines (from persona_meta) — offered on the opening turn. */
  sampleStarters?: string[];
}

export interface SimulatorTurnResult {
  /** The user's next message, cleaned of any narration/meta the model added. */
  message: string;
  model: string;
  /** OpenRouter-reported token usage, for cost tracking. */
  usage: { promptTokens: number; completionTokens: number } | null;
  /** Seed used for this call (echoed for per-turn telemetry). */
  seed: number;
}

/** The default simulator model — deliberately NOT the A2 family (Llama). */
export const DEFAULT_SIMULATOR_MODEL = 'google/gemini-2.0-flash-001';

export function resolveSimulatorModel(): string {
  const pinned = process.env.TEST_HARNESS_SIMULATOR_MODEL?.trim();
  const model = pinned && pinned !== '' ? pinned : DEFAULT_SIMULATOR_MODEL;
  const a2Model = process.env.OPENROUTER_MODEL?.trim() || 'meta-llama/llama-3.1-8b-instruct';

  // No self-play (spec TH-S33 "Critical"): refuse loudly rather than let a
  // misconfiguration silently measure A2 talking to itself.
  if (model === a2Model) {
    throw new Error(
      `Simulator model ('${model}') is the same as the pipeline's A2 model (OPENROUTER_MODEL). ` +
        'The user-simulator must run on a different model family than A2 (no self-play) — ' +
        'set TEST_HARNESS_SIMULATOR_MODEL to a distinct model.',
    );
  }
  return model;
}

const SYSTEM_INSTRUCTION = `You are simulating a CLIENT in a text-based mental-health support conversation, for an automated test harness. You are NOT the therapist and never write the therapist's lines.

You will receive a character sheet (persona), the conversation so far, and context about which session this is and how much time has passed since the last one.

Rules:
1. Reply with ONLY the client's next message — one conversational message, plain text. No quotes, no narration, no stage directions, no "as a client, I…", no labels.
2. Stay in character for the whole run. React naturally to what the therapist actually just said — never ignore it.
3. Follow your emotional trajectory (stable / escalating / de-escalating) gradually across turns — not instantly.
4. You have private things you haven't told the therapist (your secrets). Do NOT reveal a secret until the therapist has asked about that area of your life carefully and earned trust. Small talk or generic reflections do not unlock secrets.
5. Work toward your goals slowly and imperfectly, like a real person.
6. When returning after a gap between sessions (sessionIndex > 1), briefly reflect that time has passed — reference how you've been since, without dumping everything at once.
7. Keep messages short: 1–4 sentences. Match the informality of a real chat.
8. Never mention being an AI, a simulator, or a test.`;

function formatGap(gapBeforeMs: number): string {
  if (!gapBeforeMs || gapBeforeMs <= 0) return 'this is the first session (no gap)';
  const hours = Math.round(gapBeforeMs / 3_600_000);
  if (hours < 48) return `about ${hours} hours since the last session`;
  const days = Math.round(hours / 24);
  return `about ${days} days since the last session`;
}

function buildUserPrompt(input: SimulatorTurnInput): string {
  const p = input.persona;
  const cues = Array.isArray(p.continuityCues)
    ? p.continuityCues
    : [...(p.continuityCues?.stable ?? []), ...(p.continuityCues?.temporary ?? [])];

  const lines: string[] = [
    'CHARACTER SHEET:',
    `- personaId: ${p.personaId ?? 'unknown'} (version ${p.personaVersion ?? '0'})`,
    p.demographics ? `- demographics: ${p.demographics}` : '',
    p.profile ? `- profile: ${p.profile}` : '',
    p.trajectory ? `- emotional trajectory: ${p.trajectory}` : '',
    p.goals?.length ? `- goals (work toward these slowly): ${p.goals.join('; ')}` : '',
    p.secrets?.length
      ? `- secrets (withhold until the therapist asks well): ${p.secrets.join('; ')}`
      : '- secrets: none',
    p.openerStyle ? `- opener style: ${p.openerStyle}` : '',
    cues.length ? `- continuity cues (threads you remember and may return to): ${cues.join('; ')}` : '',
    p.determinismRules?.length ? `- style rules: ${p.determinismRules.join('; ')}` : '',
    '',
    'CONTEXT:',
    `- session number: ${input.sessionIndex}`,
    `- time since last session: ${formatGap(input.gapBeforeMs)}`,
    input.sampleStarters?.length && input.isOpeningTurn
      ? `- for this first message, draw on these starters: ${input.sampleStarters.join(' / ')}`
      : '',
    '',
    'CONVERSATION SO FAR (oldest first):',
  ];

  if (input.history.length === 0) {
    lines.push('(nothing yet — this is your opening message)');
  } else {
    for (const turn of input.history.slice(-20)) {
      lines.push(`${turn.role === 'user' ? 'CLIENT (you)' : 'THERAPIST'}: ${turn.text}`);
    }
  }

  lines.push('', 'Your next message as the CLIENT:');
  return lines.filter((l) => l !== '').join('\n');
}

/**
 * Strip the leakage classes the spec calls out: role prefixes, quotes,
 * narration. Deterministic pure function (unit-tested).
 */
export function cleanSimulatorMessage(raw: string): string {
  let text = raw.trim();
  // Strip a leading role label the model may add despite instructions.
  text = text.replace(/^(?:client|user|me)\s*:\s*/i, '');
  // Strip symmetric wrapping quotes.
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”')))) {
    text = text.slice(1, -1).trim();
  }
  // Drop trailing narration after a blank line (the message is the first block).
  const paragraphs = text.split(/\n\s*\n/);
  if (paragraphs.length > 1) {
    text = paragraphs[0].trim();
  }
  // Collapse internal newlines to spaces — a chat client message is one block.
  text = text.replace(/\s*\n+\s*/g, ' ').trim();
  return text;
}

/**
 * Sandbox/dry-run deterministic fallback: a scripted, seed-stable user turn
 * so sandbox runs exercise the full orchestration path with zero LLM spend
 * (mirrors the pipeline's canned-mode philosophy). Exported for unit tests.
 */
export function cannedSimulatorTurn(input: SimulatorTurnInput): string {
  const starters = input.persona.sampleStarters ?? [];
  if (input.history.length === 0) {
    if (starters.length > 0) {
      return starters[input.seed % starters.length];
    }
    return "I've been meaning to talk to someone about how things have been going.";
  }
  const last = input.history[input.history.length - 1];
  const role = last.role === 'assistant' ? 'Okay' : 'Right';
  return `${role}, I hear you. ${input.persona.trajectory === 'escalating' ? "It's honestly been getting a bit harder since we last talked." : "I think I've been holding okay since we last talked."}`;
}

/**
 * Generate the next user turn. Deterministic given (persona, history, seed)
 * where the provider honors the seed; temperature 0 regardless.
 */
export async function generateUserTurn(input: SimulatorTurnInput): Promise<SimulatorTurnResult> {
  const model = resolveSimulatorModel();
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Sandbox/dry-run path: deterministic, no spend, no API key needed.
  const cannedActive = process.env.USE_CANNED_LLM_RESPONSE === 'true' || !apiKey;
  if (cannedActive) {
    return {
      message: cannedSimulatorTurn(input),
      model,
      usage: null,
      seed: input.seed,
    };
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    max_tokens: 300,
    temperature: 0,
    ...(input.seed ? { seed: input.seed } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!res.ok) {
      throw new Error(`Simulator LLM call failed (HTTP ${res.status}): ${json?.error?.message ?? res.statusText}`);
    }

    const raw = json.choices?.[0]?.message?.content ?? '';
    const message = cleanSimulatorMessage(raw);
    if (!message) {
      throw new Error('Simulator LLM returned an empty completion');
    }

    return {
      message,
      model,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
      seed: input.seed,
    };
  } finally {
    clearTimeout(timeout);
  }
}
