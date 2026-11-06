import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import {
  buildAppointmentBookedNotification,
  buildHomeworkNotification,
} from '@okuvu/shared-types';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    homework: { findMany: vi.fn() },
    reminder: { findMany: vi.fn() },
  },
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function mockNotification(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'ntf-1',
    user_id: 'user-1',
    kind: 'homework_assigned',
    title: 'New homework',
    body: 'Write down three things you noticed today.',
    homework_id: 'hw-1',
    appointment_id: null,
    read_at: null,
    created_at: new Date('2026-11-06T09:00:00.000Z'),
    ...overrides,
  };
}

describe('client notification inbox (GET /users/me/notifications)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns 401 when the authenticated subject has no User row', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/users/me/notifications' });

    expect(response.statusCode).toBe(401);
  });

  it('lists rows newest first with the full unread count, not the page count', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      mockNotification(),
      mockNotification({
        id: 'ntf-2',
        kind: 'appointment_booked',
        title: 'Appointment booked',
        body: 'Your session is on Tue, 24 Nov at 6:00 pm.',
        homework_id: null,
        appointment_id: 'ap-1',
        read_at: new Date('2026-11-05T10:00:00.000Z'),
      }),
    ] as never);
    // 40 unread overall while only 2 rows came back — the badge must read 40.
    vi.mocked(prisma.notification.count).mockResolvedValue(40 as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/notifications' });
    const body = response.json() as {
      notifications: Array<Record<string, unknown>>;
      unreadCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.unreadCount).toBe(40);
    expect(body.notifications).toHaveLength(2);
    expect(body.notifications[0]).toMatchObject({
      id: 'ntf-1',
      kind: 'homework_assigned',
      homeworkId: 'hw-1',
      appointmentId: null,
      readAt: null,
      createdAt: '2026-11-06T09:00:00.000Z',
    });
    expect(body.notifications[1]).toMatchObject({
      id: 'ntf-2',
      readAt: '2026-11-05T10:00:00.000Z',
      appointmentId: 'ap-1',
    });
  });

  it('scopes the query to the caller and honours limit and before', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.notification.count).mockResolvedValue(0 as never);

    const response = await app.inject({
      method: 'GET',
      url: '/users/me/notifications?limit=5&before=2026-11-06T09:00:00.000Z',
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: 'user-1',
          created_at: { lt: new Date('2026-11-06T09:00:00.000Z') },
        },
        take: 5,
      }),
    );
  });

  it('rejects a limit outside 1..100', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);

    for (const limit of ['0', '101', 'ten']) {
      const response = await app.inject({
        method: 'GET',
        url: `/users/me/notifications?limit=${limit}`,
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: { code: string } }).error.code).toBe('INVALID_LIMIT');
    }
  });

  it('rejects an unparseable before cursor', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/users/me/notifications?before=last-tuesday',
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('INVALID_BEFORE');
  });

  it('serves the badge count on its own route', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.notification.count).mockResolvedValue(3 as never);

    const response = await app.inject({
      method: 'GET',
      url: '/users/me/notifications/unread-count',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ unreadCount: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { user_id: 'user-1', read_at: null },
    });
  });
});

describe('marking notifications read', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('404s on a row that belongs to someone else or does not exist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/users/me/notifications/ntf-someone-else/read',
    });

    expect(response.statusCode).toBe(404);
    // The lookup must be scoped by owner, not just by id.
    expect(prisma.notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ntf-someone-else', user_id: 'user-1' } }),
    );
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('marks an unread row read once, and treats a second call as success', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(
      { id: 'ntf-1', read_at: null } as never,
    );
    vi.mocked(prisma.notification.update).mockResolvedValue(mockNotification() as never);

    const first = await app.inject({ method: 'POST', url: '/users/me/notifications/ntf-1/read' });
    expect(first.statusCode).toBe(200);
    expect(prisma.notification.update).toHaveBeenCalledTimes(1);

    // Already read: success, no second write.
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(
      { id: 'ntf-1', read_at: new Date('2026-11-06T09:05:00.000Z') } as never,
    );
    const second = await app.inject({ method: 'POST', url: '/users/me/notifications/ntf-1/read' });
    expect(second.statusCode).toBe(200);
    expect(prisma.notification.update).toHaveBeenCalledTimes(1);
  });

  it('reports how many rows read-all changed', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 7 } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/users/me/notifications/read-all',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, updated: 7 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', read_at: null },
      data: { read_at: expect.any(Date) },
    });
  });
});

describe('GET /users/me/homework — the list the inbox links into', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns every assignment, not just the newest active one', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([
      {
        id: 'hw-3',
        description: 'Third assignment',
        status: 'active',
        tool_id: 'box_breathing',
        assigned_at: new Date('2026-11-06T08:00:00.000Z'),
        tool: { label: 'Box breathing' },
      },
      {
        id: 'hw-2',
        description: 'Second assignment',
        status: 'active',
        tool_id: null,
        assigned_at: new Date('2026-11-05T08:00:00.000Z'),
        tool: null,
      },
      {
        id: 'hw-1',
        description: 'First assignment',
        status: 'completed',
        tool_id: null,
        assigned_at: new Date('2026-11-01T08:00:00.000Z'),
        tool: null,
      },
    ] as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([
      {
        id: 'rem-1',
        schedule_note: 'Practise before bed',
        frequency: 'once_daily',
        times: ['22:00'],
        homework_id: 'hw-3',
        tool: { label: 'Box breathing' },
      },
    ] as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/homework' });
    const body = response.json() as {
      homework: Array<Record<string, unknown>>;
      reminders: Array<Record<string, unknown>>;
    };

    expect(response.statusCode).toBe(200);
    expect(body.homework.map((h) => h.id)).toEqual(['hw-3', 'hw-2', 'hw-1']);
    expect(body.homework[0]).toMatchObject({
      toolId: 'box_breathing',
      toolLabel: 'Box breathing',
      assignedAt: '2026-11-06T08:00:00.000Z',
    });
    expect(body.reminders).toEqual([
      {
        id: 'rem-1',
        scheduleNote: 'Practise before bed',
        frequency: 'once_daily',
        times: ['22:00'],
        homeworkId: 'hw-3',
        toolLabel: 'Box breathing',
      },
    ]);
    // Own rows only.
    expect(prisma.homework.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { client_user_id: 'user-1' } }),
    );
  });

  it('401s without a User row', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/users/me/homework' });

    expect(response.statusCode).toBe(401);
  });
});

describe('the stored copy matches what the writers produce', () => {
  // Guards the seam between packages/shared-types (writers) and the stored row
  // the inbox renders: both sides must use the same builder output, so a
  // renaming here fails before a client sees a blank row.
  it('round-trips a homework draft through the API shape', () => {
    const draft = buildHomeworkNotification({ homeworkId: 'hw-1', description: 'Breathe slowly.' });
    expect(draft.title).toBe('New homework');
    expect(draft.body).toBe('Breathe slowly.');
    expect(draft.homeworkId).toBe('hw-1');
  });

  it('keeps appointment bodies absolute', () => {
    const draft = buildAppointmentBookedNotification({
      appointmentId: 'ap-1',
      scheduledAt: new Date('2026-11-24T12:30:00.000Z'),
    });
    expect(draft.body).toBe('Your session is on Tue, 24 Nov at 6:00 pm.');
  });
});
