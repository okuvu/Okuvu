import Link from 'next/link';
import type { ClientListItem, SafetyState } from '@evia/shared-types';
import { maskPhone } from '@/lib/format';

function formatLastSession(iso: string | null): string {
  if (!iso) return '\u2014';
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const CARE_PLAN_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  CP1: { label: 'Anxiety & Worry', bg: 'bg-[#E8F5EE]', text: 'text-[#2D8A5E]' },
  CP2: { label: 'Low Mood', bg: 'bg-[#EEF2FF]', text: 'text-[#4B6BFF]' },
  CP3: { label: 'Stress & Burnout', bg: 'bg-[#FEF9E7]', text: 'text-[#B7950B]' },
};

function CarePlanBadge({ carePlanId }: { carePlanId: string }) {
  const plan = CARE_PLAN_STYLES[carePlanId];
  if (!plan) return <span className="text-sm text-gray-400">\u2014</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${plan.bg} ${plan.text}`}>
      {plan.label}
    </span>
  );
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  provisional: { label: 'Provisional', bg: 'bg-[#FEF3E2]', text: 'text-[#E8A020]' },
  confirmed: { label: 'Confirmed', bg: 'bg-[#E8F5EE]', text: 'text-[#2D8A5E]' },
};

function StatusBadge({ state }: { state: string }) {
  const style = STATUS_STYLES[state];
  if (!style) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function SafetyIndicator({
  state,
  isReviewRequired,
}: {
  state: SafetyState | null;
  isReviewRequired?: boolean;
}) {
  if (isReviewRequired) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-[#C0392B]" />
        <span className="text-[11px] font-bold text-[#C0392B]">Review required</span>
      </div>
    );
  }

  if (state === 'S2') {
    return <div className="mx-auto h-2 w-2 rounded-full bg-[#E8A020]" />;
  }

  if (state === 'S3' || state === 'S4') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-[#C0392B]" />
        <span className="text-[11px] font-bold text-[#C0392B]">Review</span>
      </div>
    );
  }

  return null;
}

export function ClientTable({ clients }: { clients: ClientListItem[] }) {
  if (clients.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Active clients</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-base italic text-gray-500">No clients assigned yet.</p>
          <p className="mt-1 text-sm text-gray-400">Clients assigned to you will appear here.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Active clients</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Client
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Care Plan
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Last Session
              </th>
              <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Safety
              </th>
              <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, index) => {
              const isSafetyReview = client.safetyState === 'S3' || client.safetyState === 'S4';
              return (
                <tr
                  key={client.id}
                  className={`border-b border-gray-100 transition-colors last:border-b-0 ${
                    isSafetyReview
                      ? 'border-l-[3px] border-l-[#C0392B] bg-[#FDF2F1] hover:bg-[#FDF2F1]'
                      : index % 2 === 0
                        ? 'bg-white hover:bg-[#F0F7F4]'
                        : 'bg-[#F9FAFB] hover:bg-[#F0F7F4]'
                  }`}
                >
                  <td className="px-6 py-3.5 text-sm font-medium text-gray-900">
                    <Link href={`/clients/${client.id}`} className="hover:underline">
                      {maskPhone(client.phoneNumber)}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5">
                    {client.carePlan ? (
                      <CarePlanBadge carePlanId={client.carePlan.care_plan_id} />
                    ) : (
                      <span className="text-sm text-gray-400">\u2014</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    {client.carePlan ? (
                      <StatusBadge state={client.carePlan.assignment_state} />
                    ) : (
                      <span className="text-sm text-gray-400">\u2014</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-sm text-gray-500">
                    {formatLastSession(client.lastSessionDate)}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <SafetyIndicator
                      state={client.safetyState}
                      isReviewRequired={isSafetyReview}
                    />
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <Link
                      href={`/clients/${client.id}`}
                      className="text-sm font-medium text-[#1A6B5A] hover:underline"
                    >
                      View &rarr;
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
