'use client';

import { useEffect, useState } from 'react';
import { compareRunsAction } from '../actions';

type CompareData = Awaited<ReturnType<typeof compareRunsAction>>;

export default function CompareView({ runIdA, runIdB }: { runIdA: string; runIdB: string }) {
  const [data, setData] = useState<CompareData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    compareRunsAction({ runIdA, runIdB }).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [runIdA, runIdB]);

  if (!data) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Loading comparison…
      </p>
    );
  }

  if (!data.success) {
    return <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{data.error}</p>;
  }

  const { diff } = data.data;
  const frozenTripleFields = Object.keys(diff.frozenTripleDiff);

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
        Compare {runIdA} vs {runIdB}
      </h2>

      <section className="flex flex-col gap-[var(--spacing-sm)]">
        <h3 className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
          Frozen triple differences
        </h3>
        {frozenTripleFields.length === 0 ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            No differences.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)]">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
                  <th className="px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Field
                  </th>
                  <th className="px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Run A (&minus;)
                  </th>
                  <th className="px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Run B (+)
                  </th>
                </tr>
              </thead>
              <tbody>
                {frozenTripleFields.map((field) => {
                  const entry = diff.frozenTripleDiff[field];
                  return (
                    <tr key={field} className="border-b border-[var(--color-outline-variant)] last:border-0">
                      <td className="px-3 py-2 font-mono text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                        {field}
                      </td>
                      {/* "−"/"+" text markers precede each value so the diff
                          is legible without the red/green background —
                          color alone never carries the meaning here. */}
                      <td className="bg-red-50 px-3 py-2 font-mono text-[var(--text-body-main)] text-red-800">
                        <span aria-hidden="true">&minus; </span>
                        {JSON.stringify(entry.a) ?? 'undefined'}
                      </td>
                      <td className="bg-emerald-50 px-3 py-2 font-mono text-[var(--text-body-main)] text-emerald-800">
                        <span aria-hidden="true">+ </span>
                        {JSON.stringify(entry.b) ?? 'undefined'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-[var(--spacing-sm)]">
        <h3 className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
          Output differences
        </h3>
        {diff.outputDiff.length === 0 ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            No differences.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)]">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
                  <th className="px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Path
                  </th>
                  <th className="px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Run A (&minus;)
                  </th>
                  <th className="px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Run B (+)
                  </th>
                </tr>
              </thead>
              <tbody>
                {diff.outputDiff.map((entry) => (
                  <tr key={entry.path} className="border-b border-[var(--color-outline-variant)] last:border-0">
                    <td className="px-3 py-2 font-mono text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                      {entry.path}
                    </td>
                    <td className="max-w-[280px] truncate bg-red-50 px-3 py-2 font-mono text-[var(--text-body-main)] text-red-800">
                      <span aria-hidden="true">&minus; </span>
                      {JSON.stringify(entry.a) ?? 'undefined'}
                    </td>
                    <td className="max-w-[280px] truncate bg-emerald-50 px-3 py-2 font-mono text-[var(--text-body-main)] text-emerald-800">
                      <span aria-hidden="true">+ </span>
                      {JSON.stringify(entry.b) ?? 'undefined'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
