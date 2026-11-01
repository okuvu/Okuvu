/**
 * Therapist portal sign-in configuration.
 *
 * Read straight from the environment the ECS task definition injects
 * (infrastructure/aws/evia-beta/portal.tf): the therapist user pool's app
 * client id, its secret, and the pool's OIDC issuer.
 *
 * There is deliberately no default value, no credential in the repository and
 * no fallback branch: if any of the three is missing this deployment simply
 * cannot sign anyone in. That is the whole point — a shared or hardcoded
 * "demo" account is not a lower rung on a ladder, it is a bypass of the
 * identity provider.
 */
export type CognitoPortalConfig = {
  clientId: string;
  clientSecret: string;
  issuer: string;
};

export function cognitoPortalConfig(): CognitoPortalConfig | null {
  const clientId = process.env.COGNITO_THERAPIST_CLIENT_ID?.trim();
  const clientSecret = process.env.COGNITO_THERAPIST_CLIENT_SECRET?.trim();
  const issuer = process.env.COGNITO_ISSUER?.trim();

  // The provider's discovery document is derived from `issuer`, so a partial
  // config is as unusable as no config at all.
  if (!clientId || !clientSecret || !issuer) {
    return null;
  }

  return { clientId, clientSecret, issuer };
}

export function isCognitoConfigured(): boolean {
  return cognitoPortalConfig() !== null;
}

/**
 * Region and pool id, read out of the issuer.
 *
 * The issuer is the only piece of the deployment that names *where* the pool
 * lives (`https://cognito-idp.<region>.amazonaws.com/<poolId>`), so a password
 * change can address Cognito directly without a second pair of env vars that
 * could drift from it. No default region: an unparseable issuer means this
 * deployment cannot sign in, so it cannot change a password either.
 */
export function cognitoIssuerParts(): { region: string; userPoolId: string } | null {
  const issuer = process.env.COGNITO_ISSUER?.trim();
  if (!issuer) return null;
  const match = /^https:\/\/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com\/([A-Za-z0-9_-]+)\/?$/.exec(
    issuer,
  );
  if (!match) return null;
  return { region: match[1], userPoolId: match[2] };
}
