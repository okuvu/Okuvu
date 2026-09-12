'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { formatClientLabel } from '@/lib/format';

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

  const clientLabel = formatClientLabel(clientId);

  return (
    <div className="min-h-screen bg-[#F4F6F8]">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-[#1A6B5A] transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-[#1A6B5A] transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Report</span>
          </div>

          {/* Session Prep */}
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              SESSION PREP
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Digest of chat-thread summaries from the last 30 days — review before your next
              session.
            </p>

            {sessionPrepQuery.isLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-16 rounded-lg bg-gray-100" />
                <div className="h-16 rounded-lg bg-gray-100" />
              </div>
            ) : sessionPrepQuery.data && !sessionPrepQuery.data.granted ? (
              <div className="rounded-lg bg-amber-50 p-4 text-center">
                <p className="text-sm text-amber-800">Client hasn&rsquo;t granted chat access yet.</p>
                <p className="mt-1 text-xs text-amber-700">
                  Session Prep data becomes available once the client opts in.
                </p>
              </div>
            ) : sessionPrepQuery.data && sessionPrepQuery.data.entries.length > 0 ? (
              <div className="space-y-3">
                {sessionPrepQuery.data.entries.map((entry) => (
                  <div key={entry.sessionId} className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                    <p className="text-xs text-gray-400 mb-1">{formatDate(entry.date)}</p>
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
              <p className="py-6 text-center text-sm text-gray-400 italic">
                No session summaries in the last 30 days.
              </p>
            )}
          </div>

          {/* Report Card */}
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              REPORT CARD
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Homework progress and mood trend, permission-gated on the client&rsquo;s chat-access
              consent.
            </p>

            {reportCardQuery.isLoading ? (
              <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
            ) : reportCardQuery.data && !reportCardQuery.data.granted ? (
              <div className="rounded-lg bg-amber-50 p-4 text-center">
                <p className="text-sm text-amber-800">Client hasn&rsquo;t granted chat access yet.</p>
                <p className="mt-1 text-xs text-amber-700">
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
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-[#E8F5EE] text-[#2D8A5E]">
                        Closure offered
                      </span>
                    )}
                    {reportCardQuery.data.signals.frustrationEventCount > 0 && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-[#FEF3E2] text-[#E8A020]">
                        Frustration flagged &times;{reportCardQuery.data.signals.frustrationEventCount}
                      </span>
                    )}
                    {reportCardQuery.data.signals.therapistReferralRecently && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-[#FDF2F1] text-[#C0392B]">
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
                          className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#E8F5EE] text-[10px] font-medium text-[#2D8A5E]"
                        >
                          {point.moodValue}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No mood check-ins in the last 30 days.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
