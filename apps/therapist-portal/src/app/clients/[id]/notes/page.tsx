'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/trpc/client';

interface NoteItem {
  id: string;
  note_text: string;
  created_at: string;
  therapist: {
    name: string | null;
  };
}

export default function ClientNotesPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const notesQuery = trpc.notes.listNotes.useQuery({ clientId }, {
    enabled: !!clientId,
  });

  const [noteText, setNoteText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addNoteMutation = trpc.notes.addNote.useMutation({
    onSuccess: () => {
      setNoteText('');
      setSubmitError(null);
      textareaRef.current?.focus();
      notesQuery.refetch();
    },
    onError: (error) => {
      setSubmitError(error.message ?? 'Failed to add note');
    },
  });

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [clientId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) {
      setSubmitError('Note cannot be empty');
      return;
    }
    setSubmitError(null);
    addNoteMutation.mutate({ clientUserId: clientId, noteText: noteText.trim() });
  };

  if (notesQuery.isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Loading notes…
        </h2>
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  if (notesQuery.isError) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Couldn't load notes
        </h2>
        <p className="text-sm text-gray-500">
          {notesQuery.error.message ?? 'Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => notesQuery.refetch()}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
        >
          Retry
        </button>
      </div>
    );
  }

  const notes = notesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">
        Notes for client
      </h2>

      <section>
        {notes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-12 text-center">
            <p className="text-sm font-medium text-gray-900">
              No notes yet
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Add a note below to get started.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {notes.map((note: NoteItem) => (
              <li key={note.id} className="px-4 py-5 sm:px-6">
                <div className="text-base text-gray-900 whitespace-pre-wrap">
                  {note.note_text}
                </div>
                <div className="mt-2 flex items-center space-x-3 text-xs text-gray-500">
                  <span>{note.therapist?.name ?? 'Therapist'}</span>
                  <time
                    dateTime={note.created_at}
                    className="ml-3"
                  >
                    {new Date(note.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="note-text" className="sr-only">
            Note text
          </label>
          <textarea
            id="note-text"
            ref={textareaRef}
            rows={4}
            placeholder="What would you like to note about this client?"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            aria-invalid={!!submitError}
            aria-describedby={submitError ? 'note-error' : undefined}
            className="block w-full rounded-lg border px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400"
          />
          {submitError && (
            <p id="note-error" className="mt-1 text-xs text-red-600" role="alert">
              {submitError}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={addNoteMutation.status === 'pending'}
            className="disabled:opacity-50 disabled:cursor-not-allowed rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
          >
            {addNoteMutation.status === 'pending' ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </form>
    </div>
  );
}