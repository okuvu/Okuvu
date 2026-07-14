"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/trpc/client";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `••• ••• ${digits.slice(-4)}`;
}

function AssignmentBadge({ state }: { state: string | null }) {
  if (state === "confirmed") {
    return (
      <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-600/20">
        Confirmed
      </span>
    );
  }

  if (state === "provisional") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
        Provisional
      </span>
    );
  }

  return null;
}

function SafetyBadge({ state }: { state: string | null }) {
  if (!state) return null;

  const colors: Record<string, string> = {
    S0: "bg-green-50 text-green-800 ring-green-600/20",
    S1: "bg-blue-50 text-blue-800 ring-blue-600/20",
    S2: "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
    S3: "bg-orange-50 text-orange-800 ring-orange-600/20",
    S4: "bg-red-50 text-red-800 ring-red-600/20",
  };

  const colorClass = colors[state] ?? "bg-gray-50 text-gray-800 ring-gray-600/20";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${colorClass}`}
    >
      {state}
    </span>
  );
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const detailQuery = trpc.clients.detail.useQuery(
    { clientUserId: clientId },
    { enabled: Boolean(clientId) },
  );

  if (detailQuery.isLoading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl bg-gray-50 px-6 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-gray-200" />
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="mt-8 h-40 rounded-lg bg-gray-200" />
          <div className="h-32 rounded-lg bg-gray-200" />
          <div className="h-24 rounded-lg bg-gray-200" />
        </div>
      </main>
    );
  }

  if (detailQuery.isError) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl bg-gray-50 px-6 py-10">
        <section className="rounded-xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Client Overview
          </h1>
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {detailQuery.error.message === "Client is not assigned to this therapist"
              ? "You are not assigned to this client."
              : "Could not load client details. Please try again."}
          </p>
          <button
            type="button"
            onClick={() => detailQuery.refetch()}
            className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            Retry
          </button>
        </section>
      </main>
    );
  }

  const client = detailQuery.data;

  if (!client) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl bg-gray-50 px-6 py-10">
        <section className="rounded-xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Client not found
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            This client does not exist or has been removed.
          </p>
        </section>
      </main>
    );
  }

  const summaryAvailable = client.summary?.status === "available";

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-gray-50 px-6 py-10">
      {/* Header */}
      <header className="mb-8">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          Client Overview
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">
          {maskPhone(client.phoneNumber)}
        </h1>
      </header>

      <div className="space-y-6">
        {/* Care Plan */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">Care Plan</h2>
            <AssignmentBadge state={client.carePlan?.assignment_state ?? null} />
          </div>

          {client.carePlan ? (
            <p className="mt-3 text-lg font-semibold text-gray-900">
              {client.carePlan.care_plan_id}
            </p>
          ) : (
            <p className="mt-3 text-sm text-gray-500">Not assigned</p>
          )}

          <div className="mt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Reasoning
            </h3>
            <p className="mt-1 text-sm text-gray-700">
              {client.reasoningNote ?? (
                <span className="italic text-gray-400">
                  No reasoning note available
                </span>
              )}
            </p>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-4">
            <Link
              href={`/clients/${clientId}/program`}
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              Change care plan &rarr;
            </Link>
          </div>
        </section>

        {/* Session Summary */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700">
            Most Recent Session Summary
          </h2>

          {summaryAvailable ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm leading-relaxed text-gray-900">
                {client.summary?.summary_text ?? "No summary text available."}
              </p>
              {client.summary?.session_id && (
                <p className="text-xs text-gray-400">
                  Session ID: {client.summary.session_id}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-lg bg-gray-50 px-4 py-5 text-center">
              <p className="text-sm font-medium text-gray-900">
                Not yet available
              </p>
              <p className="mt-1 text-xs text-gray-500">
                A session summary will appear here once the client completes a
                session and it has been processed.
              </p>
            </div>
          )}
        </section>

        {/* Safety State */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">
              Safety State
            </h2>
            <SafetyBadge state={client.safetyState} />
          </div>

          <p className="mt-3 text-sm text-gray-500">
            {client.safetyState
              ? `Current safety assessment: ${client.safetyState}`
              : "No safety assessment available for this client."}
          </p>
        </section>

        {/* Navigation */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700">Actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href={`/clients/${clientId}/program`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              Program Evia — care plan
            </Link>
            <Link
              href={`/clients/${clientId}/notes`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              Session notes
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
