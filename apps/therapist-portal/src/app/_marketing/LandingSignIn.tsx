'use client';

import { signIn } from 'next-auth/react';
import { copy } from '@/lib/marketing/copy';

/**
 * The landing page's sign-in block.
 *
 * Two rules govern what this renders, and both come from how therapists are
 * actually onboarded (an admin adds their personal address in /admin):
 *
 *   1. No signup link, ever. There is no therapist self-registration — the
 *      allowlist is the Therapist table — so offering "create an account"
 *      would be a dead end that also weakens the invite model the product
 *      rests on.
 *   2. No button for a provider that is not configured. A greyed-out or
 *      broken provider is worse than an honest sentence and a mailto.
 */
export default function LandingSignIn({
  googleConfigured,
  cognitoConfigured,
}: {
  googleConfigured: boolean;
  cognitoConfigured: boolean;
}) {
  const callbackUrl = '/dashboard';

  if (!googleConfigured && !cognitoConfigured) {
    return (
      <div className="rounded-xl border border-hairline bg-oat p-4 text-sm leading-relaxed text-ink-soft" role="status">
        {copy.forTherapists.signInUnavailable}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {googleConfigured && (
        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl })}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#bec9c4] bg-white px-4 py-3 text-sm font-medium text-charcoal-ink transition-colors hover:bg-[#f2f4f6]"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"
            />
            <path
              fill="#EA4335"
              d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"
            />
          </svg>
          {copy.forTherapists.signInCta}
        </button>
      )}

      {cognitoConfigured && (
        <button
          type="button"
          onClick={() => signIn('cognito', { callbackUrl })}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-hairline bg-oat px-4 py-3 text-sm font-medium text-charcoal-ink transition-colors hover:bg-lavender-tint"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-soft"
          >
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {copy.forTherapists.signInEmailCta}
        </button>
      )}
    </div>
  );
}
