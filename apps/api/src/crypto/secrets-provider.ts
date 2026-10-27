import { resolveAwsRegion, resolveSecretsProvider, resolveSecretId } from '../lib/provider-config.js';

/**
 * Small secrets-provider seam: one function, two clouds.
 *
 * Before this module, `emergency-contact-encryption.ts` imported
 * `@google-cloud/secret-manager` directly, which made the API undeployable
 * outside GCP without editing the crypto code — the one place a wrong change
 * is unrecoverable (it would orphan every encrypted emergency-contact row).
 * Moving the fetch behind `getSecretValue(name)` keeps the crypto logic, the
 * key length check and the env-var-first ordering exactly as they were and
 * changes only *where the bytes come from*.
 *
 * Provider selection lives in `provider-config.ts`
 * (`OKUVU_SECRETS_PROVIDER=gcp|aws`, default `gcp`).
 *
 * SDKs are imported lazily on purpose: the API only needs one of them at
 * runtime, and `apps/test-harness` bundles apps/api modules directly — a
 * static import would drag both secret SDKs into that build.
 */

const GCP_PROJECT_ID = (): string => process.env.VERTEX_AI_PROJECT_ID ?? 'okuvu-dev';

export async function getSecretValue(secretName: string): Promise<string> {
  const provider = resolveSecretsProvider();

  if (provider === 'aws') {
    return getAwsSecretValue(secretName);
  }

  return getGcpSecretValue(secretName);
}

async function getGcpSecretValue(secretName: string): Promise<string> {
  const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
  const client = new SecretManagerServiceClient();
  const name = `projects/${GCP_PROJECT_ID()}/secrets/${secretName}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString();
  if (!payload) {
    throw new Error('Secret Manager returned empty payload');
  }
  return payload;
}

/**
 * AWS Secrets Manager.
 *
 * `SecretString` is returned verbatim unless it is a JSON object carrying the
 * value under a well-known key (`key`, `value`, or the logical secret name) —
 * that is the shape Secrets Manager's console produces for "other type of
 * secret", and the shape `infrastructure/aws/evia-beta/secrets.tf` uses for
 * the database URL. Binary secrets are not used for any key in this codebase.
 */
async function getAwsSecretValue(secretName: string): Promise<string> {
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    '@aws-sdk/client-secrets-manager'
  );

  const client = new SecretsManagerClient({ region: resolveAwsRegion() });
  const secretId = resolveSecretId(secretName);

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  const raw = response.SecretString;
  if (!raw) {
    throw new Error(`Secrets Manager returned an empty payload for secret "${secretId}"`);
  }

  return extractSecretString(raw, secretName);
}

/**
 * Accept either a raw value (`openssl rand -base64 32` pasted into a plain
 * secret) or a JSON wrapper. A JSON object that carries none of the known
 * keys is returned as-is rather than guessed at — a wrong 32-byte lookup
 * would otherwise surface as a confusing AES-GCM decrypt failure later.
 */
function extractSecretString(raw: string, secretName: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return raw;
  }

  const record = parsed as Record<string, unknown>;
  for (const candidateKey of ['key', 'value', secretName]) {
    const candidate = record[candidateKey];
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }

  return raw;
}
