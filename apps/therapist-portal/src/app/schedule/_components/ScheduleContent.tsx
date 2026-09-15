'use client';

import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { maskPhone } from '@/lib/format';

const MODE_LABELS: Record<string, string> = {
  video: 'video',
  phone: 'phone',
  in_person: 'in person',
};

function formatDayHeading(date: Date): string {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const day = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  return isToday ? `Today · ${weekday} ${day}` : `${weekday} ${day}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// wireframes P-01 — Schedule tab/page: day/week view across all of this
// therapist's clients, "Today" strip + "Upcoming" section.
export function ScheduleContent() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 14);

  const { data, isLoading, isError } = trpc.appointments.listForTherapist.useQuery({
    from: from.toISOString(),
    to: to.toISOString(),
  });

  const appointments = data ?? [];
  const todayAppointments = appointments.filter(
    (a) => new Date(a.scheduledAt).toDateString() === from.toDateString(),
  );
  const upcomingAppointments = appointments.filter(
    (a) => new Date(a.scheduledAt).toDateString() !== from.toDateString(),
  );

  return (
    <main className="p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Schedule</h1>
        <p className="mt-1 text-gray-500">Your upcoming sessions across all clients.</p>
      </header>

      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
            {formatDayHeading(from)}
          </h2>
          {isLoading ? (
            <div className="h-16 rounded-lg bg-gray-100 animate-pulse" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">Loading today&rsquo;s sessions…</span>
            </div>
          ) : isError ? (
            <p role="alert" className="text-sm text-danger">Could not load today&rsquo;s sessions.</p>
          ) : todayAppointments.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No sessions scheduled today.</p>
          ) : (
            <div className="space-y-2">
              {todayAppointments.map((a) => (
                <Link
                  key={a.id}
                  href={`/clients/${a.clientUserId}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 hover:bg-lavender-wash transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{maskPhone(a.clientPhoneNumber)}</p>
                    <p className="text-xs text-gray-500">
                      {formatTime(a.scheduledAt)} &middot; {MODE_LABELS[a.mode] ?? a.mode} &middot; {a.durationMinutes} min
                    </p>
                  </div>
                  <span className="text-xs font-medium text-royal-purple">View &rarr;</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Upcoming</h2>
          {isLoading ? (
            <div className="h-16 rounded-lg bg-gray-100 animate-pulse" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">Loading upcoming sessions…</span>
            </div>
          ) : upcomingAppointments.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Nothing else scheduled in the next 14 days.</p>
          ) : (
            <div className="space-y-2">
              {upcomingAppointments.map((a) => (
                <Link
                  key={a.id}
                  href={`/clients/${a.clientUserId}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 hover:bg-lavender-wash transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{maskPhone(a.clientPhoneNumber)}</p>
                    <p className="text-xs text-gray-500">
                      {formatDayHeading(new Date(a.scheduledAt))} &middot; {formatTime(a.scheduledAt)} &middot;{' '}
                      {MODE_LABELS[a.mode] ?? a.mode}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-royal-purple">View &rarr;</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
