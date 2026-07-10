"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/trpc/client";

const CARE_PLANS = ["CP1", "CP2", "CP3"] as const;

type CarePlan = (typeof CARE_PLANS)[number];

export default function ProgramPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [selectedCarePlan, setSelectedCarePlan] = useState<CarePlan>("CP1");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const carePlanQuery = trpc.clients.getCarePlan.useQuery(
    { clientId },
    { enabled: Boolean(clientId) }
  );

  const currentCarePlan = carePlanQuery.data?.care_plan_id ?? "CP1";

  useEffect(() => {
    const savedCarePlan = carePlanQuery.data?.care_plan_id;

    if (
      savedCarePlan === "CP1" ||
      savedCarePlan === "CP2" ||
      savedCarePlan === "CP3"
    ) {
      setSelectedCarePlan(savedCarePlan);
    }
  }, [carePlanQuery.data?.care_plan_id]);

  const setCarePlan = trpc.clients.setCarePlan.useMutation({
    onSuccess: async (data) => {
      setMessage(`Care plan saved successfully: ${data.care_plan_id}.`);
      setError(null);
      setSelectedCarePlan(data.care_plan_id as CarePlan);
      await carePlanQuery.refetch();
    },
    onError: (mutationError) => {
      setMessage(null);
      setError(
        mutationError.message ||
          "Could not save the care plan. Please try again."
      );
    },
  });

  function handleSave() {
    if (!clientId) return;

    setMessage(null);
    setError(null);

    setCarePlan.mutate({
      clientId,
      carePlanId: selectedCarePlan,
    });
  }

  if (carePlanQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">Loading client care plan...</p>
      </main>
    );
  }

  if (carePlanQuery.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <section className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Program Evia
          </h1>

          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            Could not load this client’s care plan. Please refresh and try
            again.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-medium text-teal-700">Program Evia</p>

        <h1 className="text-2xl font-semibold text-gray-900">
          Set client care plan
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Current care plan:{" "}
          <span className="font-medium text-gray-900">{currentCarePlan}</span>
        </p>

        <div className="mt-8">
          <label
            htmlFor="care-plan"
            className="mb-2 block text-sm font-medium text-gray-800"
          >
            Care plan
          </label>

          <select
            id="care-plan"
            value={selectedCarePlan}
            onChange={(event) =>
              setSelectedCarePlan(event.target.value as CarePlan)
            }
            disabled={setCarePlan.isPending}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-teal-600"
          >
            {CARE_PLANS.map((carePlan) => (
              <option key={carePlan} value={carePlan}>
                {carePlan}
              </option>
            ))}
          </select>
        </div>

        {selectedCarePlan === currentCarePlan && !message && (
          <p className="mt-3 text-sm text-gray-500">
            This is already the client’s active care plan.
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={setCarePlan.isPending || !clientId}
          className="mt-6 w-full rounded-lg bg-teal-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {setCarePlan.isPending ? "Saving..." : "Save care plan"}
        </button>

        {message && (
          <p
            role="status"
            aria-live="polite"
            className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800"
          >
            {message}
          </p>
        )}

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
      </section>
    </main>
  );
}