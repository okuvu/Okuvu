'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/trpc/client';
import { useEnvironment } from '@/lib/environment-context';
import CostEstimatorCard from '@/app/components/CostEstimatorCard';
import TraceViewer from '@/app/components/TraceViewer';
import SamplingConfigForm, {
  DEFAULT_SAMPLING_FORM_STATE,
  type SamplingFormState,
} from './SamplingConfigForm';
import SamplingProgress from './SamplingProgress';
import ResultsPanel from './ResultsPanel';

function parseInputJson(raw: string): { value: Record<string, unknown> | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { value: {}, error: null };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: 'Input must be a JSON object, e.g. {"message": "hi"}' };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

export default function SamplingConsole() {
  const { environment } = useEnvironment();
  const [form, setForm] = useState<SamplingFormState>(DEFAULT_SAMPLING_FORM_STATE);

  const { value: parsedInput, error: inputJsonError } = useMemo(
    () => parseInputJson(form.inputJson),
    [form.inputJson],
  );

  const nError = form.n < 200 ? 'n must be at least 200 for a statistically meaningful Wilson CI' : null;
  const targetMetricError = form.targetMetric.trim() === '' ? 'Target metric is required' : null;
  const thresholdError =
    form.threshold < 0 || form.threshold > 1 ? 'Threshold must be between 0 and 1' : null;

  // Live-updating cost estimate: refetches automatically whenever model/n
  // change, since they're part of the query key.
  const costQuery = trpc.stochastic.estimateCost.useQuery(
    { model: form.model, n: form.n },
    { enabled: form.model.trim() !== '' && form.n > 0 },
  );

  const budgetQuery = trpc.stochastic.checkBudget.useQuery(
    { environment, estimatedCostInr: costQuery.data?.estimatedCostInr ?? 0 },
    { enabled: costQuery.data !== undefined },
  );

  const runMutation = trpc.stochastic.runSampling.useMutation();

  const overBudget = budgetQuery.data ? !budgetQuery.data.allowed : false;
  const hasBlockingError = Boolean(inputJsonError || nError || targetMetricError || thresholdError);
  const runDisabled = hasBlockingError || overBudget || runMutation.isPending || budgetQuery.isLoading;

  const handleRun = () => {
    if (hasBlockingError || parsedInput === null) return;
    runMutation.mutate({
      agentId: form.agentId,
      input: parsedInput,
      n: form.n,
      targetMetric: form.targetMetric,
      threshold: form.threshold,
      environment,
      model: form.model,
    });
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <SamplingConfigForm
          value={form}
          onChange={setForm}
          disabled={runMutation.isPending}
          inputJsonError={inputJsonError}
          nError={nError}
        />

        {targetMetricError ? (
          <p className="text-[var(--text-label-sm)] text-[var(--color-error)]">{targetMetricError}</p>
        ) : null}
        {thresholdError ? (
          <p className="text-[var(--text-label-sm)] text-[var(--color-error)]">{thresholdError}</p>
        ) : null}

        <div className="flex flex-wrap items-end gap-[var(--spacing-md)]">
          <CostEstimatorCard
            estimatedCostInr={costQuery.data?.estimatedCostInr ?? 0}
            disabled={overBudget}
            label={`Estimated cost (n=${form.n}, ${environment})`}
          />
          {budgetQuery.data && overBudget ? (
            <p className="max-w-sm text-[var(--text-label-sm)] text-[var(--color-error)]">
              Would exceed the {environment} monthly cap of ₹{budgetQuery.data.capInr?.toFixed(2)} by
              ₹{budgetQuery.data.wouldExceedBy?.toFixed(2)}. Reduce N or choose a cheaper model.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={runDisabled}
          className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
        >
          {runMutation.isPending ? 'Running…' : `Run ${form.n} samples`}
        </button>
      </div>

      {runMutation.isPending ? <SamplingProgress n={form.n} /> : null}

      {runMutation.isError ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
          Sampling run failed: {runMutation.error.message}
        </p>
      ) : null}

      {runMutation.data ? (
        <>
          <ResultsPanel result={runMutation.data} />
          <TraceViewer data={runMutation.data} title="Raw result" />
        </>
      ) : null}
    </div>
  );
}
