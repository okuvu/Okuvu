import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Email is the delivery half of the client inbox: the therapist's action writes a
 * `Notification` row and this sender hangs off that same row. These tests pin the
 * parts a passing typecheck cannot see:
 *
 * 1. **The clinical text never leaves.** The inbox body is an excerpt of the
 *    therapist's note; the email must be logistics only, because mail is read on
 *    a lock screen and in shared inboxes. Asserted both ways: the row keeps the
 *    text, the payload does not contain it.
 * 2. **The row survives a mail failure.** A Brevo outage must not cost the bell
 *    entry, and must not surface as a failed form to the therapist.
 * 3. **One gate, both surfaces.** The appointment-reminders toggle already
 *    decided whether a row is written; email follows the row, so switching it
 *    off must silence the email too rather than leaving a second way through.
 */

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const {
  buildClientNotificationEmailCopy,
  formatSessionTime,
  sendClientNotificationEmail,
} = await import('@/lib/email');
const {
  notifyAppointmentBooked,
  notifyAppointmentCancelled,
  notifyHomeworkAssigned,
  notifyReminderSet,
} = await import('@/server/notifications');

type NotifyDb = Parameters<typeof notifyHomeworkAssigned>[0];

interface FakeUser {
  email: string | null;
  appointment_reminders_enabled: boolean;
  update_emails_enabled?: boolean;
  email_update_token?: string | null;
}

function makeDb(user: FakeUser | null) {
  // Email updates default on in the product, so every existing appointment test
  // keeps meaning what it meant; a test that checks the pause only overrides it.
  const row = user
    ? { update_emails_enabled: true, email_update_token: 'tok-1', ...user }
    : null;
  const findUnique = vi.fn().mockResolvedValue(row);
  const create = vi.fn().mockResolvedValue({ id: 'ntf_1' });
  // The daily cap is claimed with a conditional UPDATE; count 1 means "you have
  // not had today's message". A test that wants the cap to bite returns 0.
  const claim = vi.fn().mockResolvedValue({ count: 1 });
  const update = vi.fn().mockResolvedValue({});
  return {
    db: {
      user: { findUnique, updateMany: claim, update },
      notification: { create },
    } as unknown as NotifyDb,
    findUnique,
    create,
    claim,
    update,
  };
}

/** The JSON body the sender handed to Brevo. */
function sentPayload(): {
  to: { email: string }[];
  subject: string;
  htmlContent: string;
  sender: { email: string; name: string };
} {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toContain('api.brevo.com');
  return JSON.parse(String(init.body));
}

const CLINICAL_NOTE = 'Write down the three situations you avoided this week';

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_FROM_EMAIL = 'noreply@okuvu.in';
  process.env.BREVO_FROM_NAME = 'OKUVU';
});

describe('client notification email copy', () => {
  it('names the session time in IST for an appointment', () => {
    // 11:30 UTC is 5:00 pm IST — the screenshot time the therapist books.
    expect(formatSessionTime(new Date('2026-11-07T11:30:00.000Z'))).toBe('Sat 7 Nov, 5:00 pm IST');

    const copy = buildClientNotificationEmailCopy({
      kind: 'appointment_booked',
      scheduledAt: new Date('2026-11-07T11:30:00.000Z'),
    });
    expect(copy.subject).toBe('Your session on Okuvu is confirmed');
    expect(copy.htmlContent).toContain('Sat 7 Nov, 5:00 pm IST');
  });

  it('degrades to generic wording when a kind has no copy of its own', () => {
    const copy = buildClientNotificationEmailCopy({ kind: 'homework_assigned' });
    expect(copy.subject).toBe('Something new from your care team');
    expect(copy.htmlContent).not.toContain('homework');
  });

  it('falls back rather than printing an empty sentence for a future kind', () => {
    const copy = buildClientNotificationEmailCopy({ kind: 'something_new_later' });
    expect(copy.subject).toBe('Something new from your care team');
    expect(copy.htmlContent).toContain('something new for you');
  });

  it('always carries the emergency line so a reminder is never mistaken for a crisis channel', () => {
    const copy = buildClientNotificationEmailCopy({ kind: 'reminder_set' });
    expect(copy.htmlContent).toContain('call 112');
  });
});

