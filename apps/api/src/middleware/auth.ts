import { FastifyReply, FastifyRequest } from 'fastify';
import { verifyCognitoToken } from '../lib/cognito-auth.js';
import { looksLikeSessionToken, verifySessionToken } from '../lib/session-token.js';

/**
 * Bearer-token gate for every authenticated route.
 *
 * Two token families are accepted, chosen by their (unverified) issuer and then
 * fully verified by the matching verifier:
 *
 * - `okuvu-api` — the session token minted by `POST /auth/google`. This is the
 *   mobile app's token since sign-in moved to Google; `sub` is the Google
 *   subject.
 * - Cognito — an access/ID token from the user pool, still accepted so a build
 *   or a session that predates the switch keeps working. Retire it together
 *   with `lib/cognito-auth.ts`.
 *
 * Either way the middleware produces the same thing — `request.user.uid`, the
 * value `User.auth_subject` stores — so no route below knows the difference.
 * The issuer peek exists only so a session token never triggers a Cognito JWKS
 * fetch; it makes no trust decision.
 */

const BYPASS_UID = 'dev-bypass-subject-1';

const LOAD_TEST_MODE = process.env.LOAD_TEST_MODE === 'true';
const LOAD_TEST_KEY = process.env.LOAD_TEST_KEY;

function isBypassEnabled(): boolean {
  return process.env.LOCAL_DEV_BYPASS_AUTH === 'true';
}

export async function verifyCognitoJWT(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (LOAD_TEST_MODE && LOAD_TEST_KEY) {
    const loadTestKey = request.headers['x-load-test-key'];
    if (loadTestKey === LOAD_TEST_KEY) {
      const vuId = (request.headers['x-load-test-vu-id'] as string) || '0';
      request.user = { uid: `load-test-vu-${vuId}` };
      return;
    }
  }

  if (isBypassEnabled()) {
    request.user = { uid: BYPASS_UID };
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader) {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing Authorization header',
      },
    });
    return;
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  try {
    const payload = looksLikeSessionToken(token)
      ? await verifySessionToken(token)
      : await verifyCognitoToken(token);
    request.user = { uid: payload.uid };
  } catch {
    // Deliberately opaque: a client learns only that the token is no good, not
    // why (expired vs wrong pool vs bad signature) — that detail is a probing
    // oracle. The reason is on the verifier's thrown CognitoTokenError for
    // anyone debugging server-side.
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    });
  }
}
