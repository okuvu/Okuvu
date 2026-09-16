import { FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();

function isBypassEnabled(): boolean {
  return process.env.LOCAL_DEV_BYPASS_AUTH === 'true';
}

export async function verifyOidcToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isBypassEnabled()) {
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
    // Cloud Tasks mints the token with audience: env.workerUrl (see
    // apps/api/src/lib/summary-enqueue.ts) specifically so it can't be
    // replayed against a different Cloud Run service using the same
    // service account. Omitting `audience` here skipped that check
    // entirely — google-auth-library only validates the `aud` claim when
    // it's passed, so the only real check left was the email match below,
    // which any token minted by this SA for any audience would still pass.
    const expectedAudience = process.env.CLOUD_TASKS_WORKER_URL;
    const ticket = await client.verifyIdToken({
      idToken: token,
      ...(expectedAudience ? { audience: expectedAudience } : {}),
    });
    const payload = ticket.getPayload();
    const expectedEmail = process.env.WORKER_SERVICE_ACCOUNT_EMAIL;

    if (!payload || !payload.email) {
      throw new Error('OIDC token missing email claim');
    }

    if (expectedEmail && payload.email !== expectedEmail) {
      request.log.warn(
        { tokenEmail: payload.email, expectedEmail },
        'OIDC token email mismatch',
      );
      throw new Error('Service account email mismatch');
    }
  } catch {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired OIDC token',
      },
    });
  }
}
