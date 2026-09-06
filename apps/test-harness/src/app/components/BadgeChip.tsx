import type { ReactNode } from 'react';

export default function BadgeChip({
  children,
  colorClass = 'text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container-high)] border-[var(--color-outline-variant)]',
}: {
  children: ReactNode;
  /** Tailwind text/background/border color classes; defaults to a neutral chip. */
  colorClass?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-full)] border px-2 py-0.5 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] ${colorClass}`}
    >
      {children}
    </span>
  );
}
