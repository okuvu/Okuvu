import { callJson, asRecord, asStringList, asTrimmedString, isEnum } from '../shared/json-call.js';
import { findForbiddenAdvice, normaliseForComparison } from '../shared/specialist.js';
import {
  MAX_EVIDENCE_CHARS,
  MAX_EVIDENCE_ITEMS,
  MAX_ID_CHARS,
  MAX_INSIGHTS,
  MAX_SESSION_REFS,
  MAX_THEME_CHARS,
  buildCannedA10Json,
  buildInsightPrompt,
  buildInsightUserMessage,
  usableSessions,
} from './prompts.js';
import type { A10Input, A10Output, Insight } from './types.js';

export const DEFAULT_MIN_SESSIONS = 3;

const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['low', 'medium', 'high']);

/**
 * Clinical description is allowed; a diagnosis is not. `findForbiddenAdvice`
 * already covers "diagnosis", "disorder", "prescription" and "medication",
 * but a theme phrased as "generalised anxiety disorder" or "PTSD presentation"
 * is exactly the failure mode a therapist-facing agent gets wrong, so the
 * obvious labels are named here too.
 */
const DIAGNOSTIC_TERM =
  /\b(diagnos\w*|depressi\w+|depressive|anxiety disorder|generalised anxiety|generalized anxiety|gad|ptsd|post[- ]traumatic|bipolar|borderline|bpd|ocd|adhd|autis\w*|schizophren\w*|psychos\w*|personality disorder)\b/i;

const A10_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    insights: {
      type: 'ARRAY' as const,
      items: {
        type: 'OBJECT' as const,
        properties: {
          id: { type: 'STRING' as const },
          theme: { type: 'STRING' as const },
          evidence: { type: 'ARRAY' as const, items: { type: 'STRING' as const } },
          confidence: { type: 'STRING' as const },
          source_session_ids: { type: 'ARRAY' as const, items: { type: 'STRING' as const } },
        },
        required: ['id', 'theme', 'evidence', 'confidence', 'source_session_ids'],
      },
    },
  },
  required: ['insights'],
};

function resolveMinSessions(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 1) {
    return DEFAULT_MIN_SESSIONS;
  }
  return Math.floor(requested);
}

function hasDiagnosticTerm(text: string): boolean {
  return DIAGNOSTIC_TERM.test(text);
}

interface DropCounts {
  schema: number;
  theme: number;
  ungrounded: number;
  unknownSession: number;
  capped: number;
}

interface ParseContext {
  sessionIds: ReadonlySet<string>;
  normalisedSummaries: string[];
  drops: DropCounts;
}

/**
 * Grounding is containment after the shared normaliser, so punctuation and
 * case drift are tolerated but a rewording is not. This is deliberately the
 * same comparison A3 uses for verbatim client quotes — one definition of
 * "the source actually says this" across the pipeline.
 */
function isGrounded(evidence: string, ctx: ParseContext): boolean {
  const needle = normaliseForComparison(evidence);
  if (needle.length === 0) return false;
  return ctx.normalisedSummaries.some((summary) => summary.includes(needle));
}

/**
 * Per-insight filtering, not whole-response rejection.
 *
 * A single invented citation should cost the therapist one insight, not the
 * whole set — but the drop is silent to the model and visible to the caller
 * via `notes`, and it is never repaired. An ungrounded evidence string is not
 * trimmed back to a substring that happens to exist, and an unknown session id
 * is not remapped to the nearest real one: either would produce a citation
 * that reads as verified and is not.
 */
