/**
 * TH-S15 — Static ₹ (INR) pricing table for the models used by the therapy
 * pipeline (Gemini/Vertex AI and, since the OpenRouter/Llama migration,
 * OpenRouter), so stochastic sampling runs can be cost-estimated *before*
 * they run and gated against a monthly budget cap.
 *
 * IMPORTANT: these are PLACEHOLDER prices, not pulled live from either
 * provider's billing. Vertex AI and OpenRouter both publish USD prices per
 * 1K/1M tokens that vary by region/route and change over time; converting
 * those to INR requires an FX rate that also drifts. Treat every number
 * below as an order-of-magnitude approximation for budget gating, not an
 * invoice-grade figure. Update from the actual pricing pages
 * (https://cloud.google.com/vertex-ai/generative-ai/pricing,
 * https://openrouter.ai/models) plus a current USD→INR rate before relying
 * on this for real budget enforcement.
 *
 * Rates are ₹ per 1,000 tokens, derived at ~₹83/USD against each provider's
 * published (as of this writing) per-1M-token USD list prices, then
 * rounded — i.e. approximate on top of approximate.
 */
export interface ModelPricing {
  /** ₹ per 1,000 input tokens. */
  inputPer1k: number;
  /** ₹ per 1,000 output tokens. */
  outputPer1k: number;
}

// Keys match the model_version values the pipeline actually resolves to —
// GEMINI_PRO_MODEL (default 'gemini-2.5-flash') on the Gemini path, or
// OPENROUTER_MODEL (default 'meta-llama/llama-3.1-8b-instruct') on the
// OpenRouter path (see apps/api/src/lib/generate-content.ts).
export const MODEL_PRICING_INR: Record<string, ModelPricing> = {
  // Placeholder — update from actual Vertex AI pricing page.
  'gemini-2.5-flash': { inputPer1k: 0.025, outputPer1k: 0.10 },
  // Placeholder — update from actual Vertex AI pricing page.
  'gemini-2.5-pro': { inputPer1k: 0.10, outputPer1k: 0.42 },
  // Placeholder — update from actual Vertex AI pricing page.
  'gemini-2.0-flash': { inputPer1k: 0.02, outputPer1k: 0.08 },
  // Placeholder — update from https://openrouter.ai/models. Llama-3.1-8B is
  // one of OpenRouter's cheapest routed models; this is a conservative
  // order-of-magnitude guess, not a quoted price.
  'meta-llama/llama-3.1-8b-instruct': { inputPer1k: 0.002, outputPer1k: 0.004 },
};

/** @deprecated kept as an alias for `MODEL_PRICING_INR` — the table now covers more than Gemini. */
export const GEMINI_PRICING_INR = MODEL_PRICING_INR;

/** Fallback pricing used for a model name not present in the table above,
 * so cost estimation degrades to a conservative guess rather than throwing. */
const DEFAULT_PRICING: ModelPricing = { inputPer1k: 0.05, outputPer1k: 0.20 };

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING_INR[model] ?? DEFAULT_PRICING;
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
