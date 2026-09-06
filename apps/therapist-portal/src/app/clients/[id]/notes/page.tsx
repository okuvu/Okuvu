'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { formatClientLabel } from '@/lib/format';

function formatNoteDate(iso: string | Date): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ClientNotesPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const DRAFT_KEY = `note-draft-${clientId}`;

  const [noteText, setNoteText] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(DRAFT_KEY) || '';
    }
    return '';
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const notesQuery = trpc.notes.listNotes.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const addNote = trpc.notes.addNote.useMutation({
    onSuccess: async () => {
      setSuccessMessage('Note saved.');
      setErrorMessage(null);
      setValidationError(null);
      setNoteText('');
      sessionStorage.removeItem(DRAFT_KEY);
      await notesQuery.refetch();
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not save note.');
      setSuccessMessage(null);
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) {
      setValidationError('Note cannot be empty.');
      return;
    }
    if (!clientId) return;
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationError(null);
    addNote.mutate({ clientUserId: clientId, noteText: noteText.trim() });
  }

  const clientLabel = formatClientLabel(clientId);

  return (
    <div className="min-h-screen bg-[#F4F6F8]">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-[#1A6B5A] transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-[#1A6B5A] transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Session Notes</span>
          </div>

          {/* Privacy notice */}
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200 border-l-4 border-l-[#1A6B5A]">
            <h1 className="text-lg font-semibold text-gray-900">Session Notes</h1>
            <div className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-800 leading-relaxed">
              <strong>Privacy notice:</strong> Session notes are for your reference only. They
              are stored securely and are <strong>never read</strong> by the AI system. The AI
              does not ingest, process, or respond to your notes in any way. This is a deliberate
              clinical boundary &mdash; you control what informs the AI through the care plan
              selector.
            </div>
          </div>

          {/* Notes list */}
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              NOTE HISTORY
            </h2>

            {notesQuery.isLoading ? (
              <div className="space-y-3 animate-pulse">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : notesQuery.isError ? (
              <p className="text-sm text-red-600">
                Could not load notes. Please refresh and try again.
              </p>
            ) : notesQuery.data && notesQuery.data.length > 0 ? (
              <div className="space-y-3">
                {notesQuery.data.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-gray-50 p-4 border border-gray-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {note.note_text}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                      <span>{formatNoteDate(note.created_at)}</span>
                      {note.therapist?.name && (
                        <>
                          <span>&middot;</span>
                          <span>{note.therapist.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-400 italic">No notes yet.</p>
                <p className="mt-1 text-xs text-gray-400">
                  Notes you add below will appear here.
                </p>
              </div>
            )}
          </div>

          {/* Add note form */}
          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              ADD A NOTE
            </h2>

            <form onSubmit={handleSubmit}>
              <label htmlFor="note" className="sr-only">
                Note text
              </label>
              <textarea
                id="note"
                value={noteText}
                onChange={(e) => {
                  setNoteText(e.target.value);
                  sessionStorage.setItem(DRAFT_KEY, e.target.value);
                  if (validationError) setValidationError(null);
                }}
                rows={5}
                placeholder="Enter your session notes here..."
                disabled={addNote.isPending}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#1A6B5A] focus:ring-1 focus:ring-[#1A6B5A] disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={addNote.isPending || !noteText.trim()}
                className="mt-3 w-full rounded-lg bg-[#1A6B5A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#005243] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addNote.isPending ? 'Saving...' : 'Save note'}
              </button>
            </form>

            {validationError && (
              <p
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 text-center"
              >
                {validationError}
              </p>
            )}
            {successMessage && (
              <p
                role="status"
                aria-live="polite"
                className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800 text-center"
              >
                {successMessage}
              </p>
            )}
            {errorMessage && (
              <p
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 text-center"
              >
                {errorMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