function parseInsights(parsed: Record<string, unknown>, ctx: ParseContext): Insight[] | null {
  const raw = parsed.insights;
  if (!Array.isArray(raw)) return null;

  const insights: Insight[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const candidate = asRecord(raw[index]);
    if (candidate === null) {
      ctx.drops.schema += 1;
      continue;
    }

    const theme = asTrimmedString(candidate.theme, MAX_THEME_CHARS);
    if (theme === null) {
      ctx.drops.schema += 1;
      continue;
    }

    if (findForbiddenAdvice(theme) !== null || hasDiagnosticTerm(theme)) {
      ctx.drops.theme += 1;
      continue;
    }

    if (!isEnum<'low' | 'medium' | 'high'>(candidate.confidence, VALID_CONFIDENCE)) {
      ctx.drops.schema += 1;
      continue;
    }

    const evidence = asStringList(candidate.evidence, MAX_EVIDENCE_ITEMS, MAX_EVIDENCE_CHARS);
    if (evidence === null || evidence.length === 0) {
      ctx.drops.schema += 1;
      continue;
    }

    if (!evidence.every((item) => isGrounded(item, ctx))) {
      ctx.drops.ungrounded += 1;
      continue;
    }

    const citedIds = asStringList(candidate.source_session_ids, MAX_SESSION_REFS, MAX_ID_CHARS);
    if (citedIds === null || citedIds.length === 0) {
      ctx.drops.schema += 1;
      continue;
    }

    const uniqueIds = [...new Set(citedIds)];
    if (!uniqueIds.every((id) => ctx.sessionIds.has(id))) {
      ctx.drops.unknownSession += 1;
      continue;
    }

    // An id is a UI handle, not a clinical claim. Deriving a deterministic one
    // when the model omits it costs nothing; dropping an otherwise grounded
    // insight over a formatting omission would.
    const id = asTrimmedString(candidate.id, MAX_ID_CHARS) ?? `insight_${index + 1}`;

    insights.push({
      id,
      theme,
      evidence,
      confidence: candidate.confidence,
      source_session_ids: uniqueIds,
    });
  }

  if (insights.length > MAX_INSIGHTS) {
    ctx.drops.capped = insights.length - MAX_INSIGHTS;
    return insights.slice(0, MAX_INSIGHTS);
  }

  return insights;
}

function buildNotes(drops: DropCounts, extras: string[]): string | null {
  const parts = [...extras];
  if (drops.capped > 0) parts.push(`capped_insights:${drops.capped}`);
  if (drops.schema > 0) parts.push(`dropped_schema_invalid:${drops.schema}`);
  if (drops.theme > 0) parts.push(`dropped_theme_rejected:${drops.theme}`);
  if (drops.ungrounded > 0) parts.push(`dropped_ungrounded_evidence:${drops.ungrounded}`);
  if (drops.unknownSession > 0) parts.push(`dropped_unknown_session_id:${drops.unknownSession}`);
  return parts.length > 0 ? parts.join('; ') : null;
}

export async function generateInsights(input: A10Input): Promise<A10Output> {
  const sessions = usableSessions(input);
  const minSessions = resolveMinSessions(input.minSessions);

  // Below the threshold there is nothing defensible to say, so no model call
  // is made at all. Asking a model to find patterns in two sessions is asking
  // it to invent the third.
  if (sessions.length < minSessions) {
    return {
      insights: [],
      insufficientData: true,
      fallbackUsed: false,
      failureReason: null,
      notes: `insufficient_sessions:${sessions.length}<${minSessions}`,
    };
  }

  const ctx: ParseContext = {
    sessionIds: new Set(sessions.map((session) => session.sessionId)),
    normalisedSummaries: sessions.map((session) => normaliseForComparison(session.summary)),
    drops: { schema: 0, theme: 0, ungrounded: 0, unknownSession: 0, capped: 0 },
  };

  const result = await callJson<Insight[] | null>({
    agent: 'A10',
    systemInstruction: buildInsightPrompt({ ...input, minSessions }),
    contents: [{ role: 'user', parts: [{ text: buildInsightUserMessage(input, sessions) }] }],
    schema: A10_SCHEMA,
    required: ['insights'],
    cannedResponse: buildCannedA10Json(input, sessions),
    maxOutputTokens: 1400,
    validate: (parsed) => parseInsights(parsed, ctx),
    // A technical failure yields no insights — never a plausible-looking one.
    // The therapist sees "could not generate", not a pattern with no source.
    onFailure: () => null,
  });

  if (result.value === null) {
    return {
      insights: [],
      insufficientData: false,
      fallbackUsed: true,
      failureReason: result.failureReason ?? 'contract_rejected',
      notes: null,
    };
  }

  return {
    insights: result.value,
    insufficientData: false,
    fallbackUsed: false,
    failureReason: null,
    notes: buildNotes(ctx.drops, result.value.length === 0 ? ['no_insights_returned'] : []),
  };
}
