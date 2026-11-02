'use client';

import { trpc } from '@/trpc/client';

export interface ClientHeader {
  /** The therapist's own name for the client — never a phone number, never an id. */
  label: string;
  /** The client's record number (`SG88F0001`), or null when none is minted yet. */
  code: string | null;
}

/**
 * The two fields every client sub-page breadcrumb needs.
 *
 * Written because `lib/format.ts#formatClientLabel` can only ever return the
 * word "Client" — it has an id and no data, so every breadcrumb on every
 * sub-page read "Dashboard / Client / Notes". A hook that fetches the name is
 * the fix; the fallback stays "Client" while the query is in flight so a
 * heading never flickers to an empty string.
 */
export function useClientHeader(clientUserId: string | undefined): ClientHeader {
  const query = trpc.clients.header.useQuery(
    { clientUserId: clientUserId ?? '' },
    { enabled: Boolean(clientUserId) },
  );

  return {
    label: query.data?.clientLabel ?? 'Client',
    code: query.data?.clientCode ?? null,
  };
}
