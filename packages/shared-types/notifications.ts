/**
 * Client-facing notification copy, shared by every writer.
 *
 * Why this lives here and not in the portal: the portal is the only writer
 * today, but the reminder sweep (apps/worker) will write the same kinds later,
 * and the app's inbox reads whatever was stored. Keeping the wording in one
 * exported module means the bell, a future push sender and an email sender
 * cannot drift into three slightly different sentences for the same event.
 *
 * Two rules for anything added here:
 *
 * 1. **Nothing clinical.** These strings are stored and later may be shown on a
 *    lock screen or in an email preview. A homework title, an assessment score
 *    or a therapist's private reasoning note must never appear. "New homework"
 *    is the ceiling; the body may quote the exercise the client is about to see
 *    in the app anyway, never the reason the therapist assigned it.
 * 2. **Absolute dates, never "today" / "tomorrow".** The body is authored once
 *    and stored; a relative word silently becomes wrong the next morning, and
 *    an inbox full of stale "tomorrow" is worse than no inbox.
 */

export type NotificationKind =
  | 'homework_assigned'
  | 'reminder_set'
  | 'appointment_booked'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'

/** One stored row, as the app receives it. */
export interface NotificationDto {
  id: string
  kind: string
  title: string
  body: string
  /** Deep-link target: open the client's homework list. Null for other kinds. */
  homeworkId: string | null
  /** Deep-link target: open this appointment's detail. Null for other kinds. */
  appointmentId: string | null
  /** ISO 8601, null while unread. */
  readAt: string | null
  createdAt: string
}

export interface NotificationsResponse {
  notifications: NotificationDto[]
  /** Unread rows across the whole inbox, not just the returned page. */
  unreadCount: number
}

/** A notification row before it is written: everything except the id. */
export interface NotificationDraft {
  kind: NotificationKind
  title: string
  body: string
  homeworkId?: string | null
  appointmentId?: string | null
}

/**
 * Appointment times are stored UTC and every human reading them is in India.
 * Converted by a fixed offset rather than `Intl` with a named zone: the api
 * image is `node:22-alpine`, and a missing tz database there would silently
 * render UTC times — a session shown an hour and a half late is worse than an
 * obvious formatting bug.
 */
const IST_OFFSET_MINUTES = 330

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface ISTParts {
  weekday: string
  day: number
  month: string
  hours: number
  minutes: number
}

function toISTParts(date: Date): ISTParts {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000)
  return {
    weekday: WEEKDAYS[shifted.getUTCDay()]!,
    day: shifted.getUTCDate(),
    month: MONTHS[shifted.getUTCMonth()]!,
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  }
}

/** "Fri, 6 Nov" — in IST, whatever the host timezone is. */
export function formatNotificationDate(date: Date): string {
  const p = toISTParts(date)
  return `${p.weekday}, ${p.day} ${p.month}`
}

/** "4:30 pm" — in IST, 12-hour, no leading zero. */
export function formatNotificationTime(date: Date): string {
  const p = toISTParts(date)
  const suffix = p.hours < 12 ? 'am' : 'pm'
  const hour12 = p.hours % 12 === 0 ? 12 : p.hours % 12
  const minutes = p.minutes.toString().padStart(2, '0')
  return `${hour12}:${minutes} ${suffix}`
}

/** Long free text (a homework description, a reminder note) trimmed for an inbox row. */
export function excerpt(text: string, maxLength = 140): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) return collapsed
  // Cut on a word boundary so the row does not end mid-word.
  const cut = collapsed.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** "once a day at 9:00 am" — how a reminder repeats, in the client's words. */
export function describeReminderSchedule(frequency: string, times: readonly string[]): string {
  const formatted = times.map((t) => {
    // Stored as "HH:mm" wall-clock, already local to the client — format it as
    // written rather than pretending it is a UTC instant.
    const [h, m] = t.split(':')
    const hour = Number.parseInt(h ?? '', 10)
    if (Number.isNaN(hour)) return t
    const suffix = hour < 12 ? 'am' : 'pm'
    const hour12 = hour % 12 === 0 ? 12 : hour % 12
    return `${hour12}:${(m ?? '00').padStart(2, '0')} ${suffix}`
  })

  switch (frequency) {
    case 'once_daily':
      return formatted[0] ? `once a day at ${formatted[0]}` : 'once a day'
    case 'twice_daily':
      return formatted.length > 0 ? `twice a day (${formatted.join(', ')})` : 'twice a day'
    case 'thrice_daily':
      return formatted.length > 0 ? `three times a day (${formatted.join(', ')})` : 'three times a day'
    case 'as_needed':
      return 'whenever you need it'
    case 'off':
    default:
      return 'no set time'
  }
}

export function buildHomeworkNotification(input: {
  homeworkId: string
  description: string
}): NotificationDraft {
  return {
    kind: 'homework_assigned',
    title: 'New homework',
    body: excerpt(input.description),
    homeworkId: input.homeworkId,
  }
}

export function buildReminderNotification(input: {
  scheduleNote: string
  frequency: string
  times: readonly string[]
  homeworkId?: string | null
}): NotificationDraft {
  const when = describeReminderSchedule(input.frequency, input.times)
  return {
    kind: 'reminder_set',
    title: 'New reminder',
    body: `${excerpt(input.scheduleNote, 120)} — ${when}`,
    homeworkId: input.homeworkId ?? null,
  }
}

export function buildAppointmentBookedNotification(input: {
  appointmentId: string
  scheduledAt: Date
  /** Only used when a repeating booking created more than one session. */
  additionalSessions?: number
}): NotificationDraft {
  const extra = input.additionalSessions ?? 0
  const when = `${formatNotificationDate(input.scheduledAt)} at ${formatNotificationTime(input.scheduledAt)}`
  return {
    kind: 'appointment_booked',
    title: extra > 0 ? 'Appointments booked' : 'Appointment booked',
    body:
      extra > 0
        ? `Your therapist booked ${extra + 1} sessions, starting ${when}.`
        : `Your session is on ${when}.`,
    appointmentId: input.appointmentId,
  }
}

export function buildAppointmentRescheduledNotification(input: {
  appointmentId: string
  scheduledAt: Date
}): NotificationDraft {
  const when = `${formatNotificationDate(input.scheduledAt)} at ${formatNotificationTime(input.scheduledAt)}`
  return {
    kind: 'appointment_rescheduled',
    title: 'Appointment changed',
    body: `Your session has moved to ${when}.`,
    appointmentId: input.appointmentId,
  }
}

export function buildAppointmentCancelledNotification(input: {
  appointmentId: string
  scheduledAt: Date
}): NotificationDraft {
  const when = `${formatNotificationDate(input.scheduledAt)} at ${formatNotificationTime(input.scheduledAt)}`
  return {
    kind: 'appointment_cancelled',
    title: 'Appointment cancelled',
    body: `Your session on ${when} has been cancelled.`,
    appointmentId: input.appointmentId,
  }
}
