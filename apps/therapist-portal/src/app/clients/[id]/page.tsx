'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { maskPhone, formatClientLabel } from '@/lib/format';
import { SAFETY_LABELS, type AssignmentState, type SafetyState } from '@okuvu/shared-types';
import { TabStrip } from './_components/TabStrip';
import { ConsentChip } from './_components/ConsentChip';
import { AppointmentsCard } from './_components/AppointmentsCard';

const CARE_PLAN_NAMES: Record<string, string> = {
  CP1: 'Anxiety & Worry',
  CP2: 'Low Mood & Depression',
  CP3: 'Stress & Burnout',
};

// Worker 05 persists summary_text as JSON.stringify(parsed) (the whole
// structured record, not prose) — parse it back for display. Falls back to
// the raw string for any legacy/non-JSON row.
function summaryNarrative(summaryText: string | null | undefined): string {
  if (!summaryText) return '';
  try {
    const parsed = JSON.parse(summaryText) as { narrative_summary?: string };
    return parsed.narrative_summary ?? summaryText;
  } catch {
    return summaryText;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatusBadge({ state }: { state: AssignmentState | null }) {
  if (state === 'confirmed') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-sage-tint text-sage-deep">
        Confirmed
      </span>
    );
  }
  if (state === 'provisional') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-honey-tint text-honey-deep">
        Provisional
      </span>
    );
  }
  return null;
}

function SafetyIndicator({ state }: { state: SafetyState | null }) {
  if (state === 'S0') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-sage-deep" />
        <span className="text-sm text-gray-700">{SAFETY_LABELS.S0} (S0)</span>
      </div>
    );
  }
  if (state === 'S1') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-sage-deep" />
        <span className="text-sm text-gray-700">{SAFETY_LABELS.S1} (S1)</span>
      </div>
    );
  }
  if (state === 'S2') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-honey-deep" />
        <span className="text-sm text-gray-700">{SAFETY_LABELS.S2} (S2)</span>
      </div>
    );
  }
  if (state === 'S3') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-danger" />
        <span className="text-sm font-medium text-danger">{SAFETY_LABELS.S3} (S3)</span>
      </div>
    );
  }
  if (state === 'S4') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-danger" />
        <span className="text-sm font-medium text-danger">{SAFETY_LABELS.S4} (S4)</span>
      </div>
    );
  }
  return <span className="text-sm text-gray-500">None</span>;
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const { data, isLoading, isError } = trpc.clients.detail.useQuery(
    { clientUserId: clientId },
    { enabled: Boolean(clientId) },
  );

  if (isLoading) {
    return (
      <div className="p-4 md:p-8" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading client profile…</span>
        <div className="mx-auto max-w-3xl animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-gray-200" />
          <div className="h-40 rounded-xl bg-gray-200" />
          <div className="h-32 rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-danger bg-danger-tint px-6 py-12 text-center">
            <p role="alert" className="text-sm font-medium text-danger">
              Could not load client details.
            </p>
            <p className="mt-1 text-xs text-danger">Please refresh and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const summaryStatus = data.summary?.status;
  const clientLabel = formatClientLabel(clientId);

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Header breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">{clientLabel}</span>
          </div>

          <h1 className="sr-only">{clientLabel} — Profile</h1>

          <TabStrip clientId={clientId} active="profile" />

          {/* Consent chip — wireframes C-08 */}
          <ConsentChip clientUserId={clientId} consent={data.consent} />

          {/* Appointments — wireframes P-02/P-03/P-04 */}
          <AppointmentsCard clientUserId={clientId} />

          {/* Client overview card */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              CLIENT OVERVIEW
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Phone</span>
                <p className="mt-0.5 font-medium text-gray-900">{maskPhone(data.phoneNumber)}</p>
              </div>
              <div>
                <span className="text-gray-500">Safety state</span>
                <div className="mt-0.5">
                  <SafetyIndicator state={data.safetyState} />
                </div>
              </div>
            </div>
          </div>

          {/* Care plan card */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                CARE PLAN
              </h2>
              <Link
                href={`/clients/${clientId}/program`}
                className="text-sm font-medium text-royal-purple hover:underline"
              >
                View care plan &rarr;
              </Link>
            </div>

            {data.carePlan ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Plan</span>
                  <span className="text-sm font-medium text-gray-900">
                    {CARE_PLAN_NAMES[data.carePlan.care_plan_id] ?? data.carePlan.care_plan_id}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Assignment state</span>
                  <StatusBadge state={data.carePlan.assignment_state} />
                </div>

                {data.careReviewFlagged && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-danger-tint px-3 py-2">
                    <div className="h-2 w-2 rounded-full bg-danger" />
                    <span className="text-xs font-bold text-danger">
                      Care plan may need review — recent sessions seem to diverge from this focus
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No care plan assigned yet.</p>
            )}
          </div>

          {/* Reasoning note card */}
          <details className="group rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline border-l-4 border-l-violet">
            <summary className="cursor-pointer select-none">
              <h2 className="inline text-xs font-bold uppercase tracking-wider text-gray-500">
                Clinical reasoning
              </h2>
            </summary>
            <p className="text-xs text-gray-500 italic mb-3 mt-1">
              Therapist only &mdash; never shown to the client. This is the system&rsquo;s
              onboarding inference.
            </p>
            {data.reasoningNote ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.reasoningNote}</p>
            ) : (
              <p className="text-sm text-gray-500">
                No reasoning note available. A reasoning note is generated during initial
                onboarding if the system has enough data for an inference.
              </p>
            )}
          </details>

          {/* Session summary card */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              LATEST SESSION SUMMARY
            </h2>
            {summaryStatus === 'available' && data.summary?.summary_text ? (
              <div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {summaryNarrative(data.summary.summary_text)}
                </p>
                {data.summary.session_id && (
                  <p className="mt-3 text-xs text-gray-500">
                    Session ID: {data.summary.session_id}
                  </p>
                )}
                <Link
                  href={`/clients/${clientId}/report`}
                  className="mt-3 inline-block text-xs font-medium text-royal-purple hover:underline"
                >
                  View full Session Prep &rarr;
                </Link>
              </div>
            ) : summaryStatus === 'generating' ? (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-honey-deep animate-pulse" />
                <p className="text-sm text-gray-500">Summary is being generated...</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">
                  No session summary available yet. Summaries are generated after each session.
                </p>
                {data.summary?.session_id && (
                  <p className="mt-2 text-xs text-gray-500">
                    Last session: {formatDateTime(data.summary?.session_id)}
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
