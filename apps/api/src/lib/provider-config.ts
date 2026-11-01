/**
 * Single place that decides how this service talks to AWS: which region, which
 * Bedrock models, which SQS queue and which Secrets Manager id.
 *
 * This module used to also carry `OKUVU_LLM_PROVIDER` / `OKUVU_QUEUE_PROVIDER`
 * / `OKUVU_SECRETS_PROVIDER` switches with GCP as the default, so one
 * deployment could run either cloud. The GCP side is gone (see
 * docs/AWS-CUTOVER-SPEC.md): there is exactly one implementation per seam now,
 * so "which provider is live?" has one answer and cannot be flipped by an env
 * var left over from an old deploy. The retired switch names are inert —
 * `provider-seams` tests pin that setting them changes nothing.
 *
 * One branch remains, and it is legacy rather than cloud-selecting:
 * `LLM_PROVIDER` (openrouter | bedrock) picks the agent-facing backend.
 */

/** What `generate-content.ts` should call. */
export type ContentBackend = 'bedrock' | 'openrouter';

/**
 * ap-south-1 (Mumbai) is the only region that satisfies the DPDP 2026 data
 * residency constraint the previous stack enforced with asia-south1.
 * `infrastructure/aws/evia-beta/variables.tf` pins the same region.
 */
export const DEFAULT_AWS_REGION = 'ap-south-1';

/**
 * Qwen3 32B (dense; the model itself reports a 32,768-token maximum output — see
 * evidence/E17-S2.md §4a, where the service rejected `maxTokens: 100000` with
 * "exceeds the model limit of 32768". This comment used to claim 8K, which was
 * wrong; nothing here caps output at 8K) is served *in-region* in
 * ap-south-1 and supports client-side tool use with `toolSpec.strict`, which is
 * the mechanism `bedrock.ts` relies on for schema-constrained JSON. It replaced
 * Nova Pro as the default on 28 Oct 2026 after the A1/A9-post case set was run
 * against the live in-region endpoint (16/16 intake labels, 15/15 reply
 * reviews, no dangerous under-escalations, three consecutive runs).
 *
 * The per-call output budget is `DEFAULT_MAX_OUTPUT_TOKENS` (2048, see
 * `llm-types.ts`) — a product choice well under the model's 32,768 ceiling, not
 * a model limit.
 *
 * Thinking is off by default for this model on Converse — no reasoning tokens
 * are emitted unless the prompt asks for them — so the 2048-token cap is spent
 * on the answer rather than on a scratchpad.
 *
 * Claude on Bedrock in ap-south-1 is only reachable through an APAC
 * cross-region inference profile (`apac.anthropic.…`), which moves prompt data
 * outside India — a DPDP question, not a code one. Override per environment
 * with BEDROCK_MODEL_ID rather than editing this constant.
 */
export const DEFAULT_BEDROCK_MODEL_ID = 'qwen.qwen3-32b-v1:0';

/**
 * Titan Text Embeddings V2 is the one Bedrock embedding model that can emit the
 * 768 dimensions `packages/prisma/schema.prisma` pins
 * (`SessionLog.summary_embedding Unsupported("vector(768)")`). Titan V1 is
 * 1536-dim and Cohere Embed is 1024-dim — see `bedrock.ts`.
 */
export const DEFAULT_BEDROCK_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;

/**
 * Which backend `generate-content.ts` dispatches to.
 *
 *   LLM_PROVIDER=bedrock  → Amazon Bedrock
 *   anything else         → OpenRouter (default, unchanged)
 */
export function resolveContentBackend(): ContentBackend {
  return process.env.LLM_PROVIDER === 'bedrock' ? 'bedrock' : 'openrouter';
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

/**
 * Bedrock model id for this call. `params.model` (the per-call override every
 * agent already threads through) wins, then BEDROCK_MODEL_ID, then the
 * in-region default. This is a bare Bedrock model id — there is no
 * project/publisher resource path to build.
 */
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
 * Dimensions the embedding call must return. Pinned to the pgvector column
 * width (768); `bedrock.ts` refuses to return a vector of any other length so a
 * mismatched model fails at the seam instead of on the DB insert or, worse,
 * silently poisoning similarity search with a partially-written row.
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

/**
 * SQS queue the API enqueues summary jobs onto. Two names are accepted:
 * `SQS_QUEUE_URL` (documented name) and `SQS_SUMMARY_QUEUE_URL` (what
 * `infrastructure/aws/evia-beta/ecs.tf` injects), so the Terraform stack and
 * the env template do not have to be reconciled before the first deploy.
 */
export function resolveSqsQueueUrl(): string | undefined {
  const raw = process.env.SQS_QUEUE_URL ?? process.env.SQS_SUMMARY_QUEUE_URL;
  if (raw === undefined || raw.trim() === '') return undefined;

  const url = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SQS_QUEUE_URL="${url}" is not a valid URL.`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`SQS_QUEUE_URL="${url}" must be an http(s) URL.`);
  }
  if (parsed.pathname.replace(/^\/+/, '') === '') {
    throw new Error(
      `SQS_QUEUE_URL="${url}" is missing the queue name path segment (expected .../123456789012/queue-name).`,
    );
  }
  return url;
}

/**
 * Secrets Manager id for a logical secret name, with an optional
 * `AWS_SECRETS_PREFIX` (e.g. `evia-beta/`) so one account can host several
 * environments. No prefix means the bare name.
 */
export function resolveSecretId(secretName: string): string {
  const prefix = process.env.AWS_SECRETS_PREFIX;
  if (prefix === undefined || prefix.trim() === '') return secretName;
  return `${prefix.trim().replace(/\/+$/, '')}/${secretName}`;
}

/**
 * Boot-time check for variables AWS cannot invent a default for. Region, model
 * id and embedding width all have safe defaults; the queue URL and the Cognito
 * pool do not. Returns names only — callers log them, they never throw, so a
 * misconfigured deploy keeps serving traffic instead of crash-looping.
 */
export function validateAwsConfig(): string[] {
  const missing: string[] = [];

  if (!resolveSqsQueueUrl()) missing.push('SQS_QUEUE_URL');

  for (const name of ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'] as const) {
    const value = process.env[name];
    if (!value || value.trim() === '') missing.push(name);
  }

  return missing;
}
