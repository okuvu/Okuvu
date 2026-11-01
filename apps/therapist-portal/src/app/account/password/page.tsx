import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import TopBar from '@/app/components/TopBar';
import { ChangePasswordForm } from './_components/ChangePasswordForm';

/**
 * Self-service password change for anyone with a session.
 *
 * Reachable by an operator (who had no way to rotate the password an
 * administrator handed them out of SSM) and by a therapist. Not under `/admin`:
 * the capability belongs to the account, not to the role, and a therapist who
 * never opens the console still holds a password.
 */
export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth');
  }

  return (
    <div className="min-h-screen bg-oat">
      <TopBar />
      <main className="mx-auto w-full max-w-xl px-4 py-10 md:px-6">
        <h1 className="text-2xl font-semibold text-charcoal-ink">Change password</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
          Signed in as{' '}
          <span className="font-medium text-charcoal-ink">{session.user.email}</span>. Changing it
          here replaces the password for this address only.
        </p>
        <ChangePasswordForm />
      </main>
    </div>
  );
}
