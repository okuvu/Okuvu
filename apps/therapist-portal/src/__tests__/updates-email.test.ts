import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Step 7 — the Updates-list emails.
 *
 * Four promises are checked here, and each one is a promise the owner made in
 * words: mail only when something happens, never more than one a day, nothing
 * personal in the message, and a working way to stop it.
 *
 * The row is always written first. Everything below is about what happens to
 * the mailbox afterwards, because a client missing an update is a worse failure
 * than a client missing an email.
 */

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { buildClientUpdateEmailCopy, sendClientUpdateEmail } = await import('@/lib/email');
const { notifyHomeworkAssigned, notifyReminderSet, notifyTreasureBoxNote } = await import(
  '@/server/notifications'
);

type NotifyDb = Parameters<typeof notifyHomeworkAssigned>[0];

interface FakeUser {
  email: string | null;
  appointment_reminders_enabled: boolean;
  update_emails_enabled: boolean;
  email_update_token: string | null;
}

function makeDb(user: Partial<FakeUser> | null, options: { alreadyEmailedToday?: boolean } = {}) {
  const row = user
    ? {
        appointment_reminders_enabled: true,
        update_emails_enabled: true,
        email_update_token: 'tok-1',
        ...user,
      }
    : null;
  const findUnique = vi.fn().mockResolvedValue(row);
  const create = vi.fn().mockResolvedValue({ id: 'ntf_1' });
  const updateMany = vi
    .fn()
    .mockResolvedValue({ count: options.alreadyEmailedToday ? 0 : 1 });
  const update = vi.fn().mockResolvedValue({});
  return {
    db: {
      user: { findUnique, updateMany, update },
      notification: { create },
    } as unknown as NotifyDb,
    create,
    updateMany,
    update,
  };
}

function sentPayload() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toContain('api.brevo.com');
  return JSON.parse(String(init.body)) as {
    to: { email: string }[];
    subject: string;
    htmlContent: string;
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
  process.env.BREVO_API_KEY = 'test-key';
  process.env.OKUVU_PUBLIC_URL = 'https://portal.okuvu.in';
});

describe('the approved client email copy', () => {
  it('is the approved subject and body, with a working pause link and nothing else', () => {
    const copy = buildClientUpdateEmailCopy('https://portal.okuvu.in/api/updates/pause?t=tok-1');

    expect(copy.subject).toBe('Something new in OKUVU');
    expect(copy.htmlContent).toContain(
      "there's something waiting for you in the OKUVU app, whenever you're ready. Open the app to see it.",
    );
    expect(copy.htmlContent).toContain('Pause these emails');
    expect(copy.htmlContent).toContain('/api/updates/pause?t=tok-1');

    // Nothing personal, nothing clinical, no exercise name, no therapist name.
    for (const forbidden of ['homework', 'worksheet', 'Treasure', 'note from', 'session', 'your therapist']) {
      expect(copy.htmlContent.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('reports not-sent rather than throwing when there is no Brevo key', async () => {
    delete process.env.BREVO_API_KEY;

    await expect(
      sendClientUpdateEmail({ to: 'client@example.com', pauseUrl: 'https://example.test/p' }),
    ).resolves.toEqual({ sent: false });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('when an update email goes out', () => {
  it('emails once when a therapist assigns an exercise', async () => {
    const { db, create, updateMany } = makeDb({ email: 'client@example.com' });

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_1',
      description: 'Practise the thought record before bed',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const payload = sentPayload();
    expect(payload.to[0].email).toBe('client@example.com');
    expect(payload.subject).toBe('Something new in OKUVU');
    // The cap is claimed before the send, so two events in one second cannot
    // both mail.
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect((updateMany.mock.calls[0][0] as any).data.last_update_email_at).toBeInstanceOf(Date);
  });

  it('writes the waiting note row with the approved line and keeps the words off the row', async () => {
    const { db, create } = makeDb({ email: 'client@example.com' });

    await notifyTreasureBoxNote(db, {
      clientUserId: 'usr_1',
      noteBody: 'You got through the week. That counted.',
    });

    const row = (create.mock.calls[0][0] as any).data;
    expect(row.kind).toBe('treasure_note_waiting');
    expect(row.title).toBe('Your therapist sent you something for your Treasure Box.');
    // The row a lock screen could preview carries none of the therapist's words.
    expect(row.body).toBe('');
    expect(row.note_body).toBe('You got through the week. That counted.');

    const payload = sentPayload();
    expect(payload.htmlContent).not.toContain('You got through the week');
  });

  it('sends nothing else the same day, but still records the update', async () => {
    const { db, create, updateMany } = makeDb(
      { email: 'client@example.com' },
      { alreadyEmailedToday: true },
    );

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_2',
      description: 'Second assignment of the day',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the client paused email, and still records the update', async () => {
    const { db, create, updateMany } = makeDb({
      email: 'client@example.com',
      update_emails_enabled: false,
    });

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_3',
      description: 'Something to try this week',
    });

    expect(create).toHaveBeenCalledTimes(1);
    // No claim is even attempted: the preference is the gate, not a filter after
    // the fact, so pausing does not silently consume the day's one message.
    expect(updateMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never mints a new pause token once one exists', async () => {
    const { db, update } = makeDb({ email: 'client@example.com', email_update_token: 'stable' });

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_4',
      description: 'A small thing',
    });

    const payload = sentPayload();
    expect(payload.htmlContent).toContain('t=stable');
    expect(update).not.toHaveBeenCalled();
  });

  it('mints the pause token on the first email so the footer link works', async () => {
    const { db, update } = makeDb({ email: 'client@example.com', email_update_token: null });

    await notifyHomeworkAssigned(db, {
      clientUserId: 'usr_1',
      homeworkId: 'hw_5',
      description: 'A small thing',
    });

    const minted = (update.mock.calls[0][0] as any).data.email_update_token as string;
    expect(minted).toMatch(/[0-9a-f-]{36}/);
    expect(sentPayload().htmlContent).toContain(`t=${minted}`);
  });

  it('does not email a reminder, which is a schedule rather than an event', async () => {
    const { db, create } = makeDb({ email: 'client@example.com' });

    await notifyReminderSet(db, {
      clientUserId: 'usr_1',
      scheduleNote: 'Evening breathing',
      frequency: 'once_daily',
      times: ['20:00'],
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the row when the send fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const { db, create } = makeDb({ email: 'client@example.com' });

    await expect(
      notifyHomeworkAssigned(db, {
        clientUserId: 'usr_1',
        homeworkId: 'hw_6',
        description: 'A small thing',
      }),
    ).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledTimes(1);
  });
});
