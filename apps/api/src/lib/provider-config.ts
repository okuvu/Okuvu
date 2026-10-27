/**
 * Single place that decides which cloud backs each provider seam in this
 * service: the LLM/embedding client, the summary queue and the secrets store.
 *
 * Why a dedicated module: the GCP → AWS migration adds a second
 * implementation behind three existing interfaces (`vertex-ai.ts`,
 * `summary-enqueue.ts`, Secret Manager in
 * `crypto/emergency-contact-encryption.ts`). If each caller decided for
 * itself which one to use, "which provider is live in production?" would be
 * answerable only by reading every call site. Every resolution rule lives
 * here instead; the provider modules themselves stay dumb.
 *
 * Every default is the pre-migration GCP behaviour. An environment that sets
 * none of the new variables runs byte-for-byte the same code paths as before
 * (all 999 existing API tests rely on that), and rolling back is unsetting a
 * variable — not a redeploy of different code.
 *
 * | seam      | env var                  | values                | default      |
 * |-----------|--------------------------|-----------------------|--------------|
 * | LLM/embed | OKUVU_LLM_PROVIDER       | vertex \| bedrock     | vertex       |
 * | queue     | OKUVU_QUEUE_PROVIDER     | cloudtasks \| sqs     | cloudtasks   |
 * | secrets   | OKUVU_SECRETS_PROVIDER   | gcp \| aws            | gcp          |
 *
 * Interaction with the pre-existing `LLM_PROVIDER` var (openrouter | gemini):
 * that var chooses between the *agent-facing* providers and is untouched.
 * `OKUVU_LLM_PROVIDER` selects which *Vertex-family backend* the `gemini`
 * branch actually talks to, so `OKUVU_LLM_PROVIDER=bedrock` takes precedence
 * over `LLM_PROVIDER` (see `resolveContentBackend`).
 */

export type LlmProviderName = 'vertex' | 'bedrock';
export type QueueProviderName = 'cloudtasks' | 'sqs';
export type SecretsProviderName = 'gcp' | 'aws';

/** What `generate-content.ts` should call. `vertex` is the legacy Gemini branch. */
export type ContentBackend = 'bedrock' | 'vertex' | 'openrouter';

/**
 * ap-south-1 (Mumbai) is the only region that satisfies the DPDP 2026 data
 * residency constraint the GCP stack already enforced with asia-south1.
 * `infrastructure/aws/evia-beta/variables.tf` pins the same region.
 */
export const DEFAULT_AWS_REGION = 'ap-south-1';

/**
 * Amazon Nova Pro is served *in-region* in ap-south-1 and supports Bedrock
 * tool use (which `bedrock.ts` relies on for schema-constrained JSON). Claude
 * on Bedrock in ap-south-1 is only reachable through an APAC cross-region
 * inference profile (`apac.anthropic.…`), which moves prompt data outside
 * India — a DPDP question, not a code one. Override per environment with
 * BEDROCK_MODEL_ID rather than editing this constant.
 */
export const DEFAULT_BEDROCK_MODEL_ID = 'amazon.nova-pro-v1:0';

/**
 * Titan Text Embeddings V2 is the one Bedrock embedding model that can emit
 * the 768 dimensions `packages/prisma/schema.prisma` pins
 * (`SessionLog.summary_embedding Unsupported("vector(768)")`). Titan V1 is
 * 1536-dim and Cohere Embed is 1024-dim — see `bedrock.ts`.
 */
export const DEFAULT_BEDROCK_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;

/**
 * Read a tri-state env var: unset/empty means "keep the old behaviour",
 * a known value selects the provider, anything else is a hard error.
 *
 * Throwing on an unrecognised value is deliberate: silently falling back to
 * GCP because someone typed `bedrock-aws` would send clinical prompts to a
 * provider the operator believes they turned off. Both values are logged by
 * the failure message so the mistake is obvious.
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

export function resolveQueueProvider(): QueueProviderName {
  return readProvider('OKUVU_QUEUE_PROVIDER', ['cloudtasks', 'sqs'] as const, 'cloudtasks');
}

export function resolveSecretsProvider(): SecretsProviderName {
  return readProvider('OKUVU_SECRETS_PROVIDER', ['gcp', 'aws'] as const, 'gcp');
}

/**
 * Which backend `generate-content.ts` dispatches to. The only composition
 * rule in the codebase between the old `LLM_PROVIDER` switch and the new
 * `OKUVU_LLM_PROVIDER` switch, on purpose:
 *
 *   OKUVU_LLM_PROVIDER=bedrock  → Bedrock (explicit opt-in wins)
 *   LLM_PROVIDER=gemini         → Vertex/Gemini (unchanged rollback path)
 *   anything else               → OpenRouter (unchanged default)
 */
export function resolveContentBackend(): ContentBackend {
  if (resolveLlmProvider() === 'bedrock') return 'bedrock';
  return process.env.LLM_PROVIDER === 'gemini' ? 'vertex' : 'openrouter';
}

/** Embeddings follow the LLM provider so a single switch moves a whole environment. */
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

/**
 * Bedrock model id for this call. `params.model` (the per-call override every
 * agent already threads through) wins, then BEDROCK_MODEL_ID, then the
 * in-region default. Unlike Vertex, this is a bare Bedrock model id — there is
 * no project/publisher resource path to build.
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
 * width (768); `bedrock.ts` refuses to return a vector of any other length so
 * a mismatched model fails at the seam instead of on the DB insert or, worse,
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
 * `infrastructure/aws/evia-beta/ecs.tf` already injects), so the Terraform
 * stack and the env template do not have to be reconciled before the first
 * deploy.
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
 * environments. No prefix means the bare name, which is also the GCP secret
 * name — the same key value can therefore live under the same logical name in
 * both clouds during the cutover.
 */
export function resolveSecretId(secretName: string): string {
  const prefix = process.env.AWS_SECRETS_PREFIX;
  if (prefix === undefined || prefix.trim() === '') return secretName;
  return `${prefix.trim().replace(/\/+$/, '')}/${secretName}`;
}

/**
 * Boot-time check for variables the *active* AWS providers cannot invent a
 * default for. Region, model id and embedding width all have safe defaults;
 * the queue URL does not, so `OKUVU_QUEUE_PROVIDER=sqs` without a URL is the
 * one configuration that must be reported. Returns names only — callers log
 * them, they never throw (same contract as `validateCloudTasksConfig`, which
 * keeps a misconfigured deploy serving traffic instead of crash-looping).
 */
export function validateAwsConfig(): string[] {
  const missing: string[] = [];

  if (resolveQueueProvider() === 'sqs') {
    const queueUrl = process.env.SQS_QUEUE_URL ?? process.env.SQS_SUMMARY_QUEUE_URL;
    if (!queueUrl || queueUrl.trim() === '') missing.push('SQS_QUEUE_URL');
  }

  return missing;
}
