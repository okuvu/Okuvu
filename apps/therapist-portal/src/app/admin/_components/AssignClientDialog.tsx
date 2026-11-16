'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/trpc/client';

export interface AssignClientTarget {
  id: string;
  label: string;
  email: string | null;
}

export interface AssignableTherapist {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  target: AssignClientTarget;
  therapists: AssignableTherapist[];
  onClose: () => void;
  onAssigned: (summary: string) => void;
}

/**
 * Attach a therapist to a client who joined on their own.
 *
 * Self-serve signup means a `User` row can exist with no therapist and no care
 * plan. The console's other "Add client" form looks the client up by phone
 * number, which nobody who signed in with Google has — so this dialog assigns by
 * the row the operator is already looking at.
 *
 * The row starts as the therapist's caseload, not a care plan: a care plan is
 * the therapist's clinical decision, made in the client's own page afterwards.
 */
export function AssignClientDialog({ target, therapists, onClose, onAssigned }: Props) {
  const [therapistId, setTherapistId] = useState('');
  const [languageMode, setLanguageMode] = useState('');
  const [chatAccessGranted, setChatAccessGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const assign = trpc.admin.assignClientUser.useMutation({
    onSuccess: (result) => {
      onAssigned(
        result.wasAlreadyAssigned
          ? `${target.label} was already assigned to ${result.therapistEmail} — nothing changed.`
          : `Assigned ${target.label} to ${result.therapistEmail}.`,
      );
    },
    onError: (err) => {
      setError(err.message || 'Could not assign this client.');
    },
  });

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !assign.isPending) onClose();
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
        aria-labelledby="assign-client-title"
        className="w-full max-w-md rounded-xl border border-hairline bg-white p-6 shadow-lg"
      >
        <h2 id="assign-client-title" className="text-base font-semibold text-charcoal-ink">
          Assign {target.label} to a therapist
        </h2>
        {target.email && <p className="mt-1 text-xs text-ink-soft">{target.email}</p>}

        <p className="mt-3 text-sm text-ink-soft">
          They already have the app and an account. Assigning puts them on this therapist&apos;s
          caseload; the care plan is set from the client&apos;s own page.
        </p>

        <div className="mt-4">
          <label htmlFor="assign-user-therapist" className="mb-1 block text-xs font-medium text-ink-soft">
            Therapist
          </label>
          <select
            id="assign-user-therapist"
            required
            value={therapistId}
            onChange={(e) => setTherapistId(e.target.value)}
            disabled={assign.isPending}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
          >
            <option value="" disabled>
              Select a therapist
            </option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name ? `${t.name} (${t.email})` : t.email}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <label htmlFor="assign-user-language" className="mb-1 block text-xs font-medium text-ink-soft">
            Language preference (optional)
          </label>
          <select
            id="assign-user-language"
            value={languageMode}
            onChange={(e) => setLanguageMode(e.target.value)}
            disabled={assign.isPending}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
          >
            <option value="">Not set (client decides)</option>
            <option value="english">English</option>
            <option value="mirror">Mirror (Hinglish)</option>
          </select>
        </div>

        <div className="mt-3 flex items-start gap-2">
          <input
            id="assign-user-consent"
            type="checkbox"
            checked={chatAccessGranted}
            onChange={(e) => setChatAccessGranted(e.target.checked)}
            disabled={assign.isPending}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-royal-purple focus:ring-violet disabled:opacity-60"
          />
          <label htmlFor="assign-user-consent" className="text-xs text-ink-soft">
            Client has given permission for their therapist to view raw chat content
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
            disabled={assign.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-charcoal-ink transition-colors hover:bg-oat disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!therapistId || assign.isPending}
            onClick={() => {
              setError(null);
              assign.mutate({
                therapistId,
                clientUserId: target.id,
                chatAccessGranted,
                languageMode: languageMode ? (languageMode as 'english' | 'mirror') : undefined,
              });
            }}
            className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-royal-purple disabled:cursor-not-allowed disabled:opacity-60"
          >
            {assign.isPending ? 'Assigning…' : 'Assign therapist'}
          </button>
        </div>
      </div>
    </div>
  );
}
