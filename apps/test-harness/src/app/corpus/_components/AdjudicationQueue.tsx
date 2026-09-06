'use client';

import { useEffect, useState, useTransition } from 'react';
import { listAdjudicationQueueAction, resolveAdjudicationAction } from '../actions';
import type { CorpusCaseWithLineage } from '@/server/routers/corpus';
import BadgeChip from '@/app/components/BadgeChip';

/**
 * Review-queue extension for case-factory output (mvp-v2-engineering-spec.md
 * §7). Lists CorpusCase rows still awaiting human confirmation after a
 * factory mutation — every kind except plain rephrasing sets this (see
 * case-factory.ts's LABEL_PRESERVING_KINDS).
 */
export default function AdjudicationQueue({ onResolved }: { onResolved: () => void }) {
  const [items, setItems] = useState<CorpusCaseWithLineage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      const result = await listAdjudicationQueueAction();
      if (result.success) {
        setItems(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResolve = (caseId: string, approved: boolean) => {
    if (resolvingId) return;
    setResolvingId(caseId);
    (async () => {
      const result = await resolveAdjudicationAction({ caseId, approved });
      setResolvingId(null);
      if (result.success) {
        setItems((prev) => prev.filter((c) => c.id !== caseId));
        onResolved();
      } else {
        setError(result.error);
      }
    })();
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
      <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
        Adjudication queue {isPending && '(loading…)'}
      </h2>
      <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        Factory-generated variations whose expected behavior hasn&apos;t been human-confirmed yet.
        Approve to keep the seed&apos;s expected behavior as-is; reject to tag it out of trusted use
        (rejected cases stay in history, they&apos;re never deleted). To correct the content or
        expected behavior instead of approving/rejecting as-is, select the case above and save a
        new version.
      </p>
      {error && <p className="text-[var(--text-body-main)] text-[var(--color-error)]">Error: {error}</p>}
      {items.length === 0 && !isPending && (
        <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          Nothing awaiting adjudication.
        </p>
      )}
      <ul className="flex flex-col gap-[var(--spacing-xs)]">
        {items.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] p-[var(--spacing-sm)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <BadgeChip>{c.type}</BadgeChip>
              {c.tags.map((tag) => (
                <BadgeChip key={tag}>{tag}</BadgeChip>
              ))}
            </div>
            <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">{c.input}</p>
            {c.expectedOutput && (
              <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                Expected (from seed): {c.expectedOutput}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={resolvingId === c.id}
                onClick={() => handleResolve(c.id, true)}
                className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-3 py-1.5 text-[var(--text-label-sm)] font-medium text-[var(--color-on-primary)] disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={resolvingId === c.id}
                onClick={() => handleResolve(c.id, false)}
                className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
