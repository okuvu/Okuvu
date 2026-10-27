/**
 * Single place that decides which cloud backs the LLM + embedding seams in
 * the worker.
 *
 * Mirror of `apps/api/src/lib/provider-config.ts` (minus the queue and secrets
 * seams, which the worker does not own): apps/api and apps/worker are separate
 * deployable services that share only packages/prisma and
 * packages/shared-types, so this cannot be a cross-app import. Keep the two in
 * step — same env var names, same defaults, same validation.
 *
 * | seam      | env var              | values            | default |
 * |-----------|----------------------|-------------------|---------|
 * | LLM/embed | OKUVU_LLM_PROVIDER   | vertex \| bedrock | vertex  |
 *
 * `OKUVU_LLM_PROVIDER` picks which Vertex-family backend the worker's jobs
 * (session summary, memory extraction) use. The pre-existing `LLM_PROVIDER`
 * var (openrouter | gemini) still chooses the agent-facing provider and is
 * untouched; `bedrock` takes precedence over it, exactly as in the API.
 */

export type LlmProviderName = 'vertex' | 'bedrock';
export type ContentBackend = 'bedrock' | 'vertex' | 'openrouter';

/** ap-south-1 (Mumbai) — the DPDP-compliant region the AWS stack pins. */
export const DEFAULT_AWS_REGION = 'ap-south-1';

/**
 * Amazon Nova Pro is served in-region in ap-south-1 and supports Bedrock tool
 * use, which `bedrock.ts` relies on for schema-constrained JSON. Claude on
 * Bedrock in ap-south-1 requires an APAC cross-region inference profile
 * (`apac.anthropic.…`), which moves data outside India — override with
 * BEDROCK_MODEL_ID per environment rather than editing this constant.
 */
export const DEFAULT_BEDROCK_MODEL_ID = 'amazon.nova-pro-v1:0';

/** Titan V2 is the only Bedrock embedding model that can emit 768 dims. */
export const DEFAULT_BEDROCK_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;

/**
 * Tri-state env read: unset/empty keeps the old behaviour, a known value
 * selects the provider, anything else is a hard error — silently falling back
 * to GCP because of a typo would send clinical text to a provider the operator
 * believes they turned off.
 */
function readProvider<T extends string>(
  envVar: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = process.env[envVar];
  if (raw === undefined || raw.trim() === '') return fallback;

  const normalized = raw.trim().toLowerCase();
  const match = allowed.find((value) => value === normalized);
  if (!match) {
    throw new Error(
      `${envVar}="${raw}" is not a recognised provider. Use one of: ${allowed.join(' | ')}.`,
    );
  }
  return match;
}

export function resolveLlmProvider(): LlmProviderName {
  return readProvider('OKUVU_LLM_PROVIDER', ['vertex', 'bedrock'] as const, 'vertex');
}

/**
 * OKUVU_LLM_PROVIDER=bedrock → Bedrock; LLM_PROVIDER=gemini → Vertex;
 * otherwise OpenRouter. Same composition rule as the API dispatcher.
 */
export function resolveContentBackend(): ContentBackend {
  if (resolveLlmProvider() === 'bedrock') return 'bedrock';
  return process.env.LLM_PROVIDER === 'gemini' ? 'vertex' : 'openrouter';
}

/** Embeddings follow the LLM provider so one switch moves the whole worker. */
export function resolveEmbeddingProvider(): LlmProviderName {
  return resolveLlmProvider();
}

const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;

export function resolveAwsRegion(): string {
  const raw = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (raw === undefined || raw.trim() === '') return DEFAULT_AWS_REGION;

  const region = raw.trim();
  if (!REGION_PATTERN.test(region)) {
    throw new Error(
      `AWS_REGION="${region}" is not a valid AWS region name (expected something like ap-south-1).`,
    );
  }
  return region;
}

/** Per-call `params.model` wins, then BEDROCK_MODEL_ID, then the default. */
export function resolveBedrockModelId(override?: string): string {
  const model = override ?? process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID;
  const trimmed = model.trim();
  if (trimmed === '') {
    throw new Error('BEDROCK_MODEL_ID is set but empty — unset it to use the default model.');
  }
  return trimmed;
}

export function resolveBedrockEmbeddingModelId(): string {
  const model = process.env.BEDROCK_EMBEDDING_MODEL_ID ?? DEFAULT_BEDROCK_EMBEDDING_MODEL_ID;
  const trimmed = model.trim();
  if (trimmed === '') {
    throw new Error(
      'BEDROCK_EMBEDDING_MODEL_ID is set but empty — unset it to use the default model.',
    );
  }
  return trimmed;
}

/**
 * Dimensions the embedding call must return — pinned to the pgvector column
 * width (768). `bedrock.ts` refuses any other length so a mismatched model
 * fails at the seam instead of on the DB insert.
 */
export function resolveEmbeddingDimensions(): number {
  const raw = process.env.BEDROCK_EMBEDDING_DIMENSIONS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_EMBEDDING_DIMENSIONS;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `BEDROCK_EMBEDDING_DIMENSIONS="${raw}" must be a positive integer (the pgvector column width).`,
    );
  }
  return parsed;
}
