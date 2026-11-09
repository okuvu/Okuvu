'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { useClientHeader } from '../_components/useClientHeader';
import { TabStrip } from '../_components/TabStrip';

/**
 * "Shared with me" — the only place a therapist reads a client's journal,
 * worksheet answers or Treasure notes.
 *
 * Everything on this page is here because the client turned that one item's
 * share on in their app. Turning it off removes the row from this query, so
 * the page is empty for it on the next load; there is no cache to clear and no
 * copy to chase. Nothing here is chat: chat has its own approval switch and
 * window and is read on the Conversation tab.
 *
 * The empty state is worded so a therapist does not read "nothing shared" as
 * "nothing written" — it is a choice, not an absence.
 */
export default function ClientSharedPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { label } = useClientHeader(clientId);

  const sharedQuery = trpc.shared.list.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const items = sharedQuery.data?.items ?? [];

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href={`/clients/${clientId}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {label}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Shared with me</h1>
        <p className="mt-1 text-sm text-gray-600">
          What {label} has chosen to share, one item at a time. Anything they stop sharing leaves
          this page immediately, and what they keep private is never here.
        </p>
      </div>

      <TabStrip clientId={clientId} active="shared" />

      <div className="mt-6 space-y-4">
        {sharedQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {sharedQuery.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {sharedQuery.error.message}
          </div>
        )}

        {sharedQuery.data && items.length === 0 && (
          <div className="rounded-lg border border-hairline bg-oat-elevated p-4 text-sm text-gray-600">
            Nothing is shared right now. Items appear here only when {label} turns on sharing for
            that entry, worksheet or note.
          </div>
        )}

        {items.map((item) => (
          <article
            key={`${item.kind}-${item.id}`}
            className="rounded-lg border border-hairline bg-white p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">{item.title}</h2>
              <span className="text-xs text-gray-500">
                {new Date(item.at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {item.kind === 'worksheet_response' &&
              (item.feelingBefore !== null || item.feelingAfter !== null || item.helped !== null) && (
                <p className="mt-1 text-xs text-gray-500">
                  {item.feelingBefore !== null && `Before ${item.feelingBefore}/10`}
                  {item.feelingBefore !== null && item.feelingAfter !== null && ' · '}
                  {item.feelingAfter !== null && `After ${item.feelingAfter}/10`}
                  {item.feelingAfter !== null && item.helped !== null && ' · '}
                  {item.helped !== null && (item.helped ? 'Marked as helpful' : 'Not marked as helpful')}
                </p>
              )}

            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
