import { describe, it, expect } from 'vitest';
import {
  buildAppointmentBookedNotification,
  buildAppointmentCancelledNotification,
  buildAppointmentRescheduledNotification,
  buildHomeworkNotification,
  buildReminderNotification,
  describeReminderSchedule,
  excerpt,
  formatNotificationDate,
  formatNotificationTime,
} from '../notifications';

describe('excerpt()', () => {
  it('leaves short text alone and collapses whitespace', () => {
    expect(excerpt('  Breathe\n  slowly  ')).toBe('Breathe slowly');
  });

  it('cuts long text on a word boundary with an ellipsis', () => {
    const long = 'Write down three things that went ' + 'reasonably '.repeat(20);
    const result = excerpt(long, 40);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(41);
    expect(result).not.toContain('reasonab…');
  });

  it('hard-cuts when there is no space to break on', () => {
    const result = excerpt('x'.repeat(200), 20);
    expect(result).toBe(`${'x'.repeat(20)}…`);
  });
});

describe('IST date and time formatting', () => {
  it('renders a UTC instant in IST, not UTC', () => {
    // 12:30 UTC is 18:00 IST — the same session, later in the day.
    const at = new Date('2026-11-24T12:30:00.000Z');
    expect(formatNotificationDate(at)).toBe('Tue, 24 Nov');
    expect(formatNotificationTime(at)).toBe('6:00 pm');
  });

  it('rolls the date forward when IST has already crossed midnight', () => {
    // 20:00 UTC on the 5th is 01:30 IST on the 6th.
    const at = new Date('2026-11-05T20:00:00.000Z');
    expect(formatNotificationDate(at)).toBe('Fri, 6 Nov');
    expect(formatNotificationTime(at)).toBe('1:30 am');
  });

  it('renders noon as 12:00 pm and midnight as 12:00 am', () => {
    expect(formatNotificationTime(new Date('2026-11-06T06:30:00.000Z'))).toBe('12:00 pm');
    // 18:30 UTC = 00:00 IST next day.
    expect(formatNotificationTime(new Date('2026-11-06T18:30:00.000Z'))).toBe('12:00 am');
  });
});

describe('describeReminderSchedule()', () => {
  it('describes a single daily time in 12-hour form', () => {
    expect(describeReminderSchedule('once_daily', ['09:00'])).toBe('once a day at 9:00 am');
    expect(describeReminderSchedule('once_daily', ['21:15'])).toBe('once a day at 9:15 pm');
  });

  it('lists every time for multi-daily frequencies', () => {
    expect(describeReminderSchedule('twice_daily', ['08:00', '20:00'])).toBe(
      'twice a day (8:00 am, 8:00 pm)',
    );
    expect(describeReminderSchedule('thrice_daily', ['08:00', '13:00', '20:00'])).toBe(
      'three times a day (8:00 am, 1:00 pm, 8:00 pm)',
    );
  });

  it('falls back to a readable phrase for off and as-needed', () => {
    expect(describeReminderSchedule('off', [])).toBe('no set time');
    expect(describeReminderSchedule('as_needed', [])).toBe('whenever you need it');
    // An unknown frequency must not print as a raw enum value in the client's inbox.
    expect(describeReminderSchedule('every_fortnight', [])).toBe('no set time');
  });
});

describe('notification drafts', () => {
  const at = new Date('2026-11-24T12:30:00.000Z');

  it('builds a homework notification pointing at the assignment', () => {
    const draft = buildHomeworkNotification({
      homeworkId: 'hw-1',
      description: 'Write down three things you noticed today.',
    });
    expect(draft).toEqual({
      kind: 'homework_assigned',
      title: 'New homework',
      body: 'Write down three things you noticed today.',
      homeworkId: 'hw-1',
    });
  });

  it('carries the homework link through a reminder', () => {
    const draft = buildReminderNotification({
      scheduleNote: 'Practise box breathing before bed',
      frequency: 'once_daily',
      times: ['22:00'],
      homeworkId: 'hw-1',
    });
    expect(draft.kind).toBe('reminder_set');
    expect(draft.homeworkId).toBe('hw-1');
    expect(draft.body).toBe('Practise box breathing before bed — once a day at 10:00 pm');
  });

  it('says "session is on" for a single booked appointment', () => {
    const draft = buildAppointmentBookedNotification({ appointmentId: 'ap-1', scheduledAt: at });
    expect(draft.title).toBe('Appointment booked');
    expect(draft.body).toBe('Your session is on Tue, 24 Nov at 6:00 pm.');
    expect(draft.appointmentId).toBe('ap-1');
  });

  it('summarises a repeating booking instead of writing N rows', () => {
    const draft = buildAppointmentBookedNotification({
      appointmentId: 'ap-1',
      scheduledAt: at,
      additionalSessions: 3,
    });
    expect(draft.title).toBe('Appointments booked');
    expect(draft.body).toBe('Your therapist booked 4 sessions, starting Tue, 24 Nov at 6:00 pm.');
  });

  it('states the new time on a reschedule', () => {
    const draft = buildAppointmentRescheduledNotification({ appointmentId: 'ap-2', scheduledAt: at });
    expect(draft.title).toBe('Appointment changed');
    expect(draft.body).toBe('Your session has moved to Tue, 24 Nov at 6:00 pm.');
  });

  it('names the cancelled slot', () => {
    const draft = buildAppointmentCancelledNotification({ appointmentId: 'ap-3', scheduledAt: at });
    expect(draft.title).toBe('Appointment cancelled');
    expect(draft.body).toBe('Your session on Tue, 24 Nov at 6:00 pm has been cancelled.');
  });

  it('never writes a relative day into the stored body', () => {
    // The body is authored once and stored; "tomorrow" would be wrong by the
    // time the client reads it. Every builder must carry an absolute date.
    const drafts = [
      buildAppointmentBookedNotification({ appointmentId: 'a', scheduledAt: at }),
      buildAppointmentRescheduledNotification({ appointmentId: 'b', scheduledAt: at }),
      buildAppointmentCancelledNotification({ appointmentId: 'c', scheduledAt: at }),
    ];
    for (const draft of drafts) {
      expect(draft.body).not.toMatch(/\btoday\b|\btomorrow\b|\byesterday\b/i);
    }
  });
});
