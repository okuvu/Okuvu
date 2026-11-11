'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [status, router]);

  const error = searchParams.get('error');
  const errorMessage =
    error === 'server_error'
      ? 'A server error occurred. Please try again.'
      : error === 'OAuthSignin' || error === 'OAuthCallback'
        ? 'Sign-in was cancelled. Please try again.'
        : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (!result || result.error) {
        setFormError('That email and password do not match. Use the testing page password you were given.');
        return;
      }
      router.replace('/');
    } catch {
      setFormError('Could not reach the sign-in service. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
            Chat Quality Testing
          </span>
        </div>
        <hr className="mb-4 border-t border-[#DDE2E8]" />
        <div className="rounded-xl border border-[#DDE2E8] bg-white p-8 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
          <div className="mb-6 text-center">
            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-[#191c1e]">Sign in</h1>
            <p className="text-base leading-relaxed text-[#3f4945]">
              Use the email you were given access with, and the testing page password.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-lg border-l-4 p-3 px-4" style={{ backgroundColor: '#FDF2F1', borderLeftColor: '#C0392B' }}>
              <p className="text-sm" style={{ color: '#C0392B' }}>{errorMessage}</p>
            </div>
          )}
          {formError && (
            <div className="mb-4 rounded-lg border-l-4 p-3 px-4" style={{ backgroundColor: '#FDF2F1', borderLeftColor: '#C0392B' }}>
              <p className="text-sm" style={{ color: '#C0392B' }}>{formError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-[#3f4945]">
              <span className="font-medium text-[#191c1e]">Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@okuvu.in"
                className="rounded-lg border border-[#bec9c4] px-3 py-2 text-base text-[#191c1e] outline-none focus:border-[#1A6B5A]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[#3f4945]">
              <span className="font-medium text-[#191c1e]">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-lg border border-[#bec9c4] px-3 py-2 text-base text-[#191c1e] outline-none focus:border-[#1A6B5A]"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-lg bg-[#1A6B5A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 border-t border-[#DDE2E8] pt-6">
            <p className="text-center text-xs text-[#6f7975]">
              Access is restricted to the clinical reviewer and the PI. Google sign-in remains available to
              harness operators on the rest of the harness.
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
