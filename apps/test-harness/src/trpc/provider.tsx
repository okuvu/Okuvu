'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from './client';

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  // TH-S29: this app has no server-side prefetch/hydration plumbing yet
  // (no `HydrationBoundary`, plain client-only QueryClientProvider) — wiring
  // that up is a bigger infra change than a performance-polish story
  // warrants. As a pragmatic stand-in, give queries a default staleTime so
  // navigating back to a page (e.g. the dashboard) within a short window
  // reuses the cached data instead of refetching immediately. Full SSR
  // prefetch/hydration is a follow-up that would touch this provider plus
  // each page's server component.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
          },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
