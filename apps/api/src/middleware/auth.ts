import { FastifyReply, FastifyRequest } from 'fastify';

const BYPASS_UID = 'mock-firebase-uid-1';

function isBypassEnabled(): boolean {
  return process.env.LOCAL_DEV_BYPASS_AUTH === 'true';
}

async function verifyFirebaseToken(token: string): Promise<{ uid: string }> {
  throw new Error('Real Firebase verification not yet implemented');
}

export async function verifyFirebaseJWT(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
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
