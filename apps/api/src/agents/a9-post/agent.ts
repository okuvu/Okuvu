import { generateContent } from '../../lib/vertex-ai.js';
import { buildA9PostPrompt } from './prompts.js';
import type { A9PostInput, A9PostResult } from './types.js';

const VALID_DECISIONS: ReadonlySet<string> = new Set(['APPROVED', 'BLOCKED']);
const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

const FLASH_LITE_MODEL =
  process.env.GEMINI_FLASH_LITE_MODEL ?? 'gemini-2.5-flash';

export async function a9PostReview(input: A9PostInput): Promise<A9PostResult> {
  const { userContent, safetyState, carePlan } = input;
  const systemInstruction = buildA9PostPrompt(userContent, safetyState, carePlan);

  let resultText: string;
  try {
    const result = await generateContent({
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      model: FLASH_LITE_MODEL,
      timeoutMs: 5000,
      generationConfig: {
        // Real root cause of the empty-response failures (confirmed live via
        // vertex-ai.ts's finishReason diagnostic): maxOutputTokens: 100 was
        // too tight — Gemini 2.5's internal "thinking" tokens can consume
        // the entire budget before any visible output text is emitted,
        // producing finishReason: 'MAX_TOKENS' with zero output. A9-pre
        // (agents/a9/agent.ts) uses 200 and has never hit this, but 300
        // still wasn't enough live: longer real userContent (an actual A2
        // response, not a short test string) either still hit MAX_TOKENS
        // outright, or silently truncated mid-JSON (caught by the parse
        // fallback below, but returning a default APPROVED rather than
        // the model's real assessment). Raised well past the observed
        // failure point — this is a fast/cheap Flash-Lite classification
        // call, so a generous budget costs little. Temperature was 0.0
        // originally (deterministic, appropriate for a governance
        // classifier) — briefly changed to 0.1 while misdiagnosing this as
        // a temperature+JSON-mode interaction; reverted once the real
        // cause (token budget) was found.
        temperature: 0.0,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        // Even 1024 didn't fully eliminate MAX_TOKENS live (1/3 in a small
        // sample) — raising the cap only shrinks the odds, since "thinking"
        // token consumption is itself variable per-call. Disabling it
        // outright is the actual fix: this is a small, fixed-shape
        // classification task that doesn't need reasoning tokens at all.
        thinkingConfig: { thinkingBudget: 0 },
      },
      // Canned/sandbox mode never calls Gemini — without this the generic
      // fallback prose fails to parse and result.fallbackUsed:true throws,
      // which the caller (orchestrator) treats as a real review failure.
      cannedResponse: JSON.stringify({ decision: 'APPROVED', violation_type: null, confidence: 'high' }),
    });
    if (result.fallbackUsed) {
      throw new Error('A9-post LLM call failed: fallback used');
    }
    resultText = result.text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.info({ err: message }, 'A9-post: error, throwing for caller to handle failover');
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(resultText);
  } catch {
    console.info({ raw: resultText }, 'A9-post: invalid JSON, falling back to APPROVED');
    return { decision: 'APPROVED', violation_type: null, confidence: 'low' };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null
  ) {
    console.info({ raw: resultText }, 'A9-post: non-object response, falling back to APPROVED');
    return { decision: 'APPROVED', violation_type: null, confidence: 'low' };
  }

  const obj = parsed as Record<string, unknown>;
  const decision = obj.decision;
  const violation_type = obj.violation_type ?? null;
  const confidence = obj.confidence;

  if (
    typeof decision !== 'string' || !VALID_DECISIONS.has(decision) ||
    (violation_type !== null && typeof violation_type !== 'string') ||
    typeof confidence !== 'string' || !VALID_CONFIDENCE.has(confidence)
  ) {
    console.info(
      { decision, violation_type, confidence, raw: resultText },
      'A9-post: invalid fields, falling back to APPROVED',
    );
    return { decision: 'APPROVED', violation_type: null, confidence: 'low' };
  }

  console.info({ decision, violation_type, confidence }, 'A9-post: review complete');
  return { decision, violation_type, confidence } as A9PostResult;
}
