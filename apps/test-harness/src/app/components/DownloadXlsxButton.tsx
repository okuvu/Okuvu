'use client';

/**
 * The one download control every test screen uses, so the six of them do not
 * each grow their own styled button and drift.
 *
 * It is deliberately dumb: the caller owns building and saving the file (some
 * screens build in the browser from page state, some ask the server for a
 * base64 workbook). This only owns the label, the pending state and the
 * secondary styling.
 */
export default function DownloadXlsxButton({
  onClick,
  disabled,
  pending,
  label = 'Download .xlsx',
}: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className="self-start rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)] transition-colors hover:bg-[var(--color-surface-container-high)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Building…' : label}
    </button>
  );
}
