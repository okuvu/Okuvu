/**
 * TH-S15 — Static ₹ (INR) pricing table for Gemini models used by the
 * therapy pipeline, so stochastic sampling runs can be cost-estimated
 * *before* they run and gated against a monthly budget cap.
 *
 * IMPORTANT: these are PLACEHOLDER prices, not pulled live from Vertex AI
 * billing. Vertex AI publishes USD prices per 1K/1M characters or tokens
 * that vary by region and change over time; converting those to INR requires
 * an FX rate that also drifts. Treat every number below as an
 * order-of-magnitude approximation for budget gating, not an invoice-grade
 * figure. Update from the actual Vertex AI Gemini pricing page
 * (https://cloud.google.com/vertex-ai/generative-ai/pricing) plus a current
 * USD→INR rate before relying on this for real budget enforcement.
 *
 * Rates are ₹ per 1,000 tokens, derived at ~₹83/USD against Vertex AI's
 * published (as of this writing) per-1M-token USD list prices for the
 * <=200k context tier, then rounded — i.e. approximate on top of approximate.
 */
export interface ModelPricing {
  /** ₹ per 1,000 input tokens. */
  inputPer1k: number;
  /** ₹ per 1,000 output tokens. */
  outputPer1k: number;
}

// The env var this table's keys are meant to match is GEMINI_PRO_MODEL,
// which defaults to 'gemini-2.5-flash' (see apps/api/src/lib/vertex-ai.ts).
export const GEMINI_PRICING_INR: Record<string, ModelPricing> = {
  // Placeholder — update from actual Vertex AI pricing page.
  'gemini-2.5-flash': { inputPer1k: 0.025, outputPer1k: 0.10 },
  // Placeholder — update from actual Vertex AI pricing page.
  'gemini-2.5-pro': { inputPer1k: 0.10, outputPer1k: 0.42 },
  // Placeholder — update from actual Vertex AI pricing page.
  'gemini-2.0-flash': { inputPer1k: 0.02, outputPer1k: 0.08 },
};

/** Fallback pricing used for a model name not present in the table above,
 * so cost estimation degrades to a conservative guess rather than throwing. */
const DEFAULT_PRICING: ModelPricing = { inputPer1k: 0.05, outputPer1k: 0.20 };

export function getModelPricing(model: string): ModelPricing {
  return GEMINI_PRICING_INR[model] ?? DEFAULT_PRICING;
}

/**
 * Estimated ₹ cost of a single agent sample call for the given model and
 * token counts. Pure arithmetic against the placeholder table above —
 * intentionally not precise, just structurally sound for budget gating.
 */
export function estimateSampleCostInr(
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): number {
  const pricing = getModelPricing(model);
  return (
    (estimatedInputTokens / 1000) * pricing.inputPer1k +
    (estimatedOutputTokens / 1000) * pricing.outputPer1k
  );
}
