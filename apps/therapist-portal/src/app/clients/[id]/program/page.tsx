'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trpc } from '@/trpc/client';
import { formatClientLabel } from '@/lib/format';

const CARE_PLANS = [
  { id: 'CP1' as const, label: 'Anxiety & Worry (CP1)' },
  { id: 'CP2' as const, label: 'Low Mood & Depression (CP2)' },
  { id: 'CP3' as const, label: 'Stress & Burnout (CP3)' },
] as const;

type CarePlan = (typeof CARE_PLANS)[number]['id'];

const CARE_PLAN_NAMES: Record<CarePlan, string> = {
  CP1: 'Anxiety & Worry',
  CP2: 'Low Mood & Depression',
  CP3: 'Stress & Burnout',
};

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusBadge({ state }: { state: string | null }) {
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

export default function ProgramPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const router = useRouter();

  const [selectedCarePlan, setSelectedCarePlan] = useState<CarePlan>('CP1');
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const carePlanQuery = trpc.clients.getCarePlan.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const currentCarePlan = carePlanQuery.data?.care_plan_id ?? 'CP1';
  const assignmentState = carePlanQuery.data?.assignment_state ?? 'provisional';
  const createdAt = carePlanQuery.data?.created_at ?? null;
  const clientLabel = formatClientLabel(clientId);

  useEffect(() => {
    const saved = carePlanQuery.data?.care_plan_id;
    if (saved === 'CP1' || saved === 'CP2' || saved === 'CP3') {
      setSelectedCarePlan(saved);
    }
  }, [carePlanQuery.data?.care_plan_id]);

  const setCarePlan = trpc.clients.setCarePlan.useMutation({
    onSuccess: async () => {
      setPendingConfirm(false);
      setErrorMessage(null);
      await carePlanQuery.refetch();
      setSuccessMessage('Care plan saved.');
      setTimeout(() => router.push(`/clients/${clientId}`), 1200);
    },
    onError: (error) => {
      setPendingConfirm(false);
      setSuccessMessage(null);
      setErrorMessage(error.message ?? 'Failed to save care plan. Please try again.');
    },
  });

  const hasChanged = selectedCarePlan !== currentCarePlan;

  function handleSaveClick() {
    setErrorMessage(null);
    // F-06: this changes which clinical track the AI companion follows for
    // the client — require an explicit confirmation before it commits.
    setPendingConfirm(true);
  }

  function handleConfirm() {
    if (!clientId) return;
    setCarePlan.mutate({ clientId, carePlanId: selectedCarePlan });
  }

  if (carePlanQuery.isLoading) {
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

  if (carePlanQuery.isError) {
    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-danger bg-danger-tint px-6 py-12 text-center">
            <p role="alert" className="text-sm font-medium text-danger">
              Could not load this client&rsquo;s care plan.
            </p>
            <p className="mt-1 text-xs text-danger">Please refresh and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-violet transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-violet transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Program OKUVU</span>
          </div>

          {/* Current care plan */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              CURRENT CARE PLAN
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-sm font-semibold text-gray-900">
                  {CARE_PLAN_NAMES[currentCarePlan]}
                </span>
                <span className="text-xs text-gray-500">
                  {createdAt ? `Assigned on ${formatDate(createdAt)}` : ''}
                </span>
              </div>
              <StatusBadge state={assignmentState} />
            </div>
          </div>

          {/* Change care plan */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Change care plan
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Select a new primary care plan for this client. This will update their active clinical track.
            </p>

            <label htmlFor="care-plan-select" className="sr-only">
              Select care plan
            </label>
            <select
              id="care-plan-select"
              value={selectedCarePlan}
              onChange={(e) => {
                setSelectedCarePlan(e.target.value as CarePlan);
                setPendingConfirm(false);
              }}
              disabled={setCarePlan.isPending}
              className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {CARE_PLANS.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.label}
                </option>
              ))}
            </select>

            {pendingConfirm ? (
              <div className="rounded-lg border border-violet/30 bg-violet/5 p-4">
                <p className="text-sm text-gray-800">
                  Change this client&rsquo;s care plan to <strong>{CARE_PLAN_NAMES[selectedCarePlan]}</strong>?
                  The AI companion will follow this track starting with their next session.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingConfirm(false)}
                    disabled={setCarePlan.isPending}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={setCarePlan.isPending}
                    className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {setCarePlan.isPending ? 'Saving...' : 'Confirm change'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/clients/${clientId}`)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={!hasChanged}
                  className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save care plan
                </button>
              </div>
            )}

            {successMessage && (
              <p role="status" aria-live="polite" className="mt-4 rounded-lg bg-sage-tint p-3 text-sm text-sage-deep text-center">
                {successMessage}
              </p>
            )}
            {errorMessage && (
              <p role="alert" aria-live="assertive" className="mt-4 rounded-lg bg-danger-tint p-3 text-sm text-danger text-center">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Notice */}
          <div className="rounded-xl bg-oat-elevated p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline border-l-4 border-l-violet">
            <p className="text-sm text-gray-500 leading-relaxed">
              Therapist notes you write in Session Notes are not used by OKUVU. To configure what OKUVU
              focuses on, use this care plan selector.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
