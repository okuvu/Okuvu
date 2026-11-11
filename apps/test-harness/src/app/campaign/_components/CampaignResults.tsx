'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';

type Verdict = 'PASS' | 'FAIL' | 'UNGRADED' | 'INCOMPLETE' | 'RUNNING';

const VERDICT_STYLES: Record<Verdict, string> = {
  PASS: 'text-emerald-800 bg-emerald-50 border-emerald-300',
  FAIL: 'text-red-800 bg-red-50 border-red-300',
  UNGRADED: 'text-amber-800 bg-amber-50 border-amber-300',
  INCOMPLETE: 'text-slate-700 bg-slate-100 border-slate-300',
  RUNNING: 'text-blue-800 bg-blue-50 border-blue-300',
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-full)] border px-2 py-0.5 text-[var(--text-label-sm)] font-medium ${VERDICT_STYLES[verdict]}`}
    >
      {verdict === 'RUNNING' ? '↻ ' : verdict === 'PASS' ? '✓ ' : verdict === 'FAIL' ? '✕ ' : '◌ '}
      {verdict}
    </span>
  );
}

/**
 * Step 4 of /campaign: one row per conversation, marked PASS / FAIL /
 * UNGRADED / INCOMPLETE, with the transcript (and every finding behind the
 * verdict) one click away.
 *
 * UNGRADED and INCOMPLETE are shown as their own outcomes rather than folded
 * into PASS or FAIL: an ungraded conversation proves nothing, and counting it
 * as a pass inflates the number someone then edits a prompt over.
 */
export default function CampaignResults({ campaignId }: { campaignId: string }) {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const campaign = trpc.campaign.get.useQuery(
    { campaignId },
    {
      refetchInterval: (query) => (query.state.data?.campaign.status === 'running' ? 2000 : false),
    },
  );
  const transcript = trpc.campaign.transcript.useQuery(
    { groupId: openGroupId ?? '' },
    { enabled: Boolean(openGroupId) },
  );

  if (campaign.isLoading) {
    return <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">Loading results…</p>;
  }
  if (campaign.error) {
    return <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{campaign.error.message}</p>;
  }
  if (!campaign.data) return null;

  const { campaign: meta, results, counts } = campaign.data;

  return (
    <div className="flex flex-col gap-[var(--spacing-md)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        <strong className="text-[var(--color-on-surface)]">{meta.label}</strong>
        <span>{meta.environment} · {meta.target}</span>
        <span>{meta.sessions} session{meta.sessions === 1 ? '' : 's'} · {meta.turnsMin}–{meta.turnsMax} turns</span>
        <span>seed {meta.seed}</span>
        <span>judge {meta.judgeEnabled ? 'on' : 'off'}</span>
        <span>ceiling ${meta.costCeilingUsd.toFixed(2)} · estimate ${meta.costEstimateUsd.toFixed(2)}</span>
        <span className="uppercase tracking-wide">{meta.status}</span>
      </div>

      <div className="flex flex-wrap gap-2 text-[var(--text-label-sm)]">
        {(['PASS', 'FAIL', 'UNGRADED', 'INCOMPLETE', 'RUNNING'] as Verdict[]).map((verdict) =>
          counts[verdict] ? (
            <span key={verdict}>
              <VerdictChip verdict={verdict} /> <span className="ml-1">{counts[verdict]}</span>
            </span>
          ) : null,
        )}
        {results.length === 0 ? (
          <span className="text-[var(--color-on-surface-variant)]">No conversations yet — advance the campaign.</span>
        ) : null}
      </div>

      {results.length > 0 ? (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]">
          <table className="w-full text-left text-[var(--text-label-sm)]">
            <thead className="bg-[var(--color-surface-container-low)]">
              <tr>
                <th className="px-2 py-1.5">Persona</th>
                <th className="px-2 py-1.5">Verdict</th>
                <th className="px-2 py-1.5">Turns</th>
                <th className="px-2 py-1.5">Continuity</th>
                <th className="px-2 py-1.5">Judge</th>
                <th className="px-2 py-1.5">Cost</th>
                <th className="px-2 py-1.5">Why</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr
                  key={row.groupId}
                  onClick={() => setOpenGroupId(row.groupId === openGroupId ? null : row.groupId)}
                  className={`cursor-pointer border-t border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)] ${
                    row.groupId === openGroupId ? 'bg-[var(--color-surface-container-low)]' : ''
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{row.personaId}</span>
                    <span className="text-[var(--color-on-surface-variant)]"> v{row.personaVersion}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <VerdictChip verdict={row.verdict as Verdict} />
                  </td>
                  <td className="px-2 py-1.5">
                    {row.turnsCompleted} · {row.sessionsCompleted} sess
                  </td>
                  <td className="px-2 py-1.5">
                    {row.checks.continuityFailures.length === 0 ? (
                      <span className="text-emerald-700">C1–C5 ok</span>
                    ) : (
                      <span className="text-red-700">{row.checks.continuityFailures.join(', ')}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {row.checks.judgedSessions === 0
                      ? '—'
                      : `${row.checks.judgedSessions - row.checks.failedJudgeSessions}/${row.checks.judgedSessions} pass`}
                  </td>
                  <td className="px-2 py-1.5">${row.costSoFarUsd.toFixed(3)}</td>
                  <td className="max-w-[26rem] px-2 py-1.5 text-[var(--color-on-surface-variant)]">
                    {row.reason}
                    {row.findings.length > 0 ? (
                      <span className="ml-1 text-amber-700">
                        (+{row.findings.length} finding{row.findings.length === 1 ? '' : 's'})
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {openGroupId ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-[var(--text-title-sm)] font-medium text-[var(--color-on-surface)]">Transcript</h3>
            {transcript.data ? <VerdictChip verdict={transcript.data.verdict as Verdict} /> : null}
            {transcript.data ? (
              <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                {transcript.data.reason}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setOpenGroupId(null)}
              className="ml-auto rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1 text-[var(--text-label-sm)]"
            >
              Close
            </button>
          </div>

          {transcript.isLoading ? <p className="text-[var(--text-label-sm)]">Loading transcript…</p> : null}
          {transcript.error ? (
            <p className="text-[var(--text-label-sm)] text-[var(--color-error)]">{transcript.error.message}</p>
          ) : null}

          {transcript.data ? (
            <>
              {transcript.data.judgeVerdicts.length > 0 ? (
                <ul className="mb-3 flex flex-col gap-1 text-[var(--text-label-sm)]">
                  {transcript.data.judgeVerdicts.map((verdict) => (
                    <li key={verdict.sessionIndex}>
                      session {verdict.sessionIndex}:{' '}
                      <strong className={verdict.passed === false ? 'text-red-700' : verdict.passed ? 'text-emerald-700' : 'text-amber-700'}>
                        {verdict.judged ? (verdict.passed ? 'pass' : 'fail') : 'ungraded'}
                      </strong>{' '}
                      — {verdict.rationale}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-col gap-3">
                {transcript.data.turns.map((turn) => (
                  <div key={`${turn.sessionIndex}-${turn.turnNumber}`} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                      <span>
                        session {turn.sessionIndex} · turn {turn.turnNumber}
                      </span>
                      {turn.safetyState ? <span className="rounded bg-[var(--color-surface-container-high)] px-1.5">{turn.safetyState}</span> : null}
                      {turn.fallbackUsed ? <span className="text-red-700">fallback</span> : null}
                      {turn.invariantViolations > 0 ? (
                        <span className="text-red-700">{turn.invariantViolations} invariant violation(s)</span>
                      ) : null}
                      <span>{Math.round(turn.latencyMs)} ms</span>
                    </div>
                    <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-1.5 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                      <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">client: </span>
                      {turn.message}
                    </p>
                    <p className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                      <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">agent: </span>
                      {turn.response ?? <em>no reply ({turn.resultType})</em>}
                    </p>
                    {turn.findings.map((finding, index) => (
                      <p
                        key={`${finding.rule}-${index}`}
                        className={`text-[var(--text-label-sm)] ${
                          finding.severity === 'fail' ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        {finding.severity === 'fail' ? '✕' : '⚠'} {finding.rule}: {finding.detail}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
