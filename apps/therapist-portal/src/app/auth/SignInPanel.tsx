'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import TopBar from '@/app/components/TopBar';

function AuthContent({
  googleConfigured,
  cognitoConfigured,
}: {
  googleConfigured: boolean;
  cognitoConfigured: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      // /dashboard bounces an admin (an address on ADMIN_EMAILS with no
      // Therapist row) on to /admin, so this stays one destination for both.
      router.replace('/dashboard');
    }
  }, [status, router]);

  const error = searchParams.get('error');
  const configured = googleConfigured || cognitoConfigured;

  const isUnauthorized = error === 'unauthorized';
  const errorMessage =
    error === 'server_error'
      ? 'A server error occurred. Please try again.'
      : error === 'Configuration'
        ? 'Sign-in is not configured yet. Please contact your administrator.'
        : error === 'OAuthAccountNotLinked'
          ? 'This email is already linked to a different sign-in method. Please contact your administrator.'
          : error === 'OAuthSignin' ||
              error === 'OAuthCallback' ||
              error === 'OAuthCallbackError' ||
              error === 'OAuthCreateAccount' ||
              error === 'Callback' ||
              error === 'CallbackRouteError' ||
              error === 'AccessDenied'
            ? 'Sign-in was cancelled or could not be completed. Please try again.'
            : null;

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen flex-col bg-oat">
        <TopBar showAvatar={false} />
        <div className="flex flex-1 items-center justify-center p-4 md:p-8" role="status" aria-live="polite" aria-busy="true">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          <span className="sr-only">Checking sign-in status…</span>
        </div>
      </main>
    );
  }

  if (status === 'authenticated') {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col bg-oat">
      <TopBar showAvatar={false} />
      <div className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-[480px]">
          <div className="mb-6 flex flex-col items-center">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Therapist Portal
            </span>
          </div>
          <hr className="mb-4 border-t border-hairline" />
          <div className="rounded-xl border border-hairline bg-oat-elevated p-8" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-8 text-center">
              <h1 className="mb-2 text-2xl font-semibold tracking-tight text-charcoal-ink">
                Sign in to OKUVU
              </h1>
              <p className="text-base leading-relaxed text-ink-soft">
                {configured
                  ? 'Use the address your Okuvu administrator registered for you. There is no signup here — if you are not registered yet, write to admin@okuvu.in.'
                  : 'This portal is not connected to an identity provider yet. Please contact your administrator.'}
              </p>
            </div>

            {isUnauthorized && (
              <div
                className="mb-4 rounded-lg border-l-4 border-danger bg-danger-tint p-3 px-4"
                role="alert"
              >
                <p className="text-sm text-danger">
                  Your account is not yet set up on OKUVU. Please contact your administrator.
                </p>
              </div>
            )}

            {errorMessage && (
              <div
                className="mb-4 rounded-lg border-l-4 border-danger bg-danger-tint p-3 px-4"
                role="alert"
              >
                <p className="text-sm text-danger">
                  {errorMessage}
                </p>
              </div>
            )}

            {configured ? (
              <div className="space-y-3">
                {googleConfigured && (
                  <button
                    onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                    className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#bec9c4] bg-white px-4 py-3 transition-colors hover:bg-[#f2f4f6]"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
                      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24z" />
                      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
                      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
                    </svg>
                    <span className="text-sm font-medium text-charcoal-ink">
                      Continue with Google
                    </span>
                  </button>
                )}

                {cognitoConfigured && (
                  <button
                    onClick={() => signIn('cognito', { callbackUrl: '/dashboard' })}
                    className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#bec9c4] bg-white px-4 py-3 transition-colors hover:bg-[#f2f4f6]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
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
                    <span className="text-sm font-medium text-charcoal-ink">
                      Continue with email &amp; password
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div
                className="rounded-lg border border-hairline bg-oat p-4 text-center"
                role="status"
                data-testid="sign-in-unavailable"
              >
                <p className="text-sm font-medium text-charcoal-ink">
                  Sign-in unavailable
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  No identity provider is configured for this deployment.
                </p>
              </div>
            )}

            <div className="mt-8 border-t border-hairline pt-6">
              <p className="text-center text-xs text-ink-soft">
                Access is restricted to registered OKUVU therapists and administrators.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SignInPanel({
  googleConfigured,
  cognitoConfigured,
}: {
  googleConfigured: boolean;
  cognitoConfigured: boolean;
}) {
  return (
    <Suspense>
      <AuthContent googleConfigured={googleConfigured} cognitoConfigured={cognitoConfigured} />
    </Suspense>
  );
}
