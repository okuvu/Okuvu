'use client';

import { useCallback, useEffect, useState } from 'react';
import RunStatusBadge from '@/app/components/RunStatusBadge';
import type { GateStatusRun } from '@/server/routers/ci';

interface ApiError {
  error: string;
  code: string;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value && 'code' in value;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = isApiError(body) ? body.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export default function CiConsole() {
  const [runs, setRuns] = useState<GateStatusRun[] | null>(null);
  const [haltFailures, setHaltFailures] = useState<GateStatusRun[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerFeedback, setTriggerFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [gateStatus, halts] = await Promise.all([
        fetchJson<GateStatusRun[]>('/api/ci?action=gate-status'),
        fetchJson<GateStatusRun[]>('/api/ci?action=halt-failures'),
      ]);
      setRuns(gateStatus);
      setHaltFailures(halts);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load CI gate status');
      setRuns(null);
      setHaltFailures(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerFeedback(null);
    try {
      await fetchJson('/api/ci', { method: 'POST' });
      setTriggerFeedback('Regression run triggered.');
      await load();
    } catch (error) {
      setTriggerFeedback(
        `Failed to trigger regression: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      setTriggering(false);
    }
  };

  const releaseBlocked = (haltFailures?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex items-center justify-between rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
        <div>
          <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
            Release status
          </h2>
          {loading ? (
            <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
              Loading…
            </p>
          ) : loadError ? (
            <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-error)]">
              {loadError}
            </p>
          ) : (
            <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
              {releaseBlocked ? (
                <span className="font-semibold text-red-700">
                  Release blocked — {haltFailures?.length} HALT run(s) in regression history.
                </span>
              ) : (
                <span className="font-semibold text-emerald-700">
                  No HALT runs — release not blocked by regression.
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleTrigger}
            disabled={triggering}
            className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-sm)] font-medium text-[var(--color-on-primary)] transition-opacity disabled:opacity-50"
          >
            {triggering ? 'Triggering…' : 'Trigger Regression'}
          </button>
          {triggerFeedback ? (
            <p className="max-w-xs text-right text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              {triggerFeedback}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
        <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
          Gate status — regression.yml runs
        </h2>
        {!loading && !loadError && (!runs || runs.length === 0) ? (
          <p className="mt-4 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            No runs yet.
          </p>
        ) : null}
        {runs && runs.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)] text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                  <th className="py-2 pr-4 font-medium">Run</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Created</th>
                  <th className="py-2 pr-4 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-[var(--color-outline-variant)] last:border-0"
                  >
                    <td className="py-2 pr-4 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                      {run.id}
                    </td>
                    <td className="py-2 pr-4">
                      <RunStatusBadge status={run.mappedStatus} />
                    </td>
                    <td className="py-2 pr-4 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <a
                        href={run.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--text-body-main)] text-[var(--color-primary)] underline"
                      >
                        View run
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
        <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
          HALT failures
        </h2>
        {!loading && !loadError && (!haltFailures || haltFailures.length === 0) ? (
          <p className="mt-4 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            None — no HALT runs in regression history.
          </p>
        ) : null}
        {haltFailures && haltFailures.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {haltFailures.map((run) => (
              <li
                key={run.id}
                className="flex items-center justify-between rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-3 py-2"
              >
                <span className="text-[var(--text-body-main)] text-red-800">
                  Run {run.id} — {new Date(run.created_at).toLocaleString()}
                </span>
                <a
                  href={run.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--text-label-sm)] font-medium text-red-700 underline"
                >
                  View log
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
