/**
 * E17-S18 — A2's answer as a constrained schema instead of a prose request.
 *
 * The problem this exists to remove: A2 is the only agent on the turn path whose
 * structured output is *asked for in prose* rather than constrained by a tool
 * schema. §10 and §11 of the conversational sheet specify the two-block format,
 * §11 says "every turn must produce exactly two blocks", and the FINAL REMINDER
 * repeats it as the last line of a 49,495-character sheet — and the block still
 * failed to appear on a large minority of turns. Measured in
 * `evidence/E17-S18-emission-4arm.md` (21 scenarios × 3 reps, one model, one
 * judge):
 *
 *   arm              sheet chars   signal present   judge satisfied
 *   base v2.4           49,495       34/63 = 54%      60/63 = 95.2%
 *   v2.1 sheet          22,276       50/63 = 79%      49/63 = 77.8%
 *   reorder             49,495       36/63 = 57%      59/63 = 93.7%
 *   schema              49,495       63/63 = 100%     56/63 = 88.9%
 *
 * Reordering the format block to the front changed nothing (p=0.85), so
 * position is not the mechanism. The older, smaller sheet emitted more often
 * but its conversations were markedly worse (p=0.003) — so the extra length is
 * doing clinical work, not padding, and cannot be cut to buy emission. Forcing
 * the answer through a tool schema removed the failure entirely: 63/63, all 21
 * scenarios on all three attempts, 29 turns gained and none lost.
 *
 * What that costs is not settled. Structured replies came back 19% shorter
 * (255 vs 314 characters) and four judge verdicts were lost against none
 * gained — consistent in direction, but p=0.125 at that sample size, so it is a
 * suspicion, not a finding. Everything in the probe was calm-category; no
 * near-crisis turn was exercised. This is therefore shipped *measurable and
 * reversible* rather than proven: `A2_STRUCTURED_OUTPUT=off` restores the prose
 * contract exactly, with no other change.
 *
 * Field shape note: the probe's schema was flat (primary_emotion /
 * mood_confidence at the top level) and that is kept here, because the flat
 * shape is the one measured at 100% — the nesting the sheet describes is
 * reassembled in `parseStructuredEnvelope`, where it belongs. Changing what the
 * tool asks for would be an unmeasured change dressed up as a refactor.
 */
import type { S07Signal, TaperState } from './types.js';

export const A2_STRUCTURED_TOOL_NAME = 'emit_reply_and_signal';

/**
 * `null` is not available: Bedrock's strict tool use rejects nullable sentinels
 * on some models, and a required-but-nullable field is the shape most likely to
 * be refused on the wire. Empty string means "not applicable", 0 means "no
 * estimate", and both translate back to `null` in the parser — so the signal
 * type stays honest while the wire schema stays a narrow dialect.
 */
export const A2_STRUCTURED_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    signal: { type: 'string', enum: ['S-07'] },
    agent: { type: 'string', enum: ['A2'] },
    reply: {
      type: 'string',
      description:
        'Block 1 — the user-facing reply, plain conversational text, no markdown and no machine block.',
    },
    technique_used: {
      type: 'string',
      description: 'The tool id actually used in this reply, or "none".',
    },
    tool_launched: {
      type: 'string',
      description: 'The tool id whose interactive version was offered this turn, or "none".',
    },
    taper_state: {
      type: 'string',
      enum: ['none', 'solution_reached', 'pacifying', 'nowhere'],
    },
    closure_offered: { type: 'boolean' },
    frustration_event: { type: 'boolean' },
    homework_referenced: { type: 'boolean' },
    therapist_referral: { type: 'boolean' },
    intensity: { type: 'integer', description: '1-10, or 0 when there is no estimate.' },
    primary_emotion: { type: 'string', description: 'One plain-English emotion word, or "none".' },
    mood_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    journal_prompt_suggested: {
      type: 'string',
      description: 'Suggested journal prompt text, or "none".',
    },
  },
  required: [
    'signal',
    'agent',
    'reply',
    'technique_used',
    'tool_launched',
    'taper_state',
    'closure_offered',
    'frustration_event',
    'homework_referenced',
    'therapist_referral',
    'intensity',
    'primary_emotion',
    'mood_confidence',
    'journal_prompt_suggested',
  ],
};

/**
 * Kill switch. Default on: the whole point of the change is to exercise it on
 * the testing harness. Any future regression on reply warmth is diagnosable in
 * one env change rather than a revert, and reverting it is exact — no clinical
 * wording moves in either direction.
 */
export function isA2StructuredOutputEnabled(): boolean {
  const raw = (process.env.A2_STRUCTURED_OUTPUT ?? '').trim().toLowerCase();
  return !(raw === 'off' || raw === 'false' || raw === '0' || raw === 'disabled');
}

const TAPER_STATES: readonly TaperState[] = ['none', 'solution_reached', 'pacifying', 'nowhere'];
const CONFIDENCES = ['high', 'medium', 'low'] as const;

/** "none", "null", "n/a", "" all mean *no value* — never a literal tool id. */
function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'none' || lower === 'null' || lower === 'n/a' || lower === 'na') return null;
  return trimmed;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

/** 0 is the schema's "no estimate" sentinel; anything outside 1-10 is not a signal. */
function toIntensity(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 10) return null;
  return rounded;
}

export interface StructuredA2Envelope {
  userContent: string;
  signal: S07Signal;
}

/**
 * Read the envelope back off the wire.
 *
 * The whole reply must be one JSON object: a model that writes prose *about* a
 * JSON example ("here's the shape: {…}") is not answering in the envelope, and
 * treating that as one would silently replace a real reply with a fragment.
 * `signal: "S-07"` is required for the same reason — it is the one field that
 * cannot appear by accident in a valid answer.
 */
export function parseStructuredEnvelope(raw: string): StructuredA2Envelope | null {
  let text = raw.trim();
  if (text.length === 0) return null;

  // A fence is tolerated: the forced tool returns bare JSON, but the repair
  // path and any future prose-wrapped variant should not need their own parser.
  const fenced = /^```(?:json)?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n?```$/.exec(text);
  if (fenced) text = fenced[1].trim();

  if (!text.startsWith('{') || !text.endsWith('}')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.signal !== 'S-07') return null;
  if (typeof obj.reply !== 'string') return null;

  const taperRaw = typeof obj.taper_state === 'string' ? obj.taper_state.trim().toLowerCase() : '';
  const taperState = (TAPER_STATES as readonly string[]).includes(taperRaw)
    ? (taperRaw as TaperState)
    : 'none';

  const confidenceRaw =
    typeof obj.mood_confidence === 'string' ? obj.mood_confidence.trim().toLowerCase() : '';
  const confidence = (CONFIDENCES as readonly string[]).includes(confidenceRaw)
    ? (confidenceRaw as (typeof CONFIDENCES)[number])
    : 'low';

  return {
    userContent: obj.reply.trim(),
    signal: {
      signal: 'S-07',
      agent: 'A2',
      technique_used: toNullableString(obj.technique_used),
      tool_launched: toNullableString(obj.tool_launched),
      taper_state: taperState,
      closure_offered: toBoolean(obj.closure_offered),
      frustration_event: toBoolean(obj.frustration_event),
      homework_referenced: toBoolean(obj.homework_referenced),
      therapist_referral: toBoolean(obj.therapist_referral),
      intensity: toIntensity(obj.intensity),
      mood_inference: {
        primary_emotion: toNullableString(obj.primary_emotion),
        confidence,
      },
      journal_prompt_suggested: toNullableString(obj.journal_prompt_suggested),
    },
  };
}
