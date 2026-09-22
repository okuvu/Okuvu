import type { AppointmentView } from '@okuvu/shared-types';

interface AppointmentRow {
  id: string;
  therapist_id: string;
  scheduled_at: Date;
  duration_minutes: number;
  mode: string;
  location: string | null;
  note_to_client: string | null;
  remind_24h: boolean;
  remind_1h: boolean;
  rescheduled_from: string | null;
  cancelled_at: Date | null;
  therapist: { name: string | null };
}

// Shared by routes/appointments.ts's own list endpoint and
// GET /users/me/today's next_appointment field (via lib/today-card.ts) —
// same row shape, same mapping, avoids duplicating it.
export function toView(a: AppointmentRow): AppointmentView {
  return {
    id: a.id,
    scheduledAt: a.scheduled_at.toISOString(),
    durationMinutes: a.duration_minutes,
    mode: a.mode,
    location: a.location,
    noteToClient: a.note_to_client,
    remind24h: a.remind_24h,
    remind1h: a.remind_1h,
    rescheduledFrom: a.rescheduled_from,
    cancelledAt: a.cancelled_at?.toISOString() ?? null,
    therapistId: a.therapist_id,
    therapistName: a.therapist.name,
  };
}
