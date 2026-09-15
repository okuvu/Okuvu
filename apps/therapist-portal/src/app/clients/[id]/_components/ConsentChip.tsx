'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';

interface ConsentChipProps {
  clientUserId: string;
  consent: {
    safety: boolean;
    mood: boolean;
    chatAccess: boolean;
    chatAccessRequestedAt: string | null;
  };
}

function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${on ? 'bg-[#2D8A5E]' : 'bg-gray-300'}`} />;
}

/**
 * Therapist-portal wireframes C-08 — "safety ✓ · mood ✓ · chat off".
 * Portal can only indicate + request chat access; the client owns the
 * actual grant/deny via the mobile app's own PATCH /users/me/chat-access.
 */
export function ConsentChip({ clientUserId, consent }: ConsentChipProps) {
  const utils = trpc.useUtils();
  const [justRequested, setJustRequested] = useState(false);
  const requestChatAccess = trpc.clients.requestChatAccess.useMutation({
    onSuccess: () => {
      setJustRequested(true);
      utils.clients.detail.invalidate({ clientUserId });
    },
  });

  const chatLabel = consent.chatAccess
    ? 'chat on'
    : consent.chatAccessRequestedAt || justRequested
      ? 'chat requested'
      : 'chat off';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[#F4F6F8] px-3 py-2">
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
          disabled={requestChatAccess.isPending || Boolean(consent.chatAccessRequestedAt) || justRequested}
          onClick={() => requestChatAccess.mutate({ clientUserId })}
          className="ml-auto text-xs font-medium text-[#1A6B5A] hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
        >
          {consent.chatAccessRequestedAt || justRequested ? 'Requested' : 'Request chat access'}
        </button>
      )}
    </div>
  );
}
