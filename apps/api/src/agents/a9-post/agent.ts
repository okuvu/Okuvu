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
        temperature: 0.0,
        maxOutputTokens: 100,
        responseMimeType: 'application/json',
      },
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
