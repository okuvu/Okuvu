#!/usr/bin/env node
/**
 * Provision the seed therapist accounts in the production Cognito pool.
 *
 * Story E16-S3. The portal has no self-service sign-up: a therapist exists
 * because an operator created them here. This script is that operator path,
 * and it is the only one — nobody types a password into the AWS console.
 *
 * What it does, per therapist, idempotently:
 *
 *   1. Reads the password from SSM Parameter Store
 *      (/<prefix>/<slug>/password, SecureString, decrypted in memory only).
 *      If the parameter does not exist it generates a 32-character password
 *      that satisfies the pool's policy and stores it. Values are never
 *      printed, logged, committed or passed on a command line.
 *   2. admin-create-user (email as username, email_verified=true, no invite
 *      email) when the user is absent, then admin-set-user-password
 *      --permanent so the account is CONFIRMED and usable immediately.
 *   3. Leaves an existing CONFIRMED user alone unless --rotate is given, so
 *      running the script twice does not invalidate a therapist's session.
 *   4. Optionally upserts the Therapist row that the portal's sign-in allowlist
 *      checks (auth.ts signIn callback), when DATABASE_URL is available.
 *
 * Usage:
 *   AWS_PROFILE=keel-deploy AWS_REGION=ap-south-1 \
 *   COGNITO_THERAPIST_POOL_ID=ap-south-1_XXXXXXXX \
 *   node scripts/provision-therapists.mjs [--rotate] [--verify] [--dry-run]
 *
 * Environment:
 *   AWS_PROFILE / AWS_REGION          standard AWS CLI credentials/region
 *   COGNITO_THERAPIST_POOL_ID         therapist pool id (terraform output
 *                                     cognito_therapist_pool_id)
 *   COGNITO_THERAPIST_CLIENT_ID       portal app client id, only needed for
 *                                     --verify (terraform output
 *                                     cognito_therapist_app_client_id)
 *   COGNITO_CLIENT_SECRET_ID          Secrets Manager secret holding the app
 *                                     client secret (default:
 *                                     evia-beta/portal-cognito-client-secret)
 *   THERAPIST_PARAM_PREFIX            SSM prefix (default /evia-beta/therapists)
 *   DATABASE_URL                      optional; enables step 4
 *
 * Exit codes: 0 all accounts ready, 1 configuration/API failure.
 */

import { execFileSync } from 'node:child_process';
import { createHmac, randomInt } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The three seed therapists. Emails are the Cognito usernames. */
const SEED_THERAPISTS = [
  { slug: 'ananya.rao', email: 'ananya.rao@okuvu.in', name: 'Dr. Ananya Rao' },
  { slug: 'rohan.mehta', email: 'rohan.mehta@okuvu.in', name: 'Dr. Rohan Mehta' },
  { slug: 'priya.nair', email: 'priya.nair@okuvu.in', name: 'Dr. Priya Nair' },
];

const PASSWORD_PREFIX = process.env.THERAPIST_PARAM_PREFIX ?? '/evia-beta/therapists';
const POOL_ID = process.env.COGNITO_THERAPIST_POOL_ID ?? '';
const CLIENT_ID = process.env.COGNITO_THERAPIST_CLIENT_ID ?? '';
const CLIENT_SECRET_ID =
  process.env.COGNITO_CLIENT_SECRET_ID ?? 'evia-beta/portal-cognito-client-secret';

const args = new Set(process.argv.slice(2));
const ROTATE = args.has('--rotate');
const VERIFY = args.has('--verify');
const DRY_RUN = args.has('--dry-run');

/** Characters that survive every shell, JSON and URL context we touch. */
const PASSWORD_ALPHABET = 'abcdefghijkmnopqrstuvwxyz';
const PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_DIGITS = '23456789';
const PASSWORD_SYMBOLS = '!@#$%^&*-_=+';

