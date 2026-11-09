'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { useClientHeader } from '../_components/useClientHeader';
import { TabStrip } from '../_components/TabStrip';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClientReportPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const sessionPrepQuery = trpc.reportCard.sessionPrep.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );
  const reportCardQuery = trpc.reportCard.reportCard.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const { label: clientLabel, code: clientCode } = useClientHeader(clientId);

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-royal-purple transition-colors">
              {clientLabel}
            </Link>
            {clientCode && (
              <span className="font-mono text-xs tracking-wide text-gray-500">{clientCode}</span>
            )}
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Report</span>
          </div>

          <h1 className="sr-only">{clientLabel} — Session Prep &amp; Report Card</h1>

          <TabStrip clientId={clientId} active="report" />

          {/* Session Prep */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              SESSION PREP
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              What has happened since the last session. The chat digest keeps the client&rsquo;s
              approval and its 30-day window; what they shared is here because they shared it.
            </p>

            {sessionPrepQuery.data && (
              <div className="mb-4 rounded-lg bg-gray-50 p-4 border border-gray-100">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Since last session</h3>
                  <span className="text-xs text-gray-500">
                    since {formatDate(sessionPrepQuery.data.since)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-gray-700">
                  {sessionPrepQuery.data.shared.total === 0
                    ? 'Nothing shared in this period.'
                    : `${sessionPrepQuery.data.shared.total} shared: ${sessionPrepQuery.data.shared.journal} journal, ${sessionPrepQuery.data.shared.worksheets} worksheet ${sessionPrepQuery.data.shared.worksheets === 1 ? 'entry' : 'entries'}, ${sessionPrepQuery.data.shared.notes} Treasure Box ${sessionPrepQuery.data.shared.notes === 1 ? 'note' : 'notes'}.`}
                </p>

                {sessionPrepQuery.data.shared.items.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {sessionPrepQuery.data.shared.items.map((item, i) => (
                      <li key={`${item.kind}-${item.at}-${i}`} className="text-sm text-gray-700">
                        {formatDate(item.at)} · {item.title}
                      </li>
                    ))}
                  </ul>
                )}

                {sessionPrepQuery.data.assignments.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500">Assignments</p>
                    <ul className="mt-1 space-y-0.5">
                      {sessionPrepQuery.data.assignments.map((assignment, i) => (
                        <li key={i} className="text-sm text-gray-700">
                          {assignment.done ? 'Done' : 'Not done'} · {assignment.label}
                          {assignment.repeating && ' (repeats)'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sessionPrepQuery.data.bringToSession && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500">
                      What they want to bring to session
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                      {sessionPrepQuery.data.bringToSession}
                    </p>
                  </div>
                )}
              </div>
            )}

            {sessionPrepQuery.isLoading ? (
              <div className="space-y-3 animate-pulse" role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">Loading session prep…</span>
                <div className="h-16 rounded-lg bg-gray-100" />
                <div className="h-16 rounded-lg bg-gray-100" />
              </div>
            ) : sessionPrepQuery.data && !sessionPrepQuery.data.chatGranted ? (
              <div className="rounded-lg bg-honey-tint p-4 text-center">
                <p className="text-sm text-honey-deep">Client hasn&rsquo;t granted chat access yet.</p>
                <p className="mt-1 text-xs text-honey-deep">
                  Chat summaries appear here once the client opts in. Anything shown above is there
                  because the client shared it.
                </p>
              </div>
            ) : sessionPrepQuery.data && sessionPrepQuery.data.entries.length > 0 ? (
              <div className="space-y-3">
                {sessionPrepQuery.data.entries.map((entry) => (
                  <div key={entry.sessionId} className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">{formatDate(entry.date)}</p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {entry.narrativeSummary ?? 'No narrative available.'}
                    </p>
                    {entry.themes.length > 0 && (
                      <p className="mt-2 text-xs text-gray-500">Themes: {entry.themes.join(', ')}</p>
                    )}
                    {entry.openLoops.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        Open loops: {entry.openLoops.join('; ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-gray-500 italic">
                No session summaries in the last 30 days.
              </p>
            )}
          </div>

          {/* Report Card */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              REPORT CARD
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Homework progress and mood trend, permission-gated on the client&rsquo;s chat-access
              consent.
            </p>

            {reportCardQuery.isLoading ? (
              <div className="h-24 rounded-lg bg-gray-100 animate-pulse" role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">Loading report card…</span>
              </div>
            ) : reportCardQuery.data && !reportCardQuery.data.granted ? (
              <div className="rounded-lg bg-honey-tint p-4 text-center">
                <p className="text-sm text-honey-deep">Client hasn&rsquo;t granted chat access yet.</p>
                <p className="mt-1 text-xs text-honey-deep">
                  Report Card data becomes available once the client opts in.
                </p>
              </div>
            ) : reportCardQuery.data ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Signals (last 30 days &mdash; from the client&rsquo;s chat, not therapist-reported)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700">
                      Taper state: {reportCardQuery.data.signals.latestTaperState}
                    </span>
                    {reportCardQuery.data.signals.closureOfferedRecently && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-sage-tint text-sage-deep">
                        Closure offered
                      </span>
                    )}
                    {reportCardQuery.data.signals.frustrationEventCount > 0 && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-honey-tint text-honey-deep">
                        Frustration flagged &times;{reportCardQuery.data.signals.frustrationEventCount}
                      </span>
                    )}
                    {reportCardQuery.data.signals.therapistReferralRecently && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-danger-tint text-danger">
                        Therapist referral suggested
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Homework assigned / completed</span>
                  <span className="font-medium text-gray-900">
                    {reportCardQuery.data.homeworkCounts.active +
                      reportCardQuery.data.homeworkCounts.completed}{' '}
                    / {reportCardQuery.data.homeworkCounts.completed}
                  </span>
                </div>

                {reportCardQuery.data.homeworkTrack.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Homework track</p>
                    <ul className="space-y-1">
                      {reportCardQuery.data.homeworkTrack.map((entry, i) => (
                        <li key={i} className="text-sm text-gray-700">
                          {entry}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {reportCardQuery.data.moodTrend.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Mood trend (30 days)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {reportCardQuery.data.moodTrend.map((point) => (
                        <span
                          key={point.date}
                          title={`${formatDate(point.date)}: ${point.moodValue}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded bg-sage-tint text-[10px] font-medium text-sage-deep"
                        >
                          {point.moodValue}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No mood check-ins in the last 30 days.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
