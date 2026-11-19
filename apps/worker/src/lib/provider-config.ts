/**
 * AWS settings for the worker's LLM + embedding calls.
 *
 * The AWS cutover (docs/AWS-CUTOVER-SPEC.md) collapsed the provider seams: the
 * `OKUVU_LLM_PROVIDER` / `OKUVU_QUEUE_PROVIDER` / `OKUVU_SECRETS_PROVIDER`
 * switches and their non-AWS branches are deleted, not defaulted. What is left
 * is a single implementation, so this module only resolves *its* settings —
 * region, model ids, embedding width — and validates them loudly. There is no
 * branch here to accidentally leave pointed at another cloud; rollback is a
 * redeploy, not an env flip.
 *
 * Mirror of `apps/api/src/lib/provider-config.ts` (minus the queue and secrets
 * seams, which the worker does not own): apps/api and apps/worker are separate
 * deployable services that share only packages/prisma and
 * packages/shared-types, so this cannot be a cross-app import. Keep the two in
 * step — same env var names, same defaults, same validation.
 */

/** ap-south-1 (Mumbai) — the DPDP-compliant region the AWS stack pins. */
export const DEFAULT_AWS_REGION = 'ap-south-1';

/**
 * Qwen3 32B is served in-region in ap-south-1 and supports client-side tool
 * use with `toolSpec.strict`, which `bedrock.ts` relies on for
 * schema-constrained JSON. Default since 28 Oct 2026 (was Nova Pro), matching
 * the API app — keep the two in step.
 *
 * Claude on Bedrock in ap-south-1 requires an APAC cross-region inference
 * profile (`apac.anthropic.…`), which moves data outside India — override with
 * BEDROCK_MODEL_ID per environment rather than editing this constant.
 */
export const DEFAULT_BEDROCK_MODEL_ID = 'qwen.qwen3-32b-v1:0';

/** Titan V2 is the only Bedrock embedding model that can emit 768 dims. */
export const DEFAULT_BEDROCK_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;

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

/**
 * SQS queue this worker *consumes* summary jobs from (A6 in
 * docs/AWS-MIGRATION-PLAN.md — the consumer that replaced the Cloud Tasks OIDC
 * HTTP endpoint).
 *
 * Same two accepted names as `apps/api/src/lib/provider-config.ts`, because
 * both sides must agree on one queue: `SQS_SUMMARY_QUEUE_URL` is what
 * `infrastructure/aws/evia-beta/ecs.tf` injects through
 * `local.shared_environment` (api and worker share that block), and
 * `SQS_QUEUE_URL` is the documented name in the env template. Reading only one
 * of them is how a deployed worker ends up polling nothing while the api
 * happily enqueues — the exact failure this consumer exists to fix.
 *
 * Returns `undefined` when unset so the caller can log a named verdict instead
 * of throwing at import time; a bad *value* throws, because that is a
 * misconfiguration the operator has to see.
 */
export function resolveSqsQueueUrl(): string | undefined {
  // First *non-empty* of the two accepted names. An env var set to "" (the
  // shape `vi.stubEnv` and some ECS definitions produce) must fall through to
  // the next name instead of counting as "configured but empty", which would
  // disable the consumer silently — the precise failure this file exists to end.
  const raw = [process.env.SQS_QUEUE_URL, process.env.SQS_SUMMARY_QUEUE_URL].find(
    (value) => value !== undefined && value.trim() !== '',
  );
  if (raw === undefined) return undefined;

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
