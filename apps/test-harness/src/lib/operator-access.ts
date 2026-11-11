/**
 * TH-S39 — password sign-in for the chat-quality testing page.
 *
 * testing.okuvu.in is used by two people: Rajwant (runs the tests) and
 * Shubhangi Goswami (the clinical authority who reads the transcripts). Neither
 * has a Cognito therapist account, and the harness's Google-OAuth path needs a
 * per-email allow-list row and a Google login — friction for a clinician whose
 * only job is to read a conversation.
 *
 * So this is deliberately a shared password over a fixed two-email allowlist,
 * not an account system: the allowlist is code, the password is one env var
 * (`TESTING_PAGE_PASSWORD`). It grants PI-role sessions scoped to sandbox and
 * staging — never beta, which the conversation runner refuses anyway.
 *
 * This is not a general-purpose auth path. If a third person needs access, add
 * them here consciously; there is no signup, reset or per-user secret.
 */

import type { HarnessRole, TestEnvironment } from '@okuvu/shared-types';

export interface OperatorAccount {
  email: string;
  name: string;
  role: HarnessRole;
  environments: TestEnvironment[];
}

/** The two people allowed on the testing page. Emails are matched case-insensitively. */
export const OPERATOR_ACCOUNTS: OperatorAccount[] = [
  {
    email: 'admin@okuvu.in',
    name: 'Rajwant',
    role: 'PI',
    environments: ['sandbox', 'staging'],
  },
  {
    email: 'alphashubhangi@gmail.com',
    name: 'Shubhangi Goswami',
    role: 'PI',
    environments: ['sandbox', 'staging'],
  },
];

/** Fallback keeps the page usable before the env var is set in a new environment. */
export const DEFAULT_TESTING_PAGE_PASSWORD = 'adminokuvu';

export function testingPagePassword(env: Record<string, string | undefined> = process.env): string {
  return env.TESTING_PAGE_PASSWORD?.trim() || DEFAULT_TESTING_PAGE_PASSWORD;
}

export function findOperator(email: string | null | undefined): OperatorAccount | null {
  if (!email) return null;
  const needle = email.trim().toLowerCase();
  return OPERATOR_ACCOUNTS.find((account) => account.email.toLowerCase() === needle) ?? null;
}

/**
 * Verify an email/password pair. Returns the account on success, null on any
 * failure — a wrong password and an unknown email are deliberately
 * indistinguishable to the caller.
 */
export function verifyOperator(
  email: string | null | undefined,
  password: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): OperatorAccount | null {
  const account = findOperator(email);
  if (!account || typeof password !== 'string') return null;
  const expected = testingPagePassword(env);
  if (password.length !== expected.length) return null;

  // Constant-time compare so a wrong password cannot be timed byte by byte.
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) {
    mismatch |= expected.charCodeAt(index) ^ password.charCodeAt(index);
  }
  return mismatch === 0 ? account : null;
}
