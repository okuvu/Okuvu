'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/trpc/client';
import { formatClientLabel } from '@/lib/format';

const STORAGE_PREFIX = 'draft-note-';

function getDraftKey(clientId: string): string {
  return `${STORAGE_PREFIX}${clientId}`;
}

function loadDraft(clientId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(getDraftKey(clientId)) ?? '';
  } catch {
    return '';
  }
}

function saveDraft(clientId: string, text: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (text) {
      sessionStorage.setItem(getDraftKey(clientId), text);
    } else {
      sessionStorage.removeItem(getDraftKey(clientId));
    }
  } catch {
    /* storage may be full or unavailable */
  }
}

function clearDraft(clientId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(getDraftKey(clientId));
  } catch {
    /* noop */
  }
}

function formatNoteDate(raw: Date | string): string {
  const d = new Date(raw);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatNoteTime(raw: Date | string): string {
  const d = new Date(raw);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getInitials(name: string | null): string {
  if (!name) return 'T';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const SAFETY_LABELS: Record<string, string> = {
  S0: 'Stable',
  S1: 'Low',
  S2: 'Concern',
  S3: 'Elevated',
  S4: 'Critical',
};

function SafetyBadge({ safetyState }: { safetyState: string | null }) {
  if (!safetyState) {
    return <span className="px-2 py-0.5 rounded text-[11px] font-bold border border-gray-200 bg-gray-50 text-gray-400">—</span>;
  }

  const isConcern = safetyState === 'S2' || safetyState === 'S3' || safetyState === 'S4';
  const isStable = safetyState === 'S0';
  const label = SAFETY_LABELS[safetyState] ?? safetyState;

  return (
    <span
      className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
        isConcern
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : isStable
          ? 'border-green-200 bg-green-50 text-[#2D8A5E]'
          : 'border-gray-200 bg-gray-50 text-gray-600'
      }`}
    >
      {safetyState} {label ? `— ${label}` : ''}
    </span>
  );
}

export default function ClientNotesPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { data: session } = useSession();
  const therapistName = session?.user?.name ?? 'Therapist';

  const notesQuery = trpc.notes.listNotes.useQuery({ clientId }, {
    enabled: !!clientId,
  });

  const detailQuery = trpc.clients.detail.useQuery(
    { clientUserId: clientId },
    { enabled: !!clientId },
  );

  const [noteText, setNoteText] = useState(() => loadDraft(clientId));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNoteText(loadDraft(clientId));
  }, [clientId]);

  useEffect(() => {
    saveDraft(clientId, noteText);
  }, [noteText, clientId]);

  useEffect(() => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = Math.max(160, el.scrollHeight) + 'px';
    }
  }, [noteText]);

  const addNoteMutation = trpc.notes.addNote.useMutation({
    onSuccess: () => {
      setNoteText('');
      clearDraft(clientId);
      setSubmitError(null);
      setValidationError(null);
      textareaRef.current?.focus();
      notesQuery.refetch();
    },
    onError: (error) => {
      setSubmitError(error.message ?? "Couldn't save — try again.");
    },
  });

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [clientId]);

  useEffect(() => {
    if (submitError) {
      const timer = setTimeout(() => setSubmitError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [submitError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) {
      setValidationError('Note cannot be empty');
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    addNoteMutation.mutate({ clientUserId: clientId, noteText: noteText.trim() });
  };

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.max(160, el.scrollHeight) + 'px';
  };

  const notes = notesQuery.data ?? [];
  const clientDetail = detailQuery.data ?? null;
  const userLabel = formatClientLabel(clientId);

  if (notesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-lg" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-sm text-label-sm font-label-sm text-on-surface-variant mb-lg">
          <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
          <span className="material-symbols-outlined text-[16px] text-gray-200">chevron_right</span>
          <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
          <span className="material-symbols-outlined text-[16px] text-gray-200">chevron_right</span>
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="h-8 w-64 animate-pulse rounded-lg bg-gray-200 mb-lg" />
        <div className="h-16 animate-pulse rounded-lg bg-gray-100 mb-xl" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          <div className="md:col-span-8 flex flex-col gap-lg">
            <div className="h-64 animate-pulse rounded-xl bg-surface-container-lowest border border-outline-variant" />
            <div className="border-t border-outline-variant" />
            <div className="space-y-md">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-container-lowest border border-outline-variant" />
              ))}
            </div>
          </div>
          <div className="md:col-span-4 hidden md:flex flex-col gap-md">
            <div className="h-48 animate-pulse rounded-xl bg-surface-container-lowest border border-outline-variant" />
          </div>
        </div>
      </div>
    );
  }

  if (notesQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-xl text-center max-w-md mx-auto">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-md">error_outline</span>
        <h2 className="font-display-title text-display-title text-on-surface mb-sm">
          Couldn&rsquo;t load notes
        </h2>
        <p className="font-body-main text-body-main text-on-surface-variant mb-lg">
          {notesQuery.error.message ?? 'Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => notesQuery.refetch()}
          className="inline-flex items-center gap-2 bg-primary-container text-on-primary font-label-sm text-label-sm px-lg py-sm rounded-lg hover:bg-primary transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-sm text-label-sm font-label-sm text-on-surface-variant mb-lg">
        <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        <Link href={`/clients/${clientId}`} className="hover:text-primary transition-colors">{userLabel}</Link>
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        <span className="text-on-surface font-semibold">Session Notes</span>
      </nav>

      {/* Header */}
      <div className="mb-lg">
        <h1 className="font-display-title text-display-title text-on-surface">
          Session Notes — {userLabel}
        </h1>
      </div>

      {/* Notice Bar — permanent, non-dismissible */}
      <div className="border-l-[3px] border-[#1A6B5A] bg-[#F4F6F8] rounded-lg p-4 flex items-start gap-3 mb-xl">
        <span className="material-symbols-outlined text-[#1A6B5A] text-[16px] mt-0.5 shrink-0">info</span>
        <p className="text-sm text-[#5A6472] leading-relaxed">
          Notes you write here are private to you. Evia does not read them or use them in any way.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
        {/* Notes Column */}
        <div className="md:col-span-8 flex flex-col gap-lg">
          {/* New Note Card */}
          <div className="bg-surface-container-lowest rounded-xl p-md shadow-soft border border-[#DDE2E8]">
            <h2 className="font-section-header text-section-header text-on-surface mb-sm">
              New Note
            </h2>
            <form onSubmit={handleSubmit}>
              <div>
                <label htmlFor="note-text" className="sr-only">Note text</label>
                <textarea
                  id="note-text"
                  ref={textareaRef}
                  placeholder="Write your session notes here..."
                  value={noteText}
                  onChange={(e) => {
                    setNoteText(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  onInput={handleTextareaInput}
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? 'note-validation-error' : undefined}
                  className="block w-full rounded-lg border border-[#DDE2E8] bg-surface p-sm font-body-main text-body-main text-on-surface placeholder:text-on-surface-variant/50 focus:ring-1 focus:ring-primary focus:border-primary transition-colors resize-y min-h-[160px]"
                />
                {validationError && (
                  <p id="note-validation-error" className="mt-1 text-xs text-red-600" role="alert">
                    {validationError}
                  </p>
                )}
              </div>
              <div className="mt-md flex justify-end">
                <button
                  type="submit"
                  disabled={addNoteMutation.status === 'pending'}
                  className="inline-flex items-center gap-2 bg-primary-container text-on-primary font-label-sm text-label-sm px-lg py-sm rounded-lg hover:bg-primary transition-colors shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  {addNoteMutation.status === 'pending' ? 'Saving...' : 'Save note'}
                </button>
              </div>
            </form>
          </div>

          {/* Divider */}
          <div className="border-t border-outline-variant" />

          {/* Notes List or Empty State */}
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-xl text-center">
              <p className="font-body-main text-body-main italic text-[#8A93A0] mb-sm">
                No session notes yet.
              </p>
              <p className="font-label-sm text-label-sm text-[#8A93A0]">
                Notes you write here are private to you and are not shared with the client or used by Evia.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-surface-container-lowest rounded-xl p-md shadow-soft border border-[#DDE2E8]"
                >
                  {/* Date Header */}
                  <div className="flex items-center justify-between mb-sm">
                    <div className="flex items-center gap-sm text-[13px] font-medium uppercase tracking-wide text-[#5A6472]">
                      <span className="material-symbols-outlined text-[16px] text-[#5A6472]">calendar_today</span>
                      <time dateTime={note.created_at}>
                        {formatNoteDate(note.created_at)}
                      </time>
                    </div>
                    <button
                      type="button"
                      className="text-on-surface-variant hover:text-primary transition-colors"
                      aria-label="Note options"
                      tabIndex={-1}
                    >
                      <span className="material-symbols-outlined text-[18px]">more_vert</span>
                    </button>
                  </div>

                  {/* Note Text */}
                  <p className="font-body-main text-body-main text-on-surface whitespace-pre-wrap break-words leading-relaxed mb-md">
                    {note.note_text}
                  </p>

                  {/* Author + Timestamp */}
                  <div className="flex items-center justify-between border-t border-[#DDE2E8] pt-sm mt-sm">
                    <div className="flex items-center gap-sm text-xs text-[#5A6472]">
                      <div className="w-5 h-5 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-[9px] font-bold">
                        {getInitials(note.therapist?.name ?? therapistName)}
                      </div>
                      <span>{note.therapist?.name ?? therapistName}</span>
                    </div>
                    <time dateTime={note.created_at} className="text-xs text-[#5A6472]">
                      {formatNoteTime(note.created_at)}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Patient Context Sidebar */}
        <div className="md:col-span-4 flex flex-col gap-md hidden md:flex">
          <div className="bg-surface-container-lowest rounded-xl p-md shadow-soft border border-outline-variant">
            <div className="flex items-center gap-sm mb-md pb-sm border-b border-outline-variant">
              <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant font-bold text-sm">
                {userLabel.replace('User #', '')}
              </div>
              <div>
                <h3 className="font-section-header text-section-header text-on-surface">{userLabel}</h3>
                <p className="font-label-sm text-label-sm text-on-surface-variant">Active Treatment</p>
              </div>
            </div>

            <div className="flex flex-col gap-sm">
              <div className="flex justify-between items-center">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Current Safety Score</span>
                <SafetyBadge safetyState={clientDetail?.safetyState ?? null} />
              </div>
              <div className="flex justify-between items-center">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Last Session</span>
                <span className="font-label-sm text-label-sm text-on-surface font-semibold">—</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Primary Dx</span>
                <span className="font-label-sm text-label-sm text-on-surface font-semibold">—</span>
              </div>
            </div>

            <div className="mt-md pt-md border-t border-outline-variant">
              <button
                type="button"
                disabled
                className="w-full bg-transparent border border-primary-container text-primary-container font-label-sm text-label-sm py-sm rounded-lg opacity-60 cursor-not-allowed"
              >
                View Full Profile
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save Failure Toast */}
      {submitError && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-sm px-md py-sm rounded-lg shadow-lg bg-[#FDF2F1] border-l-4 border-[#C0392B] text-[#C0392B] font-label-sm text-label-sm animate-slide-up"
          role="alert"
        >
          <span className="material-symbols-outlined text-[18px]">warning</span>
          <span className="font-semibold">{submitError}</span>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
