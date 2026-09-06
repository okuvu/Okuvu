'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function PreviewModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Initial focus on open + restore focus to the triggering element on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Lightweight focus trap: cycle Tab/Shift+Tab within the dialog so
      // keyboard focus never escapes to the page behind it while open.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-[var(--spacing-lg)]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        // tabIndex={-1} lets the container itself receive programmatic focus
        // on open (it's not otherwise focusable) so screen reader/keyboard
        // users land inside the dialog instead of on whatever was focused
        // behind it.
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-[var(--radius-xl)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-soft)] focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-outline-variant)] px-[var(--spacing-lg)] py-[var(--spacing-md)]">
          <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[var(--radius-lg)] px-2 py-1 text-[var(--color-on-surface-variant)] transition-colors hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)]"
          >
            &#10005;
          </button>
        </div>
        <div className="p-[var(--spacing-lg)]">{children}</div>
      </div>
    </div>
  );
}
