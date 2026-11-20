'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import type { SummaryAccessState } from '@/server/routers/clients';

interface ConsentChipProps {
  clientUserId: string;
  clientLabel: string;
  /**
   * Portal P0 — the four-state chat-access value, straight from
   * clients.detail. It is the same value the read gate uses, so this chip
   * cannot claim an access that is not open.
   */
  summaryAccess: SummaryAccessState;
  moodShared: boolean;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Summary access, in plain words.
 *
 * The rule the therapist reads here is the rule the gate enforces: the
 * therapist asks, the CLIENT approves in the app, and a 30-day read-only
 * window runs from that approval. An unanswered request opens nothing, and a
 * revocation closes it immediately.
 *
 * What it opens is session summaries only — never the conversation. There is
 * no transcript page or route in the portal at all, so this chip is the whole
 * of what a therapist can ask for.
 */
export function ConsentChip({ clientUserId, clientLabel, summaryAccess, moodShared }: ConsentChipProps) {
  const utils = trpc.useUtils();
  const [justRequested, setJustRequested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const requestSummaryAccess = trpc.clients.requestSummaryAccess.useMutation({
    onSuccess: () => {
      setJustRequested(true);
      setConfirming(false);
      utils.clients.detail.invalidate({ clientUserId });
    },
    onError: () => {
      setConfirming(false);
    },
  });

  const askedRecently =
    summaryAccess.state === 'waiting_for_client' &&
    Date.now() - new Date(summaryAccess.requestedAt).getTime() < THIRTY_DAYS_MS;

  const chatLabel =
    summaryAccess.state === 'open'
      ? `open until ${formatDate(summaryAccess.expiresAt)}`
      : summaryAccess.state === 'waiting_for_client' || justRequested
        ? 'waiting for the client'
        : summaryAccess.state === 'closed'
          ? 'closed'
          : 'not requested';

  const canAsk = summaryAccess.state === 'not_requested' || summaryAccess.state === 'closed';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-oat px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${moodShared ? 'bg-sage-deep' : 'bg-gray-300'}`}
        />
        mood check-ins {moodShared ? 'shared' : 'not shared'}
      </span>
      <span className="text-gray-300">·</span>
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${summaryAccess.state === 'open' ? 'bg-sage-deep' : 'bg-gray-300'}`}
        />
        session summaries: {chatLabel}
      </span>
      {canAsk && (
        <button
          type="button"
          disabled={requestSummaryAccess.isPending || askedRecently || justRequested}
          onClick={() => setConfirming(true)}
          className="ml-auto text-xs font-medium text-royal-purple hover:underline disabled:cursor-not-allowed disabled:text-gray-500 disabled:no-underline"
        >
          Ask to share
        </button>
      )}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <p className="text-sm text-gray-800">
              Ask {clientLabel} to share their session summaries? They get one quiet prompt in
              the app. Only they can approve it, a read-only window of 30 days starts when they
              do, and they can revoke it at any time. Summaries only — never their messages.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={requestSummaryAccess.isPending}
                onClick={() => requestSummaryAccess.mutate({ clientUserId })}
                className="rounded-lg bg-violet px-3 py-1.5 text-sm font-medium text-white hover:bg-royal-purple disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requestSummaryAccess.isPending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
