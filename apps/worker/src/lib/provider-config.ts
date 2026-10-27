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
