'use client';

import { useEnvironment } from '@/lib/environment-context';
import { trpc } from '@/trpc/client';

export default function CurrentPinPanel() {
  const { environment } = useEnvironment();
  const { data: pin, isLoading, error } = trpc.testConfig.getLatestPin.useQuery({ environment });

  if (isLoading) {
    return (
      <p className="text-[var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
        Loading current pin…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-[var(--text-body-sm)] text-[var(--color-error)]">
        Failed to load current pin: {error.message}
      </p>
    );
  }

  if (!pin) {
    return (
      <p className="text-[var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
        No model config pinned yet for <span className="font-medium">{environment}</span>.
      </p>
    );
  }

  const rows: Array<[string, string]> = [
    ['Model version', pin.model_version],
    ['Temperature', String(pin.temperature)],
    ['Prompt hash', pin.prompt_hash],
    ['Safety settings', pin.safety_settings],
    ['Suite version', pin.suite_version],
    ['Pinned by', pin.pinned_by],
    ['Pinned at', new Date(pin.created_at).toLocaleString()],
  ];

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)] text-[var(--text-body-sm)] sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-[var(--color-on-surface-variant)]">{label}</dt>
          <dd className="break-all font-mono text-xs text-[var(--color-on-surface)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
