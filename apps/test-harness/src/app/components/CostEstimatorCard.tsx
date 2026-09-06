const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export default function CostEstimatorCard({
  estimatedCostInr,
  disabled = false,
  label = 'Estimated cost',
}: {
  estimatedCostInr: number;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border p-[var(--spacing-md)] ${
        disabled
          ? 'border-[var(--color-error)] bg-[var(--color-error-container)]'
          : 'border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]'
      }`}
    >
      <p className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] uppercase tracking-wide text-[var(--color-on-surface-variant)]">
        {label}
      </p>
      <p
        className={`mt-1 text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] ${
          disabled ? 'text-[var(--color-on-error-container)]' : 'text-[var(--color-on-surface)]'
        }`}
      >
        {inrFormatter.format(estimatedCostInr)}
      </p>
      {disabled ? (
        <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-on-error-container)]">
          Over budget
        </p>
      ) : null}
    </div>
  );
}
