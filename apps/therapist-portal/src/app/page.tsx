import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ClientList } from './components/ClientList';
import { SignOutButton } from './components/SignOutButton';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth');
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-gray-50 px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Therapist Portal
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Your caseload
          </h1>
          {session.user.name || session.user.email ? (
            <p className="mt-1 text-sm text-gray-500">
              {session.user.name ?? session.user.email}
            </p>
          ) : null}
        </div>
        <SignOutButton />
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-700">Clients</h2>
        <ClientList />
      </section>
    </main>
  );
}