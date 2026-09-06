import type { ReactNode } from 'react';
import Link from 'next/link';

export default function DashboardRow({
  label,
  value,
  href,
}: {
  label: string;
  value: ReactNode;
  href?: string;
}) {
  const content = (
    <div className="flex items-center justify-between gap-[var(--spacing-md)] px-[var(--spacing-md)] py-[var(--spacing-sm)] transition-colors hover:bg-[var(--color-surface-container-low)]">
      <span className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        {label}
      </span>
      <span className="text-[var(--text-body-main)] font-medium text-[var(--color-on-surface)]">
        {value}
      </span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-[var(--radius-lg)]">
        {content}
      </Link>
    );
  }

  return content;
}
