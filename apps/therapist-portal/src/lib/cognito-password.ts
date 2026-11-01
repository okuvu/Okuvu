import { createHmac } from 'node:crypto';
import {
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { cognitoIssuerParts, cognitoPortalConfig } from './cognito-config';

/**
 * Self-service password change, against the same therapist pool the portal
 * signs people in with.
 *
 * There is no forgot-password route in this app (the operator hands a password
 * out of SSM), which left every therapist holding a password they could never
 * rotate. This closes that hole without widening the blast radius: the caller
 * has to prove the current password to Cognito itself, and the write goes
 * through Cognito's own policy (14 chars, upper, lower, digit, symbol, and the
 * last five passwords are refused).
 *
 * Why USER_PASSWORD_AUTH + ChangePassword rather than AdminSetUserPassword:
 * ChangePassword is authorised by the access token the exchange itself just
 * minted, so the web app never gains the ability to set a password for an
 * address other than the one whose current password was just supplied. An
 * admin API call would need cognito-idp:AdminSetUserPassword on the task role —
 * a standing privilege that turns any future code path in this container into
 * an account takeover primitive. The pool's app client already allows
 * ALLOW_USER_PASSWORD_AUTH, so this costs no infrastructure change.
 */

export type ChangePasswordFailureCode =
  | 'NOT_CONFIGURED'
  | 'WRONG_CURRENT'
  | 'WEAK_PASSWORD'
  | 'REUSED_PASSWORD'
  | 'TOO_MANY_ATTEMPTS'
  | 'ERROR';

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; code: ChangePasswordFailureCode; message: string };

/** Minimum length Cognito enforces on this pool; mirrored for instant feedback. */
const MIN_LENGTH = 14;

/**
 * Cognito's SECRET_HASH: base64(HMAC-SHA256(clientSecret, username + clientId)).
 * Required because the portal's app client has a secret, and every InitiateAuth
 * call for a secret-bearing client must carry it.
 */
export function secretHash(
  username: string,
  clientId: string,
  clientSecret: string,
): string {
  return createHmac('sha256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

/**
 * Local mirror of the pool's policy. Cognito is still authoritative — this only
 * exists so a too-short password is rejected without a round trip (and so the
 * message names the rule that failed instead of Cognito's generic one).
 */
export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_LENGTH) {
    return `Use at least ${MIN_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Add at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add at least one symbol.';
  return null;
}

type SendFn = (command: object) => Promise<unknown>;

type ClientConfig = {
  region: string;
  clientId: string;
  clientSecret: string;
};

function resolveConfig(): ClientConfig | null {
  const portal = cognitoPortalConfig();
  const parts = cognitoIssuerParts();
  if (!portal || !parts) return null;
  return {
    region: parts.region,
    clientId: portal.clientId,
    clientSecret: portal.clientSecret,
  };
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : 'UnknownError';
}

/**
 * Change one address's password.
 *
 * `send` is injectable so the tests exercise the real mapping logic against a
 * fake Cognito rather than mocking the module's own behaviour.
 */
export async function changeCognitoPassword(params: {
  email: string;
  currentPassword: string;
  newPassword: string;
  send?: SendFn;
}): Promise<ChangePasswordResult> {
  const { email, currentPassword, newPassword } = params;

  const policyProblem = passwordPolicyError(newPassword);
  if (policyProblem) {
    return { ok: false, code: 'WEAK_PASSWORD', message: policyProblem };
  }

  const config = resolveConfig();
  if (!config) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'Password sign-in is not configured on this deployment.',
    };
  }

  const send: SendFn =
    params.send ??
    ((command) =>
      new CognitoIdentityProviderClient({ region: config.region }).send(
        command as never,
      ));

  let accessToken: string;
  try {
    // Proving the current password is the whole point of the exchange: the
    // access token this returns is what authorises the ChangePassword call, so
    // a wrong current password cannot reach the write at all.
    const auth = (await send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: currentPassword,
          SECRET_HASH: secretHash(email, config.clientId, config.clientSecret),
        },
      }),
    )) as { AuthenticationResult?: { AccessToken?: string } } | undefined;
    const token = auth?.AuthenticationResult?.AccessToken;
    if (!token) {
      return {
        ok: false,
        code: 'ERROR',
        message: 'Sign-in with the current password did not return a session.',
      };
    }
    accessToken = token;
  } catch (error) {
    const name = errorName(error);
    if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
      // Deliberately one message for both: whether the address exists is not
      // something an unauthenticated-shaped exchange should disclose.
      return {
        ok: false,
        code: 'WRONG_CURRENT',
        message: 'That current password is not correct.',
      };
    }
    if (
      name === 'TooManyRequestsException' ||
      name === 'LimitExceededException' ||
      name === 'TooManyFailedAttemptsException'
    ) {
      return {
        ok: false,
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many attempts. Wait a few minutes and try again.',
      };
    }
    return {
      ok: false,
      code: 'ERROR',
      message: 'Could not verify the current password. Try again.',
    };
  }

  try {
    await send(
      new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: currentPassword,
        ProposedPassword: newPassword,
      }),
    );
    return { ok: true };
  } catch (error) {
    const name = errorName(error);
    if (name === 'InvalidPasswordException') {
      return {
        ok: false,
        code: 'WEAK_PASSWORD',
        message: 'Cognito rejected that password under the pool policy.',
      };
    }
    if (
      name === 'PasswordHistoryPolicyViolationException' ||
      name === 'InvalidParameterException'
    ) {
      return {
        ok: false,
        code: 'REUSED_PASSWORD',
        message: 'Pick a password you have not used here before.',
      };
    }
    if (
      name === 'TooManyRequestsException' ||
      name === 'LimitExceededException'
    ) {
      return {
        ok: false,
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many attempts. Wait a few minutes and try again.',
      };
    }
    return {
      ok: false,
      code: 'ERROR',
      message: 'The password could not be changed. Try again.',
    };
  }
}
