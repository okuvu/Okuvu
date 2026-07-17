import { FastifyReply, FastifyRequest } from 'fastify';
import { verifyFirebaseToken } from '../lib/firebase-auth.js';

const BYPASS_UID = 'mock-firebase-uid-1';

const LOAD_TEST_MODE = process.env.LOAD_TEST_MODE === 'true';
const LOAD_TEST_KEY = process.env.LOAD_TEST_KEY;

function isBypassEnabled(): boolean {
  return process.env.LOCAL_DEV_BYPASS_AUTH === 'true';
}

export async function verifyFirebaseJWT(
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
    const payload = await verifyFirebaseToken(token);
    request.user = payload;
  } catch {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    });
  }
}
