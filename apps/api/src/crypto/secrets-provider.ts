import { resolveAwsRegion, resolveSecretId } from '../lib/provider-config.js';

/**
 * Secrets lookup: AWS Secrets Manager only.
 *
 * `emergency-contact-encryption.ts` needs the AES-GCM key material for
 * encrypted emergency-contact rows. If that lookup is wrong the data is
 * unrecoverable, so the key fetch lives behind one function (`getSecretValue`)
 * and the crypto code above it — key length check, env-var-first ordering —
 * never learns where the bytes came from. That ordering is also why the env var
 * still wins: an operator rotating a key locally must not need Secrets Manager.
 *
 * The previous implementation dispatched between Google Secret Manager and
 * Secrets Manager. The GCP branch is gone (docs/AWS-CUTOVER-SPEC.md); there is
 * no switch left to get wrong.
 *
 * The SDK is imported lazily on purpose: `apps/test-harness` bundles apps/api
 * modules directly, and a static import would drag the AWS SDK into that build.
 */

export async function getSecretValue(secretName: string): Promise<string> {
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
 * secret) or a JSON wrapper. A JSON object that carries none of the known keys
 * is returned as-is rather than guessed at — a wrong 32-byte lookup would
 * otherwise surface as a confusing AES-GCM decrypt failure later.
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
