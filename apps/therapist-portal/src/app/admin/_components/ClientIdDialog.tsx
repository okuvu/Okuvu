'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/trpc/client';
import { GENDER_OPTIONS } from '@/lib/client-code';

export interface ClientIdTarget {
  id: string;
  /** The therapist's name for this client, or their email — never a phone. */
  label: string;
  /** The client's real name, when the row has one. Prefills the field. */
  fullName: string | null;
  email: string | null;
}

interface Props {
  target: ClientIdTarget;
  onClose: () => void;
  onIssued: (summary: string) => void;
}

/**
 * "Set ID details" — the console's way to give a client a record number.
 *
 * Two kinds of row arrive here: clients registered before numbering existed
 * whose birth year or gender was never captured, and rows created by a path
 * that only took an email. The number cannot be guessed from missing data, so
 * this asks for the two fields the rule needs and mints it on save.
 *
 * A client who already has a number never reaches this dialog — the action is
 * hidden for them, because the number is frozen and renumbering is not a thing
 * this product does.
 */
export function ClientIdDialog({ target, onClose, onIssued }: Props) {
  const [fullName, setFullName] = useState(target.fullName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const complete = trpc.admin.completeClientProfile.useMutation({
    onSuccess: (result) => {
      onIssued(
        result.alreadyNumbered
          ? `${target.label} already had ID ${result.clientCode} — details updated, number unchanged.`
          : `${target.label} is now ${result.clientCode}.`,
      );
    },
    onError: (err) => setError(err.message || 'Could not set the client ID.'),
  });

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !complete.isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = Boolean(fullName.trim() && dateOfBirth && gender) && !complete.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-royal-night/40 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !complete.isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-id-title"
        className="w-full max-w-md rounded-xl bg-oat-elevated p-6 shadow-xl border border-hairline"
      >
        <h2 id="client-id-title" className="text-lg font-semibold text-gray-900">
          Give this client an ID
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          The ID is built from initials, birth year and gender — for example{' '}
          <span className="font-mono">SG88F0001</span>. It is fixed once issued.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="cid-name" className="mb-1 block text-xs font-medium text-gray-500">
              Full name
            </label>
            <input
              id="cid-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            />
            <p className="mt-1 text-xs text-gray-500">
              Their initials become the first two characters of the ID.
            </p>
          </div>
          <div>
            <label htmlFor="cid-dob" className="mb-1 block text-xs font-medium text-gray-500">
              Date of birth
            </label>
            <input
              id="cid-dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            />
          </div>
          <div>
            <label htmlFor="cid-gender" className="mb-1 block text-xs font-medium text-gray-500">
              Gender
            </label>
            <select
              id="cid-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            >
              <option value="" disabled>Select</option>
              {GENDER_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-tint p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={complete.isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              complete.mutate({
                clientUserId: target.id,
                fullName: fullName.trim() || undefined,
                dateOfBirth,
                gender: gender as (typeof GENDER_OPTIONS)[number],
              })
            }
            className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {complete.isPending ? 'Saving…' : 'Issue ID'}
          </button>
        </div>
      </div>
    </div>
  );
}
