'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { AppointmentForm, type AppointmentFormValues } from './AppointmentForm';

const MODE_LABELS: Record<string, string> = {
  video: 'video',
  phone: 'phone',
  in_person: 'in person',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toIsoDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function toFormPrefill(a: { scheduledAt: string; durationMinutes: number; mode: string; location: string | null; noteToClient: string | null; remind24h: boolean; remind1h: boolean }): Partial<AppointmentFormValues> {
  const d = new Date(a.scheduledAt);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 5),
    durationMinutes: a.durationMinutes,
    mode: a.mode as AppointmentFormValues['mode'],
    location: a.location ?? '',
    noteToClient: a.noteToClient ?? '',
    remind24h: a.remind24h,
    remind1h: a.remind1h,
  };
}

// wireframes P-02/P-03/P-04 — "Next session" card + past/upcoming list +
// schedule/reschedule/cancel, embedded in the client-detail Profile tab.
export function AppointmentsCard({ clientUserId }: { clientUserId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.appointments.listForClient.useQuery({ clientUserId });

  const [mode, setMode] = useState<{ kind: 'closed' } | { kind: 'create' } | { kind: 'reschedule'; appointmentId: string }>({ kind: 'closed' });

  const invalidate = () => utils.appointments.listForClient.invalidate({ clientUserId });

  const create = trpc.appointments.create.useMutation({
    onSuccess: () => {
      invalidate();
      setMode({ kind: 'closed' });
    },
  });
  const reschedule = trpc.appointments.reschedule.useMutation({
    onSuccess: () => {
      invalidate();
      setMode({ kind: 'closed' });
    },
  });
  const cancel = trpc.appointments.cancel.useMutation({ onSuccess: invalidate });

  if (isLoading) {
    return <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />;
  }

  const upcoming = data?.upcoming ?? [];
  const past = data?.past ?? [];
  const nextSession = upcoming[0] ?? null;

  return (
    <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Appointments</h2>
        {mode.kind === 'closed' && (
          <button
            type="button"
            onClick={() => setMode({ kind: 'create' })}
            className="text-sm font-medium text-violet hover:underline"
          >
            Schedule a session
          </button>
        )}
      </div>

      {nextSession && (
        <div className="mb-4 rounded-lg bg-sage-tint px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-sage-deep">Next session</p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {formatDateTime(nextSession.scheduledAt)} &middot; {MODE_LABELS[nextSession.mode] ?? nextSession.mode} &middot;{' '}
            {nextSession.durationMinutes} min
          </p>
          {(nextSession.remind24h || nextSession.remind1h) && (
            <p className="mt-0.5 text-xs text-sage-deep">
              Reminds {[nextSession.remind24h && '24h', nextSession.remind1h && '1h'].filter(Boolean).join(' & ')} before
            </p>
          )}
        </div>
      )}

      {mode.kind === 'create' && (
        <div className="mb-4">
          <AppointmentForm
            submitLabel="Save & send to client"
            isSubmitting={create.isPending}
            onCancel={() => setMode({ kind: 'closed' })}
            onSubmit={(values) =>
              create.mutate({
                clientUserId,
                scheduledAt: toIsoDateTime(values.date, values.time),
                durationMinutes: values.durationMinutes,
                mode: values.mode,
                location: values.location || undefined,
                noteToClient: values.noteToClient || undefined,
                repeatWeeklyCount: values.repeatWeeklyCount,
                remind24h: values.remind24h,
                remind1h: values.remind1h,
              })
            }
          />
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 && mode.kind !== 'create' ? (
        <p className="text-sm text-gray-400 italic">No appointments scheduled yet.</p>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">Upcoming</p>
              <ul className="space-y-2">
                {upcoming.map((a) =>
                  mode.kind === 'reschedule' && mode.appointmentId === a.id ? (
                    <li key={a.id}>
                      <AppointmentForm
                        initialValues={toFormPrefill(a)}
                        submitLabel="Save & send to client"
                        isSubmitting={reschedule.isPending}
                        allowRepeat={false}
                        onCancel={() => setMode({ kind: 'closed' })}
                        onSubmit={(values) =>
                          reschedule.mutate({
                            appointmentId: a.id,
                            clientUserId,
                            scheduledAt: toIsoDateTime(values.date, values.time),
                            durationMinutes: values.durationMinutes,
                            mode: values.mode,
                            location: values.location || undefined,
                            noteToClient: values.noteToClient || undefined,
                            remind24h: values.remind24h,
                            remind1h: values.remind1h,
                          })
                        }
                      />
                    </li>
                  ) : (
                    <li key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                      <span className="text-sm text-gray-700">
                        {formatDateTime(a.scheduledAt)} &middot; {MODE_LABELS[a.mode] ?? a.mode}
                      </span>
                      <span className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setMode({ kind: 'reschedule', appointmentId: a.id })}
                          className="text-xs font-medium text-violet hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate({ appointmentId: a.id, clientUserId })}
                          className="text-xs font-medium text-danger hover:underline disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">Earlier</p>
              <ul className="space-y-1">
                {past.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-sm text-gray-500">
                    <span>
                      {formatDateTime(a.scheduledAt)} &middot; {MODE_LABELS[a.mode] ?? a.mode}
                    </span>
                    <span className="text-xs italic">{a.cancelledAt ? 'cancelled' : 'completed'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