describe('notifyHomeworkAssigned', () => {
  it('writes the inbox row with the therapist text and emails only a pointer', async () => {
    const { db, create } = makeDb({ email: 'client@example.com', appointment_reminders_enabled: true });

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_1',
      description: CLINICAL_NOTE,
    });

    // The row is the in-app copy and legitimately contains the note…
    const row = create.mock.calls[0][0].data;
    expect(row.kind).toBe('homework_assigned');
    expect(row.body).toContain('Write down the three situations');

    // …the email does not.
    const payload = sentPayload();
    expect(payload.to[0].email).toBe('client@example.com');
    // The owner's approved subject, and only that: no exercise name, no
    // therapist name, nothing that reads as clinical on a lock screen.
    expect(payload.subject).toBe('Something new in OKUVU');
    expect(payload.htmlContent).not.toContain('avoided this week');
    expect(payload.htmlContent).not.toContain('Write down');
    expect(payload.htmlContent).not.toContain('homework');
  });

  it('still records the row when the client has no email address on file', async () => {
    const { db, create } = makeDb({ email: null, appointment_reminders_enabled: true });

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_1',
      description: CLINICAL_NOTE,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the row when Brevo fails, and does not throw at the therapist', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const { db, create } = makeDb({ email: 'client@example.com', appointment_reminders_enabled: true });

    await expect(
      notifyHomeworkAssigned(db, {
        clientUserId: 'usr_1',
        homeworkId: 'hw_1',
        description: CLINICAL_NOTE,
      }),
    ).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps the row when the send throws instead of answering', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const { db, create } = makeDb({ email: 'client@example.com', appointment_reminders_enabled: true });

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_1',
      description: CLINICAL_NOTE,
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('skips entirely when there is no user row to notify', async () => {
    const { db, create } = makeDb(null);

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_1',
      description: CLINICAL_NOTE,
    });

    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('appointments', () => {
  const scheduledAt = new Date('2026-11-07T11:30:00.000Z');

  it('emails the booked session time', async () => {
    const { db } = makeDb({ email: 'client@example.com', appointment_reminders_enabled: true });

    await notifyAppointmentBooked(db, { clientUserId: 'usr_1', appointmentId: 'apt_1', scheduledAt });

    const payload = sentPayload();
    expect(payload.subject).toBe('Your session on Okuvu is confirmed');
    expect(payload.htmlContent).toContain('Sat 7 Nov, 5:00 pm IST');
  });

  it('carries the time on a cancellation so the client knows which one', async () => {
    const { db } = makeDb({ email: 'client@example.com', appointment_reminders_enabled: true });

    await notifyAppointmentCancelled(db, { clientUserId: 'usr_1', appointmentId: 'apt_1', scheduledAt });

    const payload = sentPayload();
    expect(payload.subject).toBe('Your session on Okuvu was cancelled');
    expect(payload.htmlContent).toContain('Sat 7 Nov, 5:00 pm IST');
  });

  it('sends nothing at all when the client switched appointment reminders off', async () => {
    const { db, create } = makeDb({ email: 'client@example.com', appointment_reminders_enabled: false });

    await notifyAppointmentBooked(db, { clientUserId: 'usr_1', appointmentId: 'apt_1', scheduledAt });

    // No row and no email: the toggle is the single gate, not a filter on one surface.
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not let the appointment toggle silence homework', async () => {
    const { db, create } = makeDb({ email: 'client@example.com', appointment_reminders_enabled: false });

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_1',
      description: 'Evening breathing',
    });

    expect(create).toHaveBeenCalledTimes(1);
    sentPayload();
  });

  it('does not email a reminder being set — only a real event does', async () => {
    const { db, create } = makeDb({ email: 'client@example.com', appointment_reminders_enabled: true });

    await notifyReminderSet(db, {
      clientUserId: 'usr_1',
      scheduleNote: 'Evening breathing',
      frequency: 'once_daily',
      times: ['20:00'],
    });

    // The inbox row is still written; the mailbox is left alone.
    expect(create).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendClientNotificationEmail without a key', () => {
  it('logs and reports not-sent instead of throwing in local dev', async () => {
    delete process.env.BREVO_API_KEY;

    await expect(
      sendClientNotificationEmail({ to: 'client@example.com', kind: 'homework_assigned' }),
    ).resolves.toEqual({ sent: false });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
