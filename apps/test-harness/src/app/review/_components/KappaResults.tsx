'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import type { inferRouterOutputs } from '@trpc/server';
import { trpc } from '@/trpc/client';
import type { AppRouter } from '@/server/routers/_app';

type UnblindResult = inferRouterOutputs<AppRouter>['review']['unblindResults'];

/**
 * PI-only Cohen's kappa results view.
 *
 * The `role === 'PI'` check here is a client-side convenience gate only —
 * it improves UX by not showing controls a rater can't use, but it is not
 * the security boundary. `computeKappa` is readable by any authenticated
 * user server-side (no PI restriction there), while `unblindResults` is
 * enforced PI-only in the `review` router itself, so a non-PI user hitting
 * "unblind" would get a FORBIDDEN error from the server regardless of this
 * client check.
 */
export default function KappaResults() {
  const { data: session, status } = useSession();
  const [unblindItemId, setUnblindItemId] = useState('');
  const [unblindFeedback, setUnblindFeedback] = useState<string | null>(null);

  const kappaQuery = trpc.review.computeKappa.useQuery(
    {},
    { enabled: session?.user?.role === 'PI' },
  );

  const unblind = trpc.review.unblindResults.useMutation();

  function handleUnblind(itemId: string) {
    setUnblindFeedback(null);
    unblind.mutate(
      { itemId },
      {
        onSuccess: (item: UnblindResult) => {
          setUnblindFeedback(`Item ${item.id} unblinded (run_id revealed server-side).`);
          setUnblindItemId('');
        },
        onError: (error: unknown) => {
          const message = error instanceof Error ? error.message : 'unknown error';
          setUnblindFeedback(`Failed to unblind: ${message}`);
        },
      },
    );
  }

  if (status === 'loading') {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Loading…
      </p>
    );
  }

  if (session?.user?.role !== 'PI') {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
        Not authorized. Review results are visible to PI accounts only.
      </p>
    );
  }

  if (kappaQuery.isLoading) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Computing kappa…
      </p>
    );
  }

  if (kappaQuery.isError || !kappaQuery.data) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
        Failed to load results: {kappaQuery.error?.message ?? 'unknown error'}
      </p>
    );
  }

  const { raterPairs, overallKappa } = kappaQuery.data;

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
          Overall &kappa;
        </h2>
        <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
          {overallKappa !== undefined ? overallKappa.toFixed(3) : 'Not enough overlapping ratings yet.'}
        </p>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]">
        <table className="w-full text-left text-[var(--text-body-main)] text-[var(--color-on-surface)]">
          <thead>
            <tr className="border-b border-[var(--color-outline-variant)] text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              <th className="px-[var(--spacing-md)] py-2">Rater 1</th>
              <th className="px-[var(--spacing-md)] py-2">Rater 2</th>
              <th className="px-[var(--spacing-md)] py-2">&kappa;</th>
              <th className="px-[var(--spacing-md)] py-2">n</th>
            </tr>
          </thead>
          <tbody>
            {raterPairs.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-[var(--spacing-md)] py-3 text-[var(--color-on-surface-variant)]"
                >
                  No overlapping rater pairs yet.
                </td>
              </tr>
            ) : (
              raterPairs.map((pair) => (
                <tr
                  key={`${pair.rater1}-${pair.rater2}`}
                  className="border-b border-[var(--color-outline-variant)] last:border-0"
                >
                  <td className="px-[var(--spacing-md)] py-2">{pair.rater1}</td>
                  <td className="px-[var(--spacing-md)] py-2">{pair.rater2}</td>
                  <td className="px-[var(--spacing-md)] py-2">{pair.kappa.toFixed(3)}</td>
                  <td className="px-[var(--spacing-md)] py-2">{pair.n}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
          Unblind an item
        </h2>
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Reveals the underlying run for a single blinded review item.
        </p>
        <form
          className="flex flex-wrap items-end gap-[var(--spacing-md)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!unblindItemId.trim()) return;
            handleUnblind(unblindItemId.trim());
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              Item ID
            </span>
            <input
              type="text"
              value={unblindItemId}
              onChange={(event) => setUnblindItemId(event.target.value)}
              placeholder="blinded review item id"
              className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
            />
          </label>
          <button
            type="submit"
            disabled={unblind.isPending}
            className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
          >
            {unblind.isPending ? 'Unblinding…' : 'Unblind'}
          </button>
        </form>
        {unblindFeedback ? (
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            {unblindFeedback}
          </p>
        ) : null}
      </div>
    </div>
  );
}
