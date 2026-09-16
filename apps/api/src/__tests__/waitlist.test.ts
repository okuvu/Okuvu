import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    waitlistEntry: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../lib/email.js', () => ({
  sendWaitlistConfirmationEmail: vi.fn(),
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  const { sendWaitlistConfirmationEmail } = await import('../lib/email.js');
  return { prisma, sendWaitlistConfirmationEmail };
}

describe('POST /waitlist', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    process.env = { ...ORIGINAL_ENV };
    app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/waitlist',
      payload: { email: 'someone@example.com' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('saves the entry and reports confirmation_sent from the email helper', async () => {
    const { prisma, sendWaitlistConfirmationEmail } = await importMocks();
    vi.mocked(prisma.waitlistEntry.create).mockResolvedValue({} as any);
    vi.mocked(sendWaitlistConfirmationEmail).mockResolvedValue({ sent: true });
    app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/waitlist',
      payload: { email: 'someone@example.com', phone_number: '+919999999999' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, confirmation_sent: true });
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
      data: { email: 'someone@example.com', phone_number: '+919999999999' },
    });
    expect(sendWaitlistConfirmationEmail).toHaveBeenCalledWith({ to: 'someone@example.com' });
  });

  it('omits phone_number when not provided', async () => {
    const { prisma, sendWaitlistConfirmationEmail } = await importMocks();
    vi.mocked(prisma.waitlistEntry.create).mockResolvedValue({} as any);
    vi.mocked(sendWaitlistConfirmationEmail).mockResolvedValue({ sent: false });
    app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/waitlist',
      payload: { email: 'someone@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, confirmation_sent: false });
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
      data: { email: 'someone@example.com', phone_number: null },
    });
  });

  it('rejects an invalid email with 400 and never calls the email helper', async () => {
    const { prisma, sendWaitlistConfirmationEmail } = await importMocks();
    app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/waitlist',
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_EMAIL', message: 'A valid email is required' },
    });
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
    expect(sendWaitlistConfirmationEmail).not.toHaveBeenCalled();
  });

  it('rejects a missing email with 400', async () => {
    app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/waitlist',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a malformed phone_number with 400 and never calls create', async () => {
    const { prisma, sendWaitlistConfirmationEmail } = await importMocks();
    app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/waitlist',
      payload: { email: 'someone@example.com', phone_number: 'not-a-phone' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PHONE_FORMAT');
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
    expect(sendWaitlistConfirmationEmail).not.toHaveBeenCalled();
  });
});
