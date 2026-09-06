'use client';

import { useState } from 'react';
import RunStatusBadge from '@/app/components/RunStatusBadge';
import TraceViewer from '@/app/components/TraceViewer';
import { useEnvironment } from '@/lib/environment-context';
import {
  injectModelFailure,
  injectSignalFailure,
  verifyFailSafe,
} from '@/trpc/faultInjectionClient';

const BOUNDARIES = ['A1', 'A2', 'A9_pre', 'A9_post'] as const;
type Boundary = (typeof BOUNDARIES)[number];

const FAULT_TYPES = ['timeout', 'api_error'] as const;
type FaultType = (typeof FAULT_TYPES)[number];

type RunResult = { result: any; runId: string };
type VerifyResult = {
  assertion1: 'PASS' | 'FAIL';
  assertion2: 'PASS' | 'FAIL';
  assertion3: 'PASS' | 'FAIL';
  details: unknown;
};

function assertionColorClass(value: 'PASS' | 'FAIL' | undefined): string {
  if (value === 'PASS') return 'text-[var(--color-on-surface)] bg-emerald-500/15 border-emerald-500/40';
  if (value === 'FAIL') return 'text-[var(--color-on-surface)] bg-red-500/15 border-red-500/40';
  return 'text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container-high)] border-[var(--color-outline-variant)]';
}

export default function FaultConsole() {
  const { environment } = useEnvironment();
  const [boundary, setBoundary] = useState<Boundary>('A1');
  const [faultType, setFaultType] = useState<FaultType>('timeout');
  const [message, setMessage] = useState('I feel overwhelmed today.');
  const [mode, setMode] = useState<'model' | 'signal'>('model');

  const [runPending, setRunPending] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const handleRun = async () => {
    setRunPending(true);
    setRunError(null);
    try {
      const data =
        mode === 'model'
          ? await injectModelFailure({ boundary, type: faultType, message, environment })
          : await injectSignalFailure({ message, environment });
      setRunResult(data);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunPending(false);
    }
  };

  const handleVerify = async () => {
    setVerifyPending(true);
    setVerifyError(null);
    try {
      const data = await verifyFailSafe();
      setVerifyResult(data);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifyPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <div className="flex flex-wrap items-end gap-[var(--spacing-md)]">
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
              Fault mode
            </span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'model' | 'signal')}
              className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
            >
              <option value="model">Model failure (boundary + type)</option>
              <option value="signal">Signal drop (A2 signal nulled)</option>
            </select>
          </label>

          {mode === 'model' && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
                  Boundary
                </span>
                <select
                  value={boundary}
                  onChange={(e) => setBoundary(e.target.value as Boundary)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
                >
                  {BOUNDARIES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
                  Fault type
                </span>
                <select
                  value={faultType}
                  onChange={(e) => setFaultType(e.target.value as FaultType)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
                >
                  {FAULT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
            Message
          </span>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          />
        </label>

        <div className="flex gap-[var(--spacing-md)]">
          <button
            type="button"
            onClick={handleRun}
            disabled={runPending}
            className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
          >
            {runPending ? 'Running…' : 'Run fault injection'}
          </button>

          <button
            type="button"
            onClick={handleVerify}
            disabled={verifyPending}
            className="self-start rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-surface)] disabled:opacity-50"
          >
            {verifyPending ? 'Verifying…' : 'Verify 3 fail-safe assertions'}
          </button>
        </div>
      </div>

      {runError ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
          Fault injection failed: {runError}
        </p>
      ) : null}

      {runResult ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
              Run: {runResult.runId}
            </span>
            {runResult.result?.type === 'agent_turn' ? (
              <RunStatusBadge status={runResult.result.fallbackUsed ? 'warning' : 'pass'} />
            ) : (
              <RunStatusBadge status={runResult.result?.type === 'error' ? 'error' : 'warning'} />
            )}
          </div>
          <TraceViewer data={runResult.result} title="Pipeline result" defaultExpanded />
        </div>
      ) : null}

      {verifyError ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
          Verification failed: {verifyError}
        </p>
      ) : null}

      {verifyResult ? (
        <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
          <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
            Fail-safe assertions
          </h2>
          <div className="grid grid-cols-1 gap-[var(--spacing-sm)] sm:grid-cols-3">
            {(
              [
                ['A1 failure → S2 fallback used', verifyResult.assertion1],
                ['A2 failure → A2_DEGRADED_RESPONSE returned', verifyResult.assertion2],
                ['A9-post failure at S2 → GovernanceLog BLOCKED', verifyResult.assertion3],
              ] as const
            ).map(([label, result]) => (
              <div
                key={label}
                className={`flex flex-col gap-1 rounded-[var(--radius-md)] border p-3 ${assertionColorClass(result)}`}
              >
                <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)]">
                  {label}
                </span>
                <span className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)]">
                  {result}
                </span>
              </div>
            ))}
          </div>
          <TraceViewer data={verifyResult.details} title="Assertion details" />
        </div>
      ) : null}
    </div>
  );
}
