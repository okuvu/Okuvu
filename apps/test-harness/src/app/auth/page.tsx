'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [status, router]);

  const error = searchParams.get('error');

  const isUnauthorized = error === 'unauthorized';
  const errorMessage =
    error === 'server_error'
      ? 'A server error occurred. Please try again.'
      : error === 'OAuthSignin' || error === 'OAuthCallback'
        ? 'Sign-in was cancelled. Please try again.'
        : null;

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F6F8] p-4 md:p-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </main>
    );
  }

  if (status === 'authenticated') {
    return null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F6F8] p-4 md:p-8">
      <div className="w-full max-w-[480px]">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 text-2xl font-bold text-[#1A6B5A]">OKUVU</div>
          <span className="text-xs font-medium uppercase tracking-wider text-[#6f7975]">
            Test Harness
          </span>
        </div>
        <hr className="mb-4 border-t border-[#DDE2E8]" />
        <div className="rounded-xl border border-[#DDE2E8] bg-white p-8 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-[#191c1e]">
              Sign in to OKUVU Test Harness
            </h1>
            <p className="text-base leading-relaxed text-[#3f4945]">
              Use your Google account registered with the test harness.
            </p>
          </div>

          {isUnauthorized && (
            <div className="mb-4 rounded-lg border-l-4 p-3 px-4" style={{ backgroundColor: '#FDF2F1', borderLeftColor: '#C0392B' }}>
              <p className="text-sm" style={{ color: '#C0392B' }}>
                Your account is not registered for the test harness. Contact the PI for access.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-lg border-l-4 p-3 px-4" style={{ backgroundColor: '#FDF2F1', borderLeftColor: '#C0392B' }}>
              <p className="text-sm" style={{ color: '#C0392B' }}>{errorMessage}</p>
            </div>
          )}

          <button
            onClick={() => signIn('google')}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#bec9c4] bg-white px-4 py-3 transition-colors hover:bg-[#f2f4f6]"
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span className="text-sm font-medium text-[#191c1e]">Continue with Google</span>
          </button>

          <div className="mt-8 border-t border-[#DDE2E8] pt-6">
            <p className="text-center text-xs text-[#6f7975]">
              Access is restricted to registered PI, rater, and engineer accounts.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthContent />
    </Suspense>
  );
}
