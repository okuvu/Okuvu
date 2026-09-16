'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { formatClientLabel } from '@/lib/format';
import { TabStrip } from '../_components/TabStrip';

type HomeworkStatus = 'active' | 'completed' | 'archived';

function formatHomeworkDate(iso: string | Date): string {
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
  });
}

function StatusBadge({ status }: { status: HomeworkStatus }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-sage-tint text-sage-deep">
        Completed
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-honey-tint text-honey-deep">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-gray-100 text-gray-500">
      Archived
    </span>
  );
}

export default function ClientHomeworkPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const DRAFT_KEY = `homework-draft-${clientId}`;

  const [description, setDescription] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(DRAFT_KEY) || '';
    }
    return '';
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Decisions doc round, 15 Sep 2026 §4 — optional link to one of the 5
  // approved exercises, so the client app renders this as a real, playable
  // exercise instead of just prose. Empty string = "no linked exercise",
  // matching the free-text-only behavior every existing assignment has.
  const [toolId, setToolId] = useState('');

  const homeworkQuery = trpc.homework.listHomework.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const toolsQuery = trpc.reminders.listTools.useQuery();

  const assignHomework = trpc.homework.assign.useMutation({
    onSuccess: async () => {
      setSuccessMessage('Homework assigned.');
      setErrorMessage(null);
      setValidationError(null);
      setDescription('');
      setToolId('');
      sessionStorage.removeItem(DRAFT_KEY);
      await homeworkQuery.refetch();
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not assign homework.');
      setSuccessMessage(null);
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const markCompleted = trpc.homework.markCompleted.useMutation({
    onSuccess: async () => {
      await homeworkQuery.refetch();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not mark homework completed.');
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setValidationError('Homework description cannot be empty.');
      return;
    }
    if (!clientId) return;
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationError(null);
    assignHomework.mutate({
      clientUserId: clientId,
      description: description.trim(),
      toolId: toolId || undefined,
    });
  }

  const clientLabel = formatClientLabel(clientId);

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-royal-purple transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Homework</span>
          </div>

          <TabStrip clientId={clientId} active="tools" />

          {/* Info notice */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline border-l-4 border-l-violet">
            <h1 className="text-lg font-semibold text-gray-900">Homework</h1>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              Homework you assign here appears in the client&rsquo;s chat context, so OKUVU can
              coach and check in on it. Mark an item completed once the client has reported back.
            </p>
          </div>

          {/* Homework list */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              HOMEWORK HISTORY
            </h2>

            {homeworkQuery.isLoading ? (
              <div className="space-y-3 animate-pulse" role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">Loading homework history…</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : homeworkQuery.isError ? (
              <p className="text-sm text-danger">
                Could not load homework. Please refresh and try again.
              </p>
            ) : homeworkQuery.data && homeworkQuery.data.length > 0 ? (
              <div className="space-y-3">
                {homeworkQuery.data.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-gray-50 p-4 border border-gray-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {item.description}
                      </p>
                      <StatusBadge status={item.status as HomeworkStatus} />
                    </div>
                    {item.tool && (
                      <span className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-lavender-wash text-royal-purple">
                        {item.tool.label}
                      </span>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">
                        Assigned {formatHomeworkDate(item.assigned_at)}
                      </span>
                      {item.status === 'active' && (
                        <button
                          type="button"
                          onClick={() =>
                            markCompleted.mutate({ homeworkId: item.id, clientId })
                          }
                          disabled={markCompleted.isPending}
                          className="text-xs font-medium text-royal-purple hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Mark completed
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500 italic">No homework assigned yet.</p>
                <p className="mt-1 text-xs text-gray-500">
                  Homework you assign below will appear here.
                </p>
              </div>
            )}
          </div>

          {/* Assign homework form */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              ASSIGN HOMEWORK
            </h2>

            <form onSubmit={handleSubmit}>
              <label htmlFor="homework-description" className="sr-only">
                Homework description
              </label>
              <textarea
                id="homework-description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  sessionStorage.setItem(DRAFT_KEY, e.target.value);
                  if (validationError) setValidationError(null);
                }}
                rows={4}
                placeholder="e.g. Practice box breathing before bed each night this week."
                disabled={assignHomework.isPending}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <label htmlFor="homework-tool" className="mt-3 block text-xs font-medium text-gray-500">
                Link to a specific exercise (optional)
              </label>
              <select
                id="homework-tool"
                value={toolId}
                onChange={(e) => setToolId(e.target.value)}
                disabled={assignHomework.isPending || toolsQuery.isLoading}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">None — text only</option>
                {toolsQuery.data?.map((tool) => (
                  <option key={tool.toolId} value={tool.toolId}>
                    {tool.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Linking renders this as a real, playable exercise in the client&rsquo;s app —
                only what you assign here appears there.
              </p>

              <button
                type="submit"
                disabled={assignHomework.isPending || !description.trim()}
                className="mt-3 w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assignHomework.isPending ? 'Assigning...' : 'Assign homework'}
              </button>
            </form>

            {validationError && (
              <p
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-lg bg-danger-tint p-3 text-sm text-danger text-center"
              >
                {validationError}
              </p>
            )}
            {successMessage && (
              <p
                role="status"
                aria-live="polite"
                className="mt-4 rounded-lg bg-sage-tint p-3 text-sm text-sage-deep text-center"
              >
                {successMessage}
              </p>
            )}
            {errorMessage && (
              <p
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-lg bg-danger-tint p-3 text-sm text-danger text-center"
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
