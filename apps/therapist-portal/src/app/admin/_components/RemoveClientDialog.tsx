'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/trpc/client';

export interface RemoveClientTarget {
  id: string;
  label: string;
  email: string | null;
}

interface Props {
  target: RemoveClientTarget;
  onClose: () => void;
  onRemoved: (summary: string) => void;
}

interface ErasedCounts {
  turns: number;
  sessions: number;
  moodCheckins: number;
  appointments: number;
  notes: number;
  assignments: number;
  journalEntries: number;
  homework: number;
  invites: number;
}

/**
 * Operator confirmation for the console's only destructive action.
 *
 * Two things a delete dialog gets wrong and this one is built against: it names
 * the exact row (a table of clients and a mis-aimed click are one tap apart),
 * and it states what disappears, because "remove" reads like it just tidies the
 * list. The checkbox exists so the destructive button can never be the thing
 * that was already under the cursor — the extra click is the point, not a
 * formality.
 */
function describe(counts: ErasedCounts): string {
  const parts = [
    [counts.sessions, 'conversation'],
    [counts.turns, 'message'],
    [counts.moodCheckins, 'mood check-in'],
    [counts.appointments, 'appointment'],
    [counts.notes, 'therapist note'],
    [counts.assignments, 'therapist assignment'],
    [counts.journalEntries, 'journal entry'],
    [counts.homework, 'homework item'],
    [counts.invites, 'invite'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, word]) => `${n} ${word}${(n as number) === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'no activity or clinical records';
}

export function RemoveClientDialog({ target, onClose, onRemoved }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const removeClient = trpc.admin.removeClient.useMutation({
    onSuccess: (result) => {
      onRemoved(`Removed ${result.label} — deleted ${describe(result.erased)}.`);
    },
    onError: (err) => {
      setError(err.message || 'Could not remove this client.');
    },
  });

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !removeClient.isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-royal-night/40 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-client-title"
        aria-describedby="remove-client-body"
        className="w-full max-w-md rounded-xl border border-hairline bg-white p-6 shadow-lg"
      >
        <h2 id="remove-client-title" className="text-base font-semibold text-charcoal-ink">
          Remove {target.label}?
        </h2>
        {target.email && (
          <p className="mt-1 text-xs text-ink-soft">{target.email}</p>
        )}

        <div id="remove-client-body" className="mt-4 space-y-3 text-sm text-ink-soft">
          <p>
            This deletes the client&apos;s account and everything held against it — conversations,
            mood check-ins, journal entries, appointments, therapist notes and the assignment
            record. It cannot be undone.
          </p>
          <p>
            Their therapist stays on the staff list, and any clinician portal sign-in for the same
            email address is unaffected.
          </p>
          <p className="rounded-lg bg-honey-tint p-3 text-xs text-charcoal-ink">
            If the client asked for their data to be erased, this satisfies that request. If you
            only want them off a therapist&apos;s caseload, end the assignment instead — that keeps
            the history.
          </p>
        </div>

        <div className="mt-4 flex items-start gap-2">
          <input
            id="remove-client-confirm"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={removeClient.isPending}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-danger focus:ring-danger disabled:opacity-60"
          />
          <label htmlFor="remove-client-confirm" className="text-xs text-ink-soft">
            I understand this permanently deletes this client and their data.
          </label>
        </div>

        {error && (
          <p role="alert" aria-live="assertive" className="mt-3 rounded-lg bg-danger-tint p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={removeClient.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-charcoal-ink transition-colors hover:bg-oat disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed || removeClient.isPending}
            onClick={() => {
              setError(null);
              removeClient.mutate({ clientUserId: target.id });
            }}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {removeClient.isPending ? 'Removing…' : 'Remove permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
