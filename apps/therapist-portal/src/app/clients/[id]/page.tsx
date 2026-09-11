'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { maskPhone, formatClientLabel } from '@/lib/format';
import { SAFETY_LABELS, type AssignmentState, type SafetyState } from '@okuvu/shared-types';

const CARE_PLAN_NAMES: Record<string, string> = {
  CP1: 'Anxiety & Worry',
  CP2: 'Low Mood & Depression',
  CP3: 'Stress & Burnout',
};

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
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-[#E8F5EE] text-[#2D8A5E]">
        Confirmed
      </span>
    );
  }
  if (state === 'provisional') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-[#FEF3E2] text-[#E8A020]">
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
        <div className="h-2 w-2 rounded-full bg-[#2D8A5E]" />
        <span className="text-sm text-gray-700">{SAFETY_LABELS.S0} (S0)</span>
      </div>
    );
  }
  if (state === 'S1') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-[#2D8A5E]" />
        <span className="text-sm text-gray-700">{SAFETY_LABELS.S1} (S1)</span>
      </div>
    );
  }
  if (state === 'S2') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-[#E8A020]" />
        <span className="text-sm text-gray-700">{SAFETY_LABELS.S2} (S2)</span>
      </div>
    );
  }
  if (state === 'S3') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-[#C0392B]" />
        <span className="text-sm font-medium text-[#C0392B]">{SAFETY_LABELS.S3} (S3)</span>
      </div>
    );
  }
  if (state === 'S4') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-[#C0392B]" />
        <span className="text-sm font-medium text-[#C0392B]">{SAFETY_LABELS.S4} (S4)</span>
      </div>
    );
  }
  return <span className="text-sm text-gray-400">None</span>;
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
      <div className="p-4 md:p-8">
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
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
            <p role="alert" className="text-sm font-medium text-red-800">
              Could not load client details.
            </p>
            <p className="mt-1 text-xs text-red-600">Please refresh and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const isProvisional = data.carePlan?.assignment_state === 'provisional';
  const isConfirmed = data.carePlan?.assignment_state === 'confirmed';
  const summaryStatus = data.summary?.status;
  const clientLabel = formatClientLabel(clientId);

  return (
    <div className="min-h-screen bg-[#F4F6F8]">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Header breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-[#1A6B5A] transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">{clientLabel}</span>
          </div>

          {/* Client overview card */}
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
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
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                CARE PLAN
              </h2>
              <Link
                href={`/clients/${clientId}/program`}
                className="text-sm font-medium text-[#1A6B5A] hover:underline"
              >
                Manage &rarr;
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

                {data.carePlan.assignment_state && (
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 transition-colors select-none">
                      What does {data.carePlan.assignment_state} mean?
                    </summary>
                    {isProvisional && (
                      <p className="mt-2 text-xs text-gray-500 leading-relaxed bg-amber-50 rounded-lg p-3">
                        A provisional assignment means the system has suggested this care plan based on
                        initial interactions, but it has not yet been reviewed and confirmed by a
                        therapist. You should review the care plan and confirm it once you are satisfied.
                      </p>
                    )}
                    {isConfirmed && (
                      <p className="mt-2 text-xs text-gray-500 leading-relaxed bg-green-50 rounded-lg p-3">
                        A confirmed assignment means this care plan has been reviewed and set by a
                        therapist. The system will not change it automatically.
                      </p>
                    )}
                  </details>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No care plan assigned yet.</p>
            )}
          </div>

          {/* Reasoning note card */}
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200 border-l-4 border-l-[#1A6B5A]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Clinical reasoning
            </h2>
            <p className="text-xs text-gray-400 italic mb-3">
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
          </div>

          {/* Session summary card */}
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              LATEST SESSION SUMMARY
            </h2>
            {summaryStatus === 'available' && data.summary?.summary_text ? (
              <div>
                <p className="text-sm text-gray-700 leading-relaxed">{data.summary.summary_text}</p>
                {data.summary.session_id && (
                  <p className="mt-3 text-xs text-gray-400">
                    Session ID: {data.summary.session_id}
                  </p>
                )}
              </div>
            ) : summaryStatus === 'generating' ? (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#E8A020] animate-pulse" />
                <p className="text-sm text-gray-500">Summary is being generated...</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">
                  No session summary available yet. Summaries are generated after each session.
                </p>
                {data.summary?.session_id && (
                  <p className="mt-2 text-xs text-gray-400">
                    Last session: {formatDateTime(data.summary?.session_id)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Homework link */}
          <Link
            href={`/clients/${clientId}/homework`}
            className="block rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200 hover:shadow-md transition text-center"
          >
            <span className="text-sm font-medium text-[#1A6B5A]">
              View and assign homework &rarr;
            </span>
            <p className="mt-1 text-xs text-gray-500">
              Assigned homework appears in the client&rsquo;s chat context.
            </p>
          </Link>

          {/* Session notes link */}
          <Link
            href={`/clients/${clientId}/notes`}
            className="block rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200 hover:shadow-md transition text-center"
          >
            <span className="text-sm font-medium text-[#1A6B5A]">
              View and add session notes &rarr;
            </span>
            <p className="mt-1 text-xs text-gray-500">
              Notes are private and never read by the AI.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