function generatePassword(length = 32) {
  const all = PASSWORD_ALPHABET + PASSWORD_UPPER + PASSWORD_DIGITS + PASSWORD_SYMBOLS;
  // One of each class first, so the pool's policy is satisfied by
  // construction rather than by retry.
  const seed = [
    PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
    PASSWORD_UPPER[randomInt(PASSWORD_UPPER.length)],
    PASSWORD_DIGITS[randomInt(PASSWORD_DIGITS.length)],
    PASSWORD_SYMBOLS[randomInt(PASSWORD_SYMBOLS.length)],
  ];
  while (seed.length < length) {
    seed.push(all[randomInt(all.length)]);
  }
  // Fisher-Yates, so the guaranteed classes are not always in positions 0-3.
  for (let i = seed.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [seed[i], seed[j]] = [seed[j], seed[i]];
  }
  return seed.join('');
}

/**
 * Runs the AWS CLI and returns parsed JSON.
 *
 * `secrets` (when given) are written to a 0600 file under the process's temp
 * directory and passed with --cli-input-json file://... so a password never
 * appears in argv (readable via `ps`) or in shell history.
 */
function aws(serviceArgs, { secrets } = {}) {
  let scratch = null;
  let finalArgs = serviceArgs;

  if (secrets) {
    scratch = mkdtempSync(join(tmpdir(), 'okuvu-cognito-'));
    const path = join(scratch, 'input.json');
    writeFileSync(path, JSON.stringify(secrets), { mode: 0o600 });
    chmodSync(path, 0o600);
    finalArgs = [...serviceArgs, '--cli-input-json', `file://${path}`];
  }

  try {
    const out = execFileSync(
      'aws',
      [...finalArgs, '--output', 'json', '--region', process.env.AWS_REGION ?? 'ap-south-1'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return out.trim() === '' ? {} : JSON.parse(out);
  } catch (error) {
    const stderr = error.stderr?.toString() ?? '';
    throw new Error(`${serviceArgs[0]} ${serviceArgs[1]} failed: ${stderr.trim()}`);
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

function isNotFound(error, marker) {
  return error instanceof Error && error.message.includes(marker);
}

/** Reads the password from SSM, creating it on first run. */
function ensurePassword(therapist) {
  const parameterName = `${PASSWORD_PREFIX}/${therapist.slug}/password`;

  try {
    const existing = aws([
      'ssm',
      'get-parameter',
      '--name',
      parameterName,
      '--with-decryption',
    ]);
    return { parameterName, password: existing.Parameter.Value, created: false };
  } catch (error) {
    if (!isNotFound(error, 'ParameterNotFound')) throw error;
  }

  const password = generatePassword();
  if (DRY_RUN) {
    return { parameterName, password: null, created: true };
  }

  try {
    // The value goes through a 0600 file, never through argv.
    aws(['ssm', 'put-parameter'], {
      secrets: {
        Name: parameterName,
        Type: 'SecureString',
        Value: password,
        Description: `OKUVU therapist sign-in password for ${therapist.email} (E16-S3)`,
      },
    });
  } catch (error) {
    // Another operator created it between our read and write; use theirs.
    if (!isNotFound(error, 'ParameterAlreadyExists')) throw error;
    const existing = aws([
      'ssm',
      'get-parameter',
      '--name',
      parameterName,
      '--with-decryption',
    ]);
    return { parameterName, password: existing.Parameter.Value, created: false };
  }

  return { parameterName, password, created: true };
}

function getUser(email) {
  try {
    return aws(['cognito-idp', 'admin-get-user', '--user-pool-id', POOL_ID, '--username', email]);
  } catch (error) {
    if (isNotFound(error, 'UserNotFoundException')) return null;
    throw error;
  }
}

function setPermanentPassword(email, password) {
  aws(['cognito-idp', 'admin-set-user-password'], {
    secrets: { UserPoolId: POOL_ID, Username: email, Password: password, Permanent: true },
  });
}

function provision(therapist) {
  const { parameterName, password, created } = ensurePassword(therapist);
  const existing = getUser(therapist.email);

  if (!existing) {
    if (DRY_RUN) {
      return { ...therapist, parameterName, action: 'would-create', status: 'ABSENT' };
    }
    aws([
      'cognito-idp',
      'admin-create-user',
      '--user-pool-id',
      POOL_ID,
      '--username',
      therapist.email,
      '--user-attributes',
      `Name=email,Value=${therapist.email}`,
      'Name=email_verified,Value=true',
      `Name=name,Value=${therapist.name}`,
      '--message-action',
      'SUPPRESS',
    ]);
    setPermanentPassword(therapist.email, password);
    return { ...therapist, parameterName, action: 'created', status: 'CONFIRMED', parameterCreated: created };
  }

  const status = existing.UserStatus;
  if (status === 'FORCE_CHANGE_PASSWORD' || ROTATE) {
    if (DRY_RUN) {
      return { ...therapist, parameterName, action: status === 'FORCE_CHANGE_PASSWORD' ? 'would-confirm' : 'would-rotate', status };
    }
    setPermanentPassword(therapist.email, password);
    return { ...therapist, parameterName, action: status === 'FORCE_CHANGE_PASSWORD' ? 'confirmed' : 'password-rotated', status: 'CONFIRMED' };
  }

  return { ...therapist, parameterName, action: 'unchanged', status };
}

function clientSecret() {
  const secret = aws(['secretsmanager', 'get-secret-value', '--secret-id', CLIENT_SECRET_ID]);
  const parsed = JSON.parse(secret.SecretString);
  if (!parsed.secret) throw new Error(`${CLIENT_SECRET_ID} has no "secret" field`);
  return parsed.secret;
}

function secretHash(username, clientId, secret) {
  return createHmac('sha256', secret).update(`${username}${clientId}`).digest('base64');
}

/**
 * Proves a seeded credential actually authenticates against the real pool.
 * Returns claim metadata only — tokens stay in memory and are not printed.
 */
function verifyCredential(therapist, password, secret, clientId) {
  const response = aws(['cognito-idp', 'initiate-auth'], {
    secrets: {
      ClientId: clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: therapist.email,
        PASSWORD: password,
        SECRET_HASH: secretHash(therapist.email, clientId, secret),
      },
    },
  });

  if (response.ChallengeName) {
    return { verified: false, challenge: response.ChallengeName };
  }

  const idToken = response.AuthenticationResult?.IdToken;
  if (!idToken) return { verified: false, challenge: 'NO_ID_TOKEN' };

  const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  return { verified: true, email: claims.email, aud: claims.aud, exp: claims.exp, iss: claims.iss };
}

function seedAllowlist(emails) {
  if (!process.env.DATABASE_URL) {
    return { seeded: false, reason: 'DATABASE_URL not set' };
  }
  if (DRY_RUN) return { seeded: false, reason: 'dry run' };

  execFileSync(
    'pnpm',
    ['exec', 'tsx', 'src/scripts/seed-therapists-batch.ts', ...emails],
    {
      cwd: join(process.cwd(), 'apps/therapist-portal'),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );
  return { seeded: true };
}

function main() {
  if (!POOL_ID) {
    console.error('COGNITO_THERAPIST_POOL_ID is not set (terraform output cognito_therapist_pool_id).');
    process.exit(1);
  }
  if (VERIFY && !CLIENT_ID) {
    console.error('--verify needs COGNITO_THERAPIST_CLIENT_ID (terraform output cognito_therapist_app_client_id).');
    process.exit(1);
  }

  const results = SEED_THERAPISTS.map((therapist) => {
    const result = provision(therapist);
    process.stdout.write(`  ${result.email.padEnd(24)} ${result.action} (${result.status})\n`);
    return result;
  });

  const allowlist = seedAllowlist(SEED_THERAPISTS.map((therapist) => therapist.email));

  let verifications = [];
  if (VERIFY && !DRY_RUN) {
    const secret = clientSecret();
    verifications = results.map((result) => {
      const { password } = ensurePassword(result);
      const outcome = verifyCredential(result, password, secret, CLIENT_ID);
      process.stdout.write(
        `  ${result.email.padEnd(24)} ${outcome.verified ? 'authenticated' : `challenge: ${outcome.challenge}`}\n`,
      );
      return { email: result.email, ...outcome };
    });
  }

  console.log(
    JSON.stringify(
      {
        poolId: POOL_ID,
        rotate: ROTATE,
        verify: VERIFY,
        dryRun: DRY_RUN,
        therapists: results.map(({ email, parameterName, action, status }) => ({
          email,
          parameterName,
          action,
          status,
        })),
        allowlist,
        verifications,
      },
      null,
      2,
    ),
  );

  if (VERIFY && !DRY_RUN && verifications.some((v) => !v.verified)) {
    process.exitCode = 1;
  }
}

main();
