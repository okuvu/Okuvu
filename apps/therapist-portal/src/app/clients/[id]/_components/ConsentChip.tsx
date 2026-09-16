'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';

interface ConsentChipProps {
  clientUserId: string;
  clientLabel: string;
  consent: {
    safety: boolean;
    mood: boolean;
    chatAccess: boolean;
    chatAccessRequestedAt: string | null;
  };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${on ? 'bg-sage-deep' : 'bg-gray-300'}`} />;
}

/**
 * Therapist-portal wireframes C-08, copy locked by the decisions doc round
 * (15 Sep 2026 §9) — "Ask to share" → confirm dialog → "Asked · waiting" /
 * "Shared" / "Not shared". Portal can only indicate + request chat access;
 * the client owns the actual grant/deny via the mobile app's own
 * PATCH /users/me/chat-access.
 */
export function ConsentChip({ clientUserId, clientLabel, consent }: ConsentChipProps) {
  const utils = trpc.useUtils();
  const [justRequested, setJustRequested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const requestChatAccess = trpc.clients.requestChatAccess.useMutation({
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
    Boolean(consent.chatAccessRequestedAt) &&
    Date.now() - new Date(consent.chatAccessRequestedAt as string).getTime() < THIRTY_DAYS_MS;

  const chatLabel = consent.chatAccess
    ? 'Shared'
    : consent.chatAccessRequestedAt || justRequested
      ? 'Asked · waiting'
      : 'Not shared';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-oat px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <Dot on={consent.safety} /> safety {consent.safety ? '✓' : '✗'}
      </span>
      <span className="text-gray-300">·</span>
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <Dot on={consent.mood} /> mood {consent.mood ? '✓' : '✗'}
      </span>
      <span className="text-gray-300">·</span>
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <Dot on={consent.chatAccess} /> {chatLabel}
      </span>
      {!consent.chatAccess && (
        <button
          type="button"
          disabled={requestChatAccess.isPending || askedRecently || justRequested}
          onClick={() => setConfirming(true)}
          className="ml-auto text-xs font-medium text-royal-purple hover:underline disabled:cursor-not-allowed disabled:text-gray-500 disabled:no-underline"
        >
          {consent.chatAccessRequestedAt || justRequested ? 'Asked · waiting' : 'Ask to share'}
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
              Ask {clientLabel} to share chat summaries? They get one quiet prompt. Only they can
              change it — you&rsquo;ll just see their answer here.
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
                disabled={requestChatAccess.isPending}
                onClick={() => requestChatAccess.mutate({ clientUserId })}
                className="rounded-lg bg-violet px-3 py-1.5 text-sm font-medium text-white hover:bg-royal-purple disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requestChatAccess.isPending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
