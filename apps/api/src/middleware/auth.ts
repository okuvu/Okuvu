import { FastifyReply, FastifyRequest } from 'fastify';
import { verifyCognitoToken } from '../lib/cognito-auth.js';

/**
 * Bearer-token gate for every authenticated route.
 *
 * The token is a Cognito access/ID token from the mobile app's user pool; the
 * `sub` it yields is what `User.auth_subject` stores. This replaced Firebase
 * ID-token verification when the identity provider moved to Amazon Cognito
 * (docs/AWS-CUTOVER-SPEC.md) — the middleware contract (`request.user.uid`) did
 * not change, which is why no route needed touching beyond the import name.
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
    const payload = await verifyCognitoToken(token);
    request.user = payload;
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
