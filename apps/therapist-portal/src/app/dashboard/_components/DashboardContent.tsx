'use client';

import { trpc } from '@/trpc/client';
import { ClientTable } from './ClientTable';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardContent({ therapistName }: { therapistName: string }) {
  const query = trpc.clients.list.useQuery();

  if (query.isLoading) {
    return (
      <main className="p-4 md:p-8">
        <div className="mb-8">
          <div className="h-8 w-80 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-5 w-56 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="overflow-hidden rounded-xl border border-hairline bg-oat-elevated">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="space-y-0">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse border-b border-gray-100 bg-gray-50 px-6" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="p-4 md:p-8">
        <div className="flex flex-col items-center justify-center rounded-xl border border-danger bg-danger-tint px-6 py-12">
          <p className="text-sm font-medium text-danger">Couldn&apos;t load your caseload</p>
          <p className="mt-1 text-xs text-danger">
            {query.error.message || 'Please try again.'}
          </p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-4 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:bg-danger/90"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const clients = query.data ?? [];

  return (
    <main className="p-4 md:p-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {getGreeting()}, {therapistName}.
          </h1>
          <p className="mt-1 text-gray-500">
            You have {clients.length} active {clients.length === 1 ? 'client' : 'clients'}.
          </p>
        </div>
      </header>

      <ClientTable clients={clients} />
    </main>
  );
}
