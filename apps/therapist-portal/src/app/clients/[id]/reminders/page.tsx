'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { formatClientLabel } from '@/lib/format';

const FREQUENCY_LABELS: Record<string, string> = {
  off: 'Off',
  once_daily: 'Once daily',
  twice_daily: 'Twice daily',
  thrice_daily: '3x daily',
  as_needed: 'As needed',
};

const DAILY_FREQUENCIES = new Set(['once_daily', 'twice_daily', 'thrice_daily']);
const TIMES_FOR_FREQUENCY: Record<string, number> = {
  once_daily: 1,
  twice_daily: 2,
  thrice_daily: 3,
};

export default function ClientRemindersPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [scheduleNote, setScheduleNote] = useState('');
  const [frequency, setFrequency] = useState('as_needed');
  const [times, setTimes] = useState<string[]>(['09:00']);
  const [toolId, setToolId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const remindersQuery = trpc.reminders.listReminders.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );
  const toolsQuery = trpc.reminders.listTools.useQuery();

  const createReminder = trpc.reminders.create.useMutation({
    onSuccess: async () => {
      setSuccessMessage('Reminder created.');
      setErrorMessage(null);
      setScheduleNote('');
      await remindersQuery.refetch();
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not create reminder.');
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const setActive = trpc.reminders.setActive.useMutation({
    onSuccess: async () => {
      await remindersQuery.refetch();
    },
  });

  function handleFrequencyChange(next: string) {
    setFrequency(next);
    const count = TIMES_FOR_FREQUENCY[next] ?? 0;
    setTimes((prev) => {
      const base = prev.length ? prev : ['09:00'];
      if (count === 0) return [];
      return Array.from({ length: count }, (_, i) => base[i] ?? '09:00');
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduleNote.trim() || !clientId) return;
    setErrorMessage(null);
    createReminder.mutate({
      clientUserId: clientId,
      scheduleNote: scheduleNote.trim(),
      frequency: frequency as 'off' | 'once_daily' | 'twice_daily' | 'thrice_daily' | 'as_needed',
      times: DAILY_FREQUENCIES.has(frequency) ? times : [],
      toolId: toolId || undefined,
    });
  }

  const clientLabel = formatClientLabel(clientId);

  return (
    <div className="min-h-screen bg-[#F4F6F8]">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-[#1A6B5A] transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-[#1A6B5A] transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Reminders</span>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200 border-l-4 border-l-[#1A6B5A]">
            <h1 className="text-lg font-semibold text-gray-900">Reminders</h1>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              Reminders appear on the client&rsquo;s Today card in the app. Push delivery isn&rsquo;t
              wired up yet — the client sees these when they open the app.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              ACTIVE &amp; PAST REMINDERS
            </h2>
            {remindersQuery.isLoading ? (
              <div className="space-y-3 animate-pulse">
                {[0, 1].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : remindersQuery.data && remindersQuery.data.length > 0 ? (
              <div className="space-y-3">
                {remindersQuery.data.map((item) => (
                  <div key={item.id} className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {item.scheduleNote}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          item.active ? 'bg-[#E8F5EE] text-[#2D8A5E]' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-400">
                      <span>
                        {FREQUENCY_LABELS[item.frequency] ?? item.frequency}
                        {item.times.length > 0 ? ` · ${item.times.join(', ')}` : ''}
                        {item.tool ? ` · ${item.tool.label}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setActive.mutate({ id: item.id, clientUserId: clientId, active: !item.active })
                        }
                        disabled={setActive.isPending}
                        className="font-medium text-[#1A6B5A] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {item.active ? 'Pause' : 'Resume'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400 italic">No reminders yet.</p>
            )}
          </div>

          <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              NEW REMINDER
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                value={scheduleNote}
                onChange={(e) => setScheduleNote(e.target.value)}
                rows={3}
                placeholder="e.g. Try box breathing before bed."
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#1A6B5A] focus:ring-1 focus:ring-[#1A6B5A]"
              />

              <div className="flex flex-wrap gap-3">
                <label className="text-xs text-gray-500">
                  Frequency
                  <select
                    value={frequency}
                    onChange={(e) => handleFrequencyChange(e.target.value)}
                    className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                  >
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-gray-500">
                  Tool (optional)
                  <select
                    value={toolId}
                    onChange={(e) => setToolId(e.target.value)}
                    className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                  >
                    <option value="">None</option>
                    {toolsQuery.data?.map((tool) => (
                      <option key={tool.toolId} value={tool.toolId}>
                        {tool.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {DAILY_FREQUENCIES.has(frequency) && (
                <div className="flex flex-wrap gap-2">
                  {times.map((t, i) => (
                    <input
                      key={i}
                      type="time"
                      value={t}
                      onChange={(e) => {
                        const next = [...times];
                        next[i] = e.target.value;
                        setTimes(next);
                      }}
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                    />
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={createReminder.isPending || !scheduleNote.trim()}
                className="w-full rounded-lg bg-[#1A6B5A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#005243] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createReminder.isPending ? 'Creating...' : 'Create reminder'}
              </button>

              {errorMessage && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 text-center">
                  {errorMessage}
                </p>
              )}
              {successMessage && (
                <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800 text-center">
                  {successMessage}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
