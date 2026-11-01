import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { verifyOtpAndLinkPhone } from '../lib/auth-otp.js';
import { resolveGoogleAccount } from '../lib/auth-google.js';
import { GoogleTokenError, verifyGoogleIdToken } from '../lib/google-auth.js';
import { mintSessionToken, SessionTokenError } from '../lib/session-token.js';

interface VerifyOtpBody {
  phone_number?: string;
}

interface GoogleSignInBody {
  id_token?: string;
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

      if (typeof id_token !== 'string' || id_token.trim().length === 0) {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'id_token is required' },
        });
      }

      let identity;
      try {
        identity = await verifyGoogleIdToken(id_token.trim());
      } catch (err) {
        if (err instanceof GoogleTokenError) {
          if (err.reason === 'config_missing') {
            request.log.error({ err }, 'Google sign-in is not configured');
            return reply.status(503).send({
              error: {
                code: 'SIGN_IN_NOT_CONFIGURED',
                message: 'Sign-in is not configured on this server.',
              },
            });
          }
          // Deliberately opaque: which check failed (signature vs audience vs
          // expiry) is a probing oracle. The reason is on the error for
          // server-side debugging.
          request.log.warn({ reason: err.reason }, 'Google ID token rejected');
          return reply.status(401).send({
            error: {
              code: 'INVALID_GOOGLE_TOKEN',
              message: 'Google sign-in could not be verified. Please try again.',
            },
          });
        }
        throw err;
      }

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
