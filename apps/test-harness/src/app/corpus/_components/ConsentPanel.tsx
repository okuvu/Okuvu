'use client';

import { useEffect, useState, useTransition } from 'react';
import BadgeChip from '@/app/components/BadgeChip';
import { captureConsentAction, getConsentStatusAction } from './consent-actions';

/**
 * TH-S31 — small panel showing consent status for a corpus case, with a
 * "capture consent" action. Talks to the not-yet-registered `consentRouter`
 * via the local server-action caller in `./consent-actions.ts` (same
 * unregistered-router workaround `CaseEditor.tsx`/`actions.ts` uses for
 * `corpusRouter`).
 *
 * Consent here is intentionally scoped by `corpusCaseId` — a corpus case
 * with `dataOrigin === 'real'` is the concrete thing whose underlying
 * participant needs a recorded, checkable consent grant before that case is
 * used in beta testing.
 */
export default function ConsentPanel({ corpusCaseId }: { corpusCaseId: string }) {
  const [status, setStatus] = useState<{
    hasActiveConsent: boolean;
    activeCount: number;
    mostRecent: { id: string; scope: string; consentGrantedAt: string; expiresAt?: string } | null;
  } | null>(null);
  const [userRef, setUserRef] = useState('');
  const [scope, setScope] = useState('beta-testing');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      const result = await getConsentStatusAction({ corpusCaseId });
      if (result.success) {
        setStatus(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpusCaseId]);

  const handleCapture = () => {
    if (!userRef.trim()) {
      setError('userRef is required to capture consent');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await captureConsentAction({
        corpusCaseId,
        userRef: userRef.trim(),
        scope: scope.trim() || 'beta-testing',
      });
      if (result.success) {
        setUserRef('');
        refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
      <div className="flex items-center justify-between">
        <h3 className="text-[var(--text-label-sm)] font-medium text-[var(--color-on-surface)]">
          Consent status
        </h3>
        {status && (
          <BadgeChip
            colorClass={
              status.hasActiveConsent
                ? 'text-[var(--color-on-primary-container)] bg-[var(--color-primary-container)] border-transparent'
                : 'text-[var(--color-on-error-container)] bg-[var(--color-error-container)] border-transparent'
            }
          >
            {status.hasActiveConsent ? `Active (${status.activeCount})` : 'No active consent'}
          </BadgeChip>
        )}
      </div>

      {status?.mostRecent && (
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Most recent: {status.mostRecent.scope}, granted{' '}
          {new Date(status.mostRecent.consentGrantedAt).toLocaleString()}
          {status.mostRecent.expiresAt &&
            `, expires ${new Date(status.mostRecent.expiresAt).toLocaleString()}`}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          User ref
          <input
            value={userRef}
            onChange={(e) => setUserRef(e.target.value)}
            placeholder="participant reference"
            className="mt-1 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          />
        </label>
        <label className="flex flex-col text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Scope
          <input
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="mt-1 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          />
        </label>
        <button
          type="button"
          disabled={isPending}
          onClick={handleCapture}
          className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-3 py-1.5 text-[var(--text-label-sm)] font-medium text-[var(--color-on-primary)] disabled:opacity-50"
        >
          Capture consent
        </button>
      </div>

      {error && <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{error}</p>}
    </div>
  );
}
