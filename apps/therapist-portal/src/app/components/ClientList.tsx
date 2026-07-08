'use client';

import { trpc } from '@/trpc/client';
import { ClientRow } from './ClientRow';

export function ClientList() {
  const query = trpc.clients.list.useQuery();

  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-gray-200 bg-gray-50"
          />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-6 text-center">
        <p className="text-sm font-medium text-red-800">
          Couldn’t load your caseload
        </p>
        <p className="mt-1 text-xs text-red-600">
          {query.error.message || 'Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const clients = query.data ?? [];

  if (clients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-12 text-center">
        <p className="text-sm font-medium text-gray-900">
          No clients assigned yet
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Once a client is assigned to you, they’ll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-label="Caseload">
      {clients.map((client) => (
        <ClientRow key={client.id} client={client} />
      ))}
    </div>
  );
}