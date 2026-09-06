'use client';

import { useState } from 'react';
import { useEnvironment } from '@/lib/environment-context';
import { trpc } from '@/trpc/client';

/**
 * PI-only. See PinModelVersionForm's note on gating — the FORBIDDEN check
 * happens server-side regardless, this component is just hidden from
 * non-PI users by its parent.
 */
export default function TemperatureForm() {
  const { environment } = useEnvironment();
  const utils = trpc.useUtils();
  const [temperature, setTemperature] = useState('0.7');

  const setTempMutation = trpc.testConfig.setTemperature.useMutation({
    onSuccess: () => {
      utils.testConfig.getLatestPin.invalidate({ environment });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTempMutation.mutate({ environment, temperature: Number(temperature) });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]"
    >
      <label className="flex flex-col gap-1 text-[var(--text-body-sm)]">
        Set temperature (carries forward the latest pin&apos;s other fields)
        <input
          type="number"
          step="0.1"
          min="0"
          max="2"
          required
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          className="w-32 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2 py-1"
        />
      </label>
      <button
        type="submit"
        disabled={setTempMutation.isPending}
        className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] disabled:opacity-50"
      >
        {setTempMutation.isPending ? 'Saving…' : 'Set temperature'}
      </button>
      {setTempMutation.error ? (
        <p className="text-[var(--text-body-sm)] text-[var(--color-error)]">
          {setTempMutation.error.message}
        </p>
      ) : null}
    </form>
  );
}
