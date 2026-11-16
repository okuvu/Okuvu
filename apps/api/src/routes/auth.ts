import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { verifyOtpAndLinkPhone } from '../lib/auth-otp.js';
import { resolveGoogleAccount } from '../lib/auth-google.js';
import { GoogleTokenError, verifyGoogleIdToken } from '../lib/google-auth.js';
import { mintSessionToken, SessionTokenError } from '../lib/session-token.js';
import {
  createSelfServeAccount,
  type SelfServeConsents,
} from '../lib/self-serve-signup.js';

interface VerifyOtpBody {
  phone_number?: string;
}

interface GoogleSignInBody {
  id_token?: string;
}

interface SignUpBody {
  id_token?: string;
  adult?: boolean;
  consents?: Partial<SelfServeConsents>;
}

type VerifiedIdentity = { sub: string; email: string };

/**
 * Verify a Google ID token or answer the request. Shared by `/auth/google` and
 * `/auth/signup` so the two can never disagree about what a bad token means —
 * `null` means the reply has already been sent.
 */
async function verifyIdentityOrReply(
  rawIdToken: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<VerifiedIdentity | null> {
  if (typeof rawIdToken !== 'string' || rawIdToken.trim().length === 0) {
    reply.status(400).send({
      error: { code: 'INVALID_BODY', message: 'id_token is required' },
    });
    return null;
  }

  try {
    const identity = await verifyGoogleIdToken(rawIdToken.trim());
    return { sub: identity.sub, email: identity.email };
  } catch (err) {
    if (err instanceof GoogleTokenError) {
      if (err.reason === 'config_missing') {
        request.log.error({ err }, 'Google sign-in is not configured');
        reply.status(503).send({
          error: {
            code: 'SIGN_IN_NOT_CONFIGURED',
            message: 'Sign-in is not configured on this server.',
          },
        });
        return null;
      }
      // Deliberately opaque: which check failed (signature vs audience vs
      // expiry) is a probing oracle. The reason is on the error for
      // server-side debugging.
      request.log.warn({ reason: err.reason }, 'Google ID token rejected');
      reply.status(401).send({
        error: {
          code: 'INVALID_GOOGLE_TOKEN',
          message: 'Google sign-in could not be verified. Please try again.',
        },
      });
      return null;
    }
    throw err;
  }
}

export async function authRoute(app: FastifyInstance): Promise<void> {
  /**
   * Primary mobile sign-in: a Google ID token from the Flutter client.
   *
   * Returns a session token even when no Okuvu account exists yet
   * (`has_account: false`), because the client has to be authenticated to
   * redeem an invite (`POST /invites/redeem`) before its account means anything.
   * That is not an authorisation widening: every other route keys on
   * `User.auth_subject`, and a subject with no `User` row reaches nothing.
   *
   * Replaces phone-OTP as the *primary* path — no SMS, so no TRAI DLT
   * registration before launch. The OTP route below is kept because Cognito
   * tokens still verify (middleware accepts both): nothing that already holds a
   * Cognito token is locked out by this change.
   */
  app.post<{ Body: GoogleSignInBody }>('/auth/google', {
    // Unauthenticated endpoint that mints 30-day tokens. 20/minute per source
    // IP is far above a real sign-in and far below a useful brute-force rate
    // against Google's token verification.
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const { id_token } = (request.body ?? {}) as GoogleSignInBody;

      const identity = await verifyIdentityOrReply(id_token, request, reply);
      if (!identity) return reply;

      const account = await resolveGoogleAccount(identity.sub, identity.email);

      if (account.status === 'email_in_use') {
        return reply.status(409).send({
          error: {
            code: 'EMAIL_IN_USE',
            message:
              'This email is already connected to a different sign-in method. Please contact support.',
          },
        });
      }

      if (account.status === 'account_deleted') {
        return reply.status(403).send({
          error: { code: 'ACCOUNT_DELETED', message: 'This account has been closed.' },
        });
      }

      let session;
      try {
        session = mintSessionToken(identity.sub);
      } catch (err) {
        if (err instanceof SessionTokenError) {
          request.log.error({ reason: err.reason }, 'Cannot mint session token');
          return reply.status(503).send({
            error: {
              code: 'SIGN_IN_NOT_CONFIGURED',
              message: 'Sign-in is not configured on this server.',
            },
          });
        }
        throw err;
      }

      const hasAccount = account.status === 'existing_user' || account.status === 'linked';

      // Logged as an event, not a message, so sign-ins show up in CloudWatch
      // without the token or the full identity ever reaching a log line.
      request.log.info(
        {
          event: 'google_sign_in',
          has_account: hasAccount,
          linked: account.status === 'linked',
          subject_prefix: identity.sub.slice(0, 8),
        },
        'Google sign-in verified',
      );

      return reply.send({
        token: session.token,
        expires_at: session.expiresAt,
        has_account: hasAccount,
        user_id: hasAccount && 'userId' in account ? account.userId : null,
        phone_number: hasAccount && 'phoneNumber' in account ? account.phoneNumber : null,
        email: identity.email,
        linked: account.status === 'linked',
      });
    },
  });

  /**
   * Self-serve onboarding: create the client's own account.
   *
   * The alternative to the portal's Add-Client wizard. A stranger installs the
   * app, signs in with Google (`POST /auth/google` → `has_account: false`), is
   * shown the 18+ question and the consent cards, and this call — carrying the
   * same Google ID token plus their answers — creates the `User` row.
   *
   * Deliberately a *separate* call from sign-in rather than a side effect of
   * it: an identity check on its own still creates nothing, so a token replayed
   * at `/auth/google` can never mint accounts. Here the account exists only
   * because the person answered the age question and accepted the mandatory
   * safety-monitoring consent in the same request.
   *
   * What it does not create: a therapist assignment and a care plan. Those are
   * the operator's, from the console's unassigned list. Until then the client
   * sees the whole app with no care plan, which is what makes the agent's turns
   * non-directional rather than a guess at CP1.
   */
  app.post<{ Body: SignUpBody }>('/auth/signup', {
    // Same shape as `/auth/google`: unauthenticated, mints a 30-day token, so
    // rate-limited per source IP well above a real retry and far below a
    // useful brute force.
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const body = (request.body ?? {}) as SignUpBody;

      if (typeof body.adult !== 'boolean') {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'adult (boolean) is required' },
        });
      }

      // The safety-monitoring card is "Always on" in the app, so a payload that
      // does not carry it is not an onboarding this product accepts. Validated
      // here, not just in the client: the gate has to live in the write.
      if (body.consents?.safety_monitoring !== true) {
        return reply.status(400).send({
          error: {
            code: 'CONSENT_REQUIRED',
            message: 'Safety monitoring consent is required.',
          },
        });
      }

      const identity = await verifyIdentityOrReply(body.id_token, request, reply);
      if (!identity) return reply;

      const result = await createSelfServeAccount(identity.sub, identity.email, body.adult, {
        safety_monitoring: true,
        mood_inference: body.consents?.mood_inference === true,
        assessment: body.consents?.assessment === true,
        emergency_contact: false,
      });

      request.log.info(
        {
          event: 'self_serve_signup',
          status: result.status,
          adult: body.adult,
          subject_prefix: identity.sub.slice(0, 8),
        },
        'Self-serve signup attempt',
      );

      switch (result.status) {
        case 'email_in_use':
          return reply.status(409).send({
            error: {
              code: 'EMAIL_IN_USE',
              message:
                'This email is already connected to a different sign-in method. Please contact support.',
            },
          });
        case 'account_deleted':
          return reply.status(403).send({
            error: { code: 'ACCOUNT_DELETED', message: 'This account has been closed.' },
          });
        case 'age_declined':
          return reply.status(403).send({
            error: {
              code: 'UNDER_18',
              message: 'Okuvu is for adults 18 and over.',
            },
          });
        case 'created':
        case 'linked':
        case 'already_registered': {
          // The client already holds a session from `/auth/google`, but the
          // build that reaches signup after a restart may not; returning one
          // makes this call self-sufficient without a second Google prompt.
          let session: { token: string; expiresAt: number } | null = null;
          try {
            session = mintSessionToken(identity.sub);
          } catch (err) {
            if (!(err instanceof SessionTokenError)) throw err;
            request.log.error({ reason: err.reason }, 'Cannot mint session token');
          }

          return reply.send({
            has_account: true,
            user_id: result.userId,
            email: result.email ?? identity.email,
            linked: result.status === 'linked',
            already_registered: result.status === 'already_registered',
            token: session?.token ?? null,
            expires_at: session?.expiresAt ?? null,
          });
        }
      }
    },
  });

  /**
   * Legacy/parallel path: a Cognito-verified phone number linked to the
   * client's `User` row. Still gated behind a valid Cognito token, so it is not
   * an open account-creation endpoint.
   */
  app.post<{ Body: VerifyOtpBody }>('/auth/verify-otp', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { phone_number } = (request.body ?? {}) as VerifyOtpBody;

      const result = await verifyOtpAndLinkPhone(uid, phone_number);

      switch (result.status) {
        case 'invalid_phone_format':
          return reply.status(400).send({
            error: {
              code: 'INVALID_PHONE_FORMAT',
              message: 'phone_number must be in E.164 format (e.g. +1234567890)',
            },
          });
        case 'no_account':
          return reply.status(404).send({
            error: {
              code: 'NO_ACCOUNT',
              message: 'No OKUVU account found for this phone number. Use your invite code to activate your account.',
            },
          });
        case 'existing_user':
          return reply.send({
            user_id: result.userId,
            is_new_user: false,
          });
      }
    },
  });
}
