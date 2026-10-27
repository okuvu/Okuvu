/**
 * TH-S15 — Static ₹ (INR) pricing table for the models the therapy pipeline
 * can run on after the AWS cutover (Amazon Bedrock, plus the OpenRouter
 * escape hatch), so stochastic sampling runs can be cost-estimated *before*
 * they run and gated against a monthly budget cap.
 *
 * SOURCE (Bedrock, ap-south-1, on-demand, standard tier — not batch/flex/
 * priority): the AWS Price List API offer file for Amazon Bedrock in
 * Asia Pacific (Mumbai):
 *   https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/ap-south-1/index.json
 *   publicationDate 2026-10-16T21:08:06Z
 * Rows used (USD, per 1,000 tokens as the offer file prices them):
 *   APS3-NovaPro-input-tokens          $0.00094 / 1K   (= $0.94 / 1M)
 *   APS3-NovaPro-output-tokens         $0.00376 / 1K   (= $3.76 / 1M)
 *   APS3-TitanEmbeddingV2-Text-input-tokens
 *                                      $0.000024 / 1K  (= $0.024 / 1M)
 * ap-south-1 carries a premium over us-east-1 for the same Nova models, so do
 * not substitute the US list price — the region is pinned for DPDP residency.
 *
 * IMPORTANT: the INR column is a *derived* approximation, not a billed figure.
 * AWS bills in USD and the USD→INR rate drifts, so every number below is an
 * order-of-magnitude input to budget gating, not invoice-grade. Re-derive from
 * the offer file above plus a current FX rate before relying on it for real
 * budget enforcement.
 *
 * Rates are ₹ per 1,000 tokens, derived at ₹83/USD from the per-1M-token USD
 * figures, then rounded.
 */
export interface ModelPricing {
  /** ₹ per 1,000 input tokens. */
  inputPer1k: number;
  /** ₹ per 1,000 output tokens. */
  outputPer1k: number;
}

/** FX rate used to derive the INR column. Update with the rate you used. */
const USD_TO_INR = 83;

/** USD per 1M tokens → ₹ per 1k tokens, the unit this table stores. */
function inrPer1k(usdPer1M: number): number {
  return Number(((usdPer1M * USD_TO_INR) / 1000).toFixed(4));
}

// Keys match the model_version values the pipeline actually resolves to —
// BEDROCK_MODEL_ID (default 'amazon.nova-pro-v1:0') on the Bedrock path, or
// OPENROUTER_MODEL (default 'meta-llama/llama-3.1-8b-instruct') on the
// OpenRouter path (see apps/api/src/lib/generate-content.ts and
// apps/api/src/lib/provider-config.ts).
export const MODEL_PRICING_INR: Record<string, ModelPricing> = {
  // $0.94 / 1M in, $3.76 / 1M out (ap-south-1, on-demand).
  'amazon.nova-pro-v1:0': { inputPer1k: inrPer1k(0.94), outputPer1k: inrPer1k(3.76) },
  // Embeddings are input-only; the model emits a fixed 768-dim vector, so
  // there is no output-token charge to model.
  'amazon.titan-embed-text-v2:0': { inputPer1k: inrPer1k(0.024), outputPer1k: 0 },
  // Placeholder — update from https://openrouter.ai/models. Llama-3.1-8B is
  // one of OpenRouter's cheapest routed models; this is a conservative
  // order-of-magnitude guess, not a quoted price.
  'meta-llama/llama-3.1-8b-instruct': { inputPer1k: 0.002, outputPer1k: 0.004 },
};

/** Alias kept for callers that name the table by provider rather than currency. */
export const BEDROCK_PRICING_INR = MODEL_PRICING_INR;

/**
 * Fallback pricing for a model name not present in the table above: the Nova
 * Pro rate, i.e. the most expensive model the pipeline runs by default, so an
 * unknown model degrades to a conservative (over-)estimate rather than
 * under-counting budget spend.
 */
const DEFAULT_PRICING: ModelPricing = MODEL_PRICING_INR['amazon.nova-pro-v1:0'] as ModelPricing;

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING_INR[model] ?? DEFAULT_PRICING;
}

/**
 * Estimated ₹ cost of a single agent sample call for the given model and
 * token counts. Pure arithmetic against the table above — intentionally not
 * precise, just structurally sound for budget gating.
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
