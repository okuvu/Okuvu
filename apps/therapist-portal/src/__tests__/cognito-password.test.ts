import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  changeCognitoPassword,
  passwordPolicyError,
  secretHash,
} from '@/lib/cognito-password';
import { cognitoIssuerParts } from '@/lib/cognito-config';

const ISSUER = 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_eaJaK7g4g';

function configureCognito() {
  vi.stubEnv('COGNITO_THERAPIST_CLIENT_ID', 'test-client-id');
  vi.stubEnv('COGNITO_THERAPIST_CLIENT_SECRET', 'test-client-secret');
  vi.stubEnv('COGNITO_ISSUER', ISSUER);
}

/** Fake Cognito: answers InitiateAuth, records every command it was given. */
function fakeCognito(options: {
  authError?: Error;
  changeError?: Error;
} = {}) {
  const seen: { name: string; input: Record<string, unknown> }[] = [];
  const send = async (command: object) => {
    const shaped = command as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    const name = shaped.constructor.name;
    seen.push({ name, input: shaped.input });
    if (name === 'InitiateAuthCommand') {
      if (options.authError) throw options.authError;
      return { AuthenticationResult: { AccessToken: 'access-token-from-cognito' } };
    }
    if (name === 'ChangePasswordCommand') {
      if (options.changeError) throw options.changeError;
      return {};
    }
    throw new Error(`unexpected command ${name}`);
  };
  return { send, seen };
}

function awsError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

const GOOD_PASSWORD = 'Correct-Horse-9-Battery';

beforeEach(() => {
  configureCognito();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('secretHash', () => {
  it('matches the HMAC Cognito expects (base64 of secret over username+clientId)', () => {
    // Pinned vector: computed independently with `openssl`-style HMAC-SHA256.
    expect(secretHash('admin@okuvu.in', 'test-client-id', 'test-client-secret')).toBe(
      'Hd+9w64eJjNWso6t1eb043yhbd4hLE+yCYGPcpvysdI=',
    );
  });

  it('is stable for the same inputs and differs when the username differs', () => {
    const a = secretHash('a@b.co', 'cid', 'sec');
    expect(a).toBe(secretHash('a@b.co', 'cid', 'sec'));
    expect(a).not.toBe(secretHash('a@c.co', 'cid', 'sec'));
    // base64 of a 32-byte digest is 44 characters, ending in '='.
    expect(a).toHaveLength(44);
    expect(a.endsWith('=')).toBe(true);
  });
});

describe('cognitoIssuerParts', () => {
  it('reads region and pool id out of the issuer', () => {
    expect(cognitoIssuerParts()).toEqual({
      region: 'ap-south-1',
      userPoolId: 'ap-south-1_eaJaK7g4g',
    });
  });

  it('returns null rather than guessing when the issuer is absent or foreign', () => {
    vi.stubEnv('COGNITO_ISSUER', '');
    expect(cognitoIssuerParts()).toBeNull();
    vi.stubEnv('COGNITO_ISSUER', 'https://accounts.google.com');
    expect(cognitoIssuerParts()).toBeNull();
  });
});

describe('passwordPolicyError', () => {
  it('accepts a password that satisfies the pool policy', () => {
    expect(passwordPolicyError(GOOD_PASSWORD)).toBeNull();
  });

  it.each([
    ['short', 'Ab1!short', 'at least 14 characters'],
    ['no upper', 'all-lowercase-9!', 'uppercase'],
    ['no lower', 'ALL-UPPERCASE-9!', 'lowercase'],
    ['no digit', 'NoDigitsHere-AtAll!', 'number'],
    ['no symbol', 'NoSymbolsHere12345', 'symbol'],
  ])('names the rule that fails: %s', (_label, password, expected) => {
    expect(passwordPolicyError(password)).toContain(expected);
  });
});

describe('changeCognitoPassword', () => {
  it('proves the current password, then changes it with the minted access token', async () => {
    const { send, seen } = fakeCognito();

    const result = await changeCognitoPassword({
      email: 'admin@okuvu.in',
      currentPassword: 'Old-Password-9!',
      newPassword: GOOD_PASSWORD,
      send,
    });

    expect(result).toEqual({ ok: true });
    expect(seen.map((c) => c.name)).toEqual([
      'InitiateAuthCommand',
      'ChangePasswordCommand',
    ]);
    expect(seen[0].input).toMatchObject({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: 'test-client-id',
      AuthParameters: {
        USERNAME: 'admin@okuvu.in',
        PASSWORD: 'Old-Password-9!',
        SECRET_HASH: 'Hd+9w64eJjNWso6t1eb043yhbd4hLE+yCYGPcpvysdI=',
      },
    });
    expect(seen[1].input).toEqual({
      AccessToken: 'access-token-from-cognito',
      PreviousPassword: 'Old-Password-9!',
      ProposedPassword: GOOD_PASSWORD,
    });
  });

  it('refuses a weak new password locally without calling Cognito', async () => {
    const { send, seen } = fakeCognito();

    const result = await changeCognitoPassword({
      email: 'admin@okuvu.in',
      currentPassword: 'Old-Password-9!',
      newPassword: 'too-short-1!',
      send,
    });

    expect(result).toMatchObject({ ok: false, code: 'WEAK_PASSWORD' });
    expect(seen).toHaveLength(0);
  });

  it('reports a wrong current password and never reaches ChangePassword', async () => {
    const { send, seen } = fakeCognito({ authError: awsError('NotAuthorizedException') });

    const result = await changeCognitoPassword({
      email: 'admin@okuvu.in',
      currentPassword: 'wrong',
      newPassword: GOOD_PASSWORD,
      send,
    });

    expect(result).toMatchObject({ ok: false, code: 'WRONG_CURRENT' });
    expect(seen.map((c) => c.name)).toEqual(['InitiateAuthCommand']);
  });

  it('does not disclose whether an unknown address exists', async () => {
    const { send } = fakeCognito({ authError: awsError('UserNotFoundException') });

    const result = await changeCognitoPassword({
      email: 'nobody@okuvu.in',
      currentPassword: 'Old-Password-9!',
      newPassword: GOOD_PASSWORD,
      send,
    });

    expect(result).toMatchObject({ ok: false, code: 'WRONG_CURRENT' });
  });

  it('surfaces the password-history rule as a reuse refusal', async () => {
    const { send } = fakeCognito({
      changeError: awsError('PasswordHistoryPolicyViolationException'),
    });

    const result = await changeCognitoPassword({
      email: 'admin@okuvu.in',
      currentPassword: 'Old-Password-9!',
      newPassword: GOOD_PASSWORD,
      send,
    });

    expect(result).toMatchObject({ ok: false, code: 'REUSED_PASSWORD' });
  });

  it('maps throttling to a retry message instead of a generic error', async () => {
    const { send } = fakeCognito({ authError: awsError('TooManyRequestsException') });

    const result = await changeCognitoPassword({
      email: 'admin@okuvu.in',
      currentPassword: 'Old-Password-9!',
      newPassword: GOOD_PASSWORD,
      send,
    });

    expect(result).toMatchObject({ ok: false, code: 'TOO_MANY_ATTEMPTS' });
  });

  it('says so when the deployment has no Cognito config at all', async () => {
    vi.unstubAllEnvs();
    const { send, seen } = fakeCognito();

    const result = await changeCognitoPassword({
      email: 'admin@okuvu.in',
      currentPassword: 'Old-Password-9!',
      newPassword: GOOD_PASSWORD,
      send,
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    expect(seen).toHaveLength(0);
  });
});
