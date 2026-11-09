import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { entryById } from '@okuvu/shared-types/worksheets';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets';
import { appRouter } from '../routers/_app';

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const CLIENT_ID = 'client_1';

function catalogueRow() {
  const entry = entryById('ws_safety_plan') as CatalogueEntry;
  return {
    tool_id: entry.tool_id,
    kind: 'worksheet',
    status: entry.status,
    label: entry.label,
    summary: entry.summary,
    section: entry.section,
    access_mode: entry.access_mode,
    load_level: entry.load_level,
    est_minutes: entry.est_minutes,
    library_group: entry.library_group ?? null,
    content_en: entry.content_en,
    content_hi: entry.content_hi,
    therapy_modality: entry.therapy_modality,
    therapist_note: entry.therapist_note,
  };
}

interface Overrides {
  link?: unknown;
  plan?: unknown;
  entry?: unknown;
}

function buildPrisma(overrides: Overrides = {}) {
  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: {
      findFirst: vi.fn().mockResolvedValue('link' in overrides ? overrides.link : { id: 'tc_1' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'tc_1' }),
    },
    toolRegistryEntry: {
      findUnique: vi.fn().mockResolvedValue('entry' in overrides ? overrides.entry : catalogueRow()),
    },
    safetyPlan: {
      findUnique: vi.fn().mockResolvedValue('plan' in overrides ? overrides.plan : null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        updated_at: new Date('2026-11-09T12:00:00Z'),
        ...data,
      })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({
        updated_at: new Date('2026-11-09T12:30:00Z'),
        ...data,
      })),
    },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
}

function callerFor(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
    prisma,
    headers: new Headers(),
  });
}

describe('safetyPlan router — only the client\'s own linked therapist', () => {
  beforeEach(() => {
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  it('refuses a therapist who is not linked to the client', async () => {
    const prisma = buildPrisma({ link: null });

    await expect(callerFor(prisma).safetyPlan.get({ clientId: CLIENT_ID })).rejects.toThrow(
      /not linked to your caseload/,
    );
  });

  it('asks for a live link, not merely an assignment that once existed', async () => {
    const prisma = buildPrisma();
    await callerFor(prisma).safetyPlan.get({ clientId: CLIENT_ID });

    const args = (prisma.therapistClient.findFirst as any).mock.calls[0][0];
    expect(args.where).toEqual({
      therapist_id: THERAPIST.id,
      client_user_id: CLIENT_ID,
      ended_at: null,
    });
  });

  it('refuses a save from a therapist who is not linked', async () => {
    const prisma = buildPrisma({ link: null });

    await expect(
      callerFor(prisma).safetyPlan.save({
        clientId: CLIENT_ID,
        parts: [{ id: 'signs', text: 'not sleeping' }],
      }),
    ).rejects.toThrow(/not linked to your caseload/);
    expect(prisma.safetyPlan.create).not.toHaveBeenCalled();
  });
});

describe('safetyPlan router — the seven approved parts', () => {
  beforeEach(() => {
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  it('serves seven parts in the approved order, with the questions and the central helplines', async () => {
    const prisma = buildPrisma();
    const view = await callerFor(prisma).safetyPlan.get({ clientId: CLIENT_ID });

    expect(view.parts.map((p) => p.id)).toEqual([
      'signs',
      'on_my_own',
      'people_places',
      'ask_for_help',
      'professional',
      'safer_surroundings',
      'one_reason',
    ]);
    expect(view.parts[0].therapistPrompt).toContain('What thoughts, feelings, situations');
    expect(view.helplines.map((h) => h.name)).toEqual([
      'Tele-MANAS',
      'Vandrevala Foundation',
      'Emergency services',
      'SNEHA, Chennai',
      'iCall (TISS)',
    ]);
    expect(view.exists).toBe(false);
  });

  it('creates a plan the first time, recording who wrote it', async () => {
    const prisma = buildPrisma();

    const result = await callerFor(prisma).safetyPlan.save({
      clientId: CLIENT_ID,
      parts: [
        { id: 'signs', text: 'not sleeping\nsnapping at people' },
        { id: 'ask_for_help', text: 'Meera, +919000000000' },
        { id: 'one_reason', text: 'my sister' },
      ],
      therapistContact: 'Reach me 10am-6pm',
    });

    expect(result).toMatchObject({ saved: true, created: true });
    const createArgs = (prisma.safetyPlan.create as any).mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      user_id: CLIENT_ID,
      created_by_therapist_id: THERAPIST.id,
      therapist_contact: 'Reach me 10am-6pm',
    });
    // Lines become the catalogue's answer shape, keyed by the part ids.
    expect(createArgs.data.answers.signs).toEqual([
      { item: 'not sleeping' },
      { item: 'snapping at people' },
    ]);
    expect(createArgs.data.answers.ask_for_help).toEqual([
      { name: 'Meera', phone: '+919000000000' },
    ]);
    expect(createArgs.data.answers.one_reason).toBe('my sister');
  });

  it('updates the existing plan rather than creating a second one', async () => {
    const prisma = buildPrisma({ plan: { id: 'plan_1', answers: {}, therapist_contact: null } });

    const result = await callerFor(prisma).safetyPlan.save({
      clientId: CLIENT_ID,
      parts: [{ id: 'signs', text: 'not sleeping' }],
    });

    expect(result).toMatchObject({ saved: true, created: false });
    expect(prisma.safetyPlan.create).not.toHaveBeenCalled();
    const updateArgs = (prisma.safetyPlan.update as any).mock.calls[0][0];
    expect(updateArgs.where).toEqual({ user_id: CLIENT_ID });
    expect(updateArgs.data.updated_by_therapist_id).toBe(THERAPIST.id);
  });

  it('refuses an empty plan, so the client never gets a card with nothing on it', async () => {
    const prisma = buildPrisma();

    await expect(
      callerFor(prisma).safetyPlan.save({ clientId: CLIENT_ID, parts: [{ id: 'signs', text: '   ' }] }),
    ).rejects.toThrow(/at least one part/);
    expect(prisma.safetyPlan.create).not.toHaveBeenCalled();
  });

  it('refuses a part id the approved plan does not have', async () => {
    const prisma = buildPrisma();

    await expect(
      callerFor(prisma).safetyPlan.save({
        clientId: CLIENT_ID,
        parts: [{ id: 'how_i_feel_about_my_mother', text: 'x' }],
      }),
    ).rejects.toThrow(/no part called/);
  });
});
