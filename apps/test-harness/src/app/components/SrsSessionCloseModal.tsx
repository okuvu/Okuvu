'use client';

import { useEffect, useRef, useState } from 'react';
import { simulateSessionCloseAction } from '@/app/conversations/actions';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * TH-S22 — Web equivalent of the mobile SRS (Session Rating Scale)
 * bottom-sheet modal.
 *
 * Source of truth: apps/mobile/lib/src/features/chat/widgets/srs_modal.dart
 * (`_SrsModalContentState`). The header copy ("How was this session?" /
 * "Optional — takes 2 seconds."), the "Skip" action, the 4 rating labels
 * (in order: "Missed the mark", "Not really", "Okay", "Helpful"), and the
 * post-selection "Got it" confirmation state are reused verbatim from that
 * file — this is a mood/session-feedback rubric (Session Rating Scale), not
 * a suicide-risk screen, despite the acronym's ambiguity. Flutter's
 * `Icons.sentiment_*` glyphs (very_dissatisfied / dissatisfied / neutral /
 * satisfied) don't have a built-in web equivalent in this codebase, so each
 * rating uses a simple face emoji as a reasonable substitute.
 *
 * Selecting a rating calls `simulateSessionClose` (conversation.ts,
 * TH-S22) with the chosen score, which drives the real `closeSession` +
 * A13/A15 summary/memory flow against the synthetic session — see that
 * procedure's doc comment for the full design rationale.
 */

const RATINGS: { score: 1 | 2 | 3 | 4; label: string; emoji: string }[] = [
  { score: 1, label: 'Missed the mark', emoji: '\u{1F61E}' }, // 😞
  { score: 2, label: 'Not really', emoji: '\u{1F641}' }, // 🙁
  { score: 3, label: 'Okay', emoji: '\u{1F610}' }, // 😐
  { score: 4, label: 'Helpful', emoji: '\u{1F642}' }, // 🙂
];

type Phase = 'rating' | 'submitting' | 'confirmation';

export interface SrsSessionCloseModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  userId: string;
  /** Fired once `simulateSessionClose` resolves, before the confirmation auto-dismiss. */
  onResult?: (result: {
    closeResult: unknown;
    summaryTriggered: boolean;
    summaryRow: unknown;
    srsScore: number | null;
  }) => void;
}

export default function SrsSessionCloseModal({
  open,
  onClose,
  sessionId,
  userId,
  onResult,
}: SrsSessionCloseModalProps) {
  const [phase, setPhase] = useState<Phase>('rating');
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Initial focus on open + restore focus to the triggering element on close.
  // Hooks must run unconditionally (before the `if (!open) return null`
  // below), so this guards on `open` internally rather than being skipped.
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
        handleClose();
        return;
      }
      // Lightweight focus trap: keep Tab/Shift+Tab cycling within the sheet.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase]);

  if (!open) return null;

  function reset() {
    setPhase('rating');
    setSelectedScore(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSelect(score: number) {
    if (phase !== 'rating') return;
    setSelectedScore(score);
    setPhase('submitting');
    setError(null);

    const result = await simulateSessionCloseAction({ sessionId, userId, srsScore: score });

    if (!result.success) {
      setError(result.error);
      setPhase('rating');
      setSelectedScore(null);
      return;
    }

    onResult?.(result.data);
    setPhase('confirmation');

    // Mirrors the Flutter modal's ~800ms "Got it" confirmation beat before
    // auto-dismissing (srs_modal.dart's `_confirmationDuration`).
    setTimeout(() => {
      handleClose();
    }, 800);
  }

  function handleSkip() {
    handleClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="How was this session?"
      onClick={phase === 'rating' ? handleSkip : undefined}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)] focus:outline-none sm:rounded-[var(--radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'confirmation' ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <span className="text-4xl text-[var(--color-primary)]" aria-hidden="true">
              &#10003;
            </span>
            <p className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-primary)]">
              Got it
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
                  How was this session?
                </h2>
                <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
                  Optional &mdash; takes 2 seconds.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSkip}
                disabled={phase === 'submitting'}
                className="shrink-0 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] disabled:opacity-50"
              >
                Skip
              </button>
            </div>

            {error ? (
              <p className="mt-3 text-[var(--text-label-sm)] text-[var(--color-error)]">
                Error: {error}
              </p>
            ) : null}

            <div className="mt-6 grid grid-cols-4 gap-2">
              {RATINGS.map((rating) => {
                const isSelected = selectedScore === rating.score;
                const isDimmed = selectedScore !== null && !isSelected;
                return (
                  <button
                    key={rating.score}
                    type="button"
                    onClick={() => handleSelect(rating.score)}
                    disabled={phase === 'submitting'}
                    aria-label={rating.label}
                    className={`flex flex-col items-center gap-1 rounded-[var(--radius-lg)] border-2 px-1 py-3 transition-opacity ${
                      isSelected
                        ? 'border-[var(--color-primary)]'
                        : 'border-transparent'
                    } ${isDimmed ? 'opacity-50' : 'opacity-100'}`}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {rating.emoji}
                    </span>
                    <span
                      className={`text-center text-[var(--text-label-sm)] leading-tight text-[var(--color-on-surface)] ${
                        isSelected ? 'font-bold' : 'font-normal'
                      }`}
                    >
                      {rating.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
