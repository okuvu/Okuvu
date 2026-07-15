"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trpc } from "@/trpc/client";

const CARE_PLANS = [
  { id: "CP1" as const, label: "Anxiety & Worry (CP1)" },
  { id: "CP2" as const, label: "Low Mood & Depression (CP2)" },
  { id: "CP3" as const, label: "Stress & Burnout (CP3)" },
] as const;

type CarePlan = (typeof CARE_PLANS)[number]["id"];

const CARE_PLAN_NAMES: Record<CarePlan, string> = {
  CP1: "Anxiety & Worry",
  CP2: "Low Mood & Depression",
  CP3: "Stress & Burnout",
};

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AssignmentBadge({ state }: { state: string | null }) {
  if (state === "confirmed") {
    return (
      <span className="inline-flex items-center justify-center px-2 py-1 rounded font-status-pill text-status-pill border border-[#2D8A5E] bg-[#E8F5EE] text-[#2D8A5E]">
        Confirmed by therapist
      </span>
    );
  }

  if (state === "provisional") {
    return (
      <span className="inline-flex items-center justify-center px-2 py-1 rounded font-status-pill text-status-pill border border-[#E8A020] bg-[#FEF3E2] text-[#E8A020]">
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

  const [selectedCarePlan, setSelectedCarePlan] = useState<CarePlan>("CP1");
  const [showToast, setShowToast] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const carePlanQuery = trpc.clients.getCarePlan.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const currentCarePlan = carePlanQuery.data?.care_plan_id ?? "CP1";
  const assignmentState = carePlanQuery.data?.assignment_state ?? "provisional";
  const createdAt = carePlanQuery.data?.created_at ?? null;

  useEffect(() => {
    const saved = carePlanQuery.data?.care_plan_id;
    if (saved === "CP1" || saved === "CP2" || saved === "CP3") {
      setSelectedCarePlan(saved);
    }
  }, [carePlanQuery.data?.care_plan_id]);

  const setCarePlan = trpc.clients.setCarePlan.useMutation({
    onSuccess: async () => {
      setErrorToast(null);
      await carePlanQuery.refetch();
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    },
    onError: (error) => {
      setShowToast(false);
      setErrorToast(error.message ?? "Failed to save care plan. Please try again.");
      setTimeout(() => setErrorToast(null), 5000);
    },
  });

  function handleSave() {
    if (!clientId) return;
    setCarePlan.mutate({ clientId, carePlanId: selectedCarePlan });
  }

  const userLabel = `User #${clientId.slice(-4)}`;

  if (carePlanQuery.isLoading) {
    return (
      <main className="bg-surface min-h-screen text-on-surface antialiased">
        <div className="flex-1 overflow-y-auto p-margin_mobile md:p-margin_desktop flex justify-center">
          <div className="w-full max-w-[720px] animate-pulse space-y-4">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-40 rounded-xl bg-gray-200" />
            <div className="h-32 rounded-xl bg-gray-200" />
          </div>
        </div>
      </main>
    );
  }

  if (carePlanQuery.isError) {
    return (
      <main className="bg-surface min-h-screen text-on-surface antialiased">
        <div className="flex-1 overflow-y-auto p-margin_mobile md:p-margin_desktop flex justify-center">
          <div className="w-full max-w-[720px] bg-surface-container-lowest rounded-xl border border-outline-variant p-lg">
            <h1 className="font-display-title text-display-title text-on-surface">
              Program Evia
            </h1>
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              Could not load this client&rsquo;s care plan. Please refresh and
              try again.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-surface text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container">
      {/* Header */}
      <header className="bg-surface sticky top-0 z-40 border-b border-outline-variant flex justify-between items-center px-lg py-md shadow-sm">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            spa
          </span>
          <span className="font-display-title text-display-title text-primary">
            Therapist Portal
          </span>
        </div>

        <nav className="hidden md:flex items-center space-x-2 font-label-sm text-label-sm text-on-surface-variant">
          <Link
            className="hover:text-primary transition-colors"
            href="/"
          >
            Dashboard
          </Link>
          <span className="material-symbols-outlined text-[16px]">
            chevron_right
          </span>
          <Link
            className="hover:text-primary transition-colors"
            href={`/clients/${clientId}`}
          >
            {userLabel}
          </Link>
          <span className="material-symbols-outlined text-[16px]">
            chevron_right
          </span>
          <span className="text-on-surface font-semibold">Program Evia</span>
        </nav>

        <div className="flex items-center space-x-4">
          <button
            className="text-on-surface-variant hover:text-primary transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button
            className="text-on-surface-variant hover:text-primary transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div className="h-8 w-8 rounded-full bg-surface-variant flex items-center justify-center overflow-hidden border border-outline-variant">
            <span className="text-xs font-medium text-on-surface-variant">T</span>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-margin_mobile md:p-margin_desktop flex justify-center">
        <div className="w-full max-w-[720px] flex flex-col gap-lg">
          {/* Page Title */}
          <div className="flex items-center justify-between">
            <h1 className="font-display-title text-display-title text-on-surface">
              Program Evia
            </h1>
            <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-1 rounded">
              {userLabel}
            </span>
          </div>

          {/* Main Card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant overflow-hidden">
            {/* Current Care Plan Section */}
            <div className="p-md md:p-lg border-b border-[#EEEEEE]">
              <h2 className="font-section-header text-section-header text-on-surface mb-md">
                CURRENT CARE PLAN
              </h2>

              <div className="flex items-center justify-between bg-surface p-4 rounded-lg border border-outline-variant">
                <div>
                  <span className="font-body-main text-body-main font-semibold text-on-surface block">
                    {CARE_PLAN_NAMES[currentCarePlan]}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {createdAt ? `Assigned on ${formatDate(createdAt)}` : ""}
                  </span>
                </div>
                <AssignmentBadge state={assignmentState} />
              </div>
            </div>

            {/* Change Care Plan Section */}
            <div className="p-md md:p-lg bg-surface-bright">
              <h3 className="font-section-header text-section-header text-on-surface mb-sm">
                Change care plan
              </h3>
              <p className="font-body-main text-body-main text-on-surface-variant mb-md">
                Select a new primary care plan for this patient. This will
                update their active clinical track.
              </p>

              <div className="mb-lg relative">
                <label className="sr-only" htmlFor="care-plan-select">
                  Select Care Plan
                </label>
                <select
                  id="care-plan-select"
                  value={selectedCarePlan}
                  onChange={(e) =>
                    setSelectedCarePlan(e.target.value as CarePlan)
                  }
                  disabled={setCarePlan.isPending}
                  className="block w-full h-[44px] rounded-lg border-outline-variant bg-surface-container-lowest pl-4 pr-10 font-body-main text-body-main text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {CARE_PLANS.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <span className="material-symbols-outlined text-outline">
                    expand_more
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/clients/${clientId}`)}
                  className="bg-surface-container hover:bg-surface-variant text-on-surface font-label-sm text-label-sm px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 border border-outline-variant disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={setCarePlan.isPending || !clientId}
                  className="bg-primary-container hover:bg-primary text-on-primary font-label-sm text-label-sm px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    save
                  </span>
                  {setCarePlan.isPending ? "Saving..." : "Save care plan"}
                </button>
              </div>
            </div>
          </div>

          {/* Notice Box */}
          <div className="border-l-[3px] border-[#1A6B5A] bg-[#F4F6F8] rounded-lg p-4">
            <p className="font-body-main text-body-main text-sm text-[#5A6472] leading-relaxed">
              Therapist notes you write in Session Notes are not used by Evia.
              To configure what Evia focuses on, use this care plan selector.
            </p>
          </div>
        </div>
      </div>

      {/* Error Toast */}
      {errorToast && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 bg-red-50 border border-red-400 px-5 py-3 shadow-lg rounded-lg flex items-center gap-2 z-50"
          style={{
            animation: "fadeInSlideDown 0.3s ease-out",
          }}
        >
          <span className="text-sm font-semibold text-red-800">
            {errorToast}
          </span>
        </div>
      )}

      {/* Toast (Frame 2 — post-save) */}
      {showToast && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#E8F5EE] border border-[#2D8A5E] px-5 py-3 shadow-lg rounded-lg flex items-center gap-2 z-50"
          style={{
            animation: "fadeInSlideDown 0.3s ease-out",
          }}
        >
          <span className="text-sm font-semibold text-[#2D8A5E]">
            ✓ Care plan saved
          </span>
        </div>
      )}

      <style>{`
        @keyframes fadeInSlideDown {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
