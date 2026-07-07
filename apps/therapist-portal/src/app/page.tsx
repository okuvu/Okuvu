import { auth } from '@/lib/auth';
import { signOut } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">
          Welcome, {session.user.name ?? 'Therapist'}
        </h1>
        <p className="mb-8 text-gray-500">{session.user.email}</p>
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <button
            type="submit"
            className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
