import type { TestRunStatus } from '@evia/shared-types';
import { getRunStatusPresentation } from '@/lib/run-status';

export default function RunStatusBadge({ status }: { status: TestRunStatus }) {
  const { label, colorClass, dotClass, icon } = getRunStatusPresentation(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 py-0.5 text-[var(--text-status-pill)] font-[var(--text-status-pill--font-weight)] uppercase tracking-wide ${colorClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {/* Icon + text label together — status must never be conveyed by the
          color dot alone (WCAG 1.4.1). Both the icon and the label text are
          always visible, not hover-only. */}
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
