import type { ReactNode } from 'react';

type NoticeVariant = 'info' | 'warning' | 'error';

const VARIANT_STYLES: Record<
  NoticeVariant,
  { border: string; background: string; title: string; icon: string }
> = {
  info: {
    border: 'var(--color-primary)',
    background: 'var(--color-primary-container)',
    title: 'var(--color-on-primary-container)',
    icon: 'ℹ',
  },
  warning: {
    border: 'var(--color-tertiary)',
    background: 'var(--color-tertiary-container)',
    title: 'var(--color-on-tertiary-container)',
    icon: '⚠',
  },
  error: {
    border: 'var(--color-error)',
    background: 'var(--color-error-container)',
    title: 'var(--color-on-error-container)',
    icon: '⛔',
  },
};

export default function ClinicalNoticePanel({
  variant = 'info',
  title,
  children,
}: {
  variant?: NoticeVariant;
  title?: string;
  children: ReactNode;
}) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className="rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] border-l-4 bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]"
      style={{ borderLeftColor: styles.border }}
    >
      {title ? (
        <h2
          className="mb-1 flex items-center gap-1.5 text-[var(--text-label-sm)] font-bold uppercase tracking-wider"
          style={{ color: styles.title }}
        >
          <span aria-hidden="true">{styles.icon}</span>
          {title}
        </h2>
      ) : null}
      <div className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        {children}
      </div>
    </div>
  );
}
