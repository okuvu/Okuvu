import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { entryById } from '@okuvu/shared-types/worksheets';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets';
import { buildApp } from '../app.js';
import { WORKSHEET_HELP_RULES, buildWorksheetHelpRequest } from '../agents/worksheet-help/prompts.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    toolRegistryEntry: { findUnique: vi.fn() },
    safetyState: { findUnique: vi.fn() },
  },
}));

const mockGenerateContent = vi.hoisted(() => vi.fn());
vi.mock('../lib/generate-content.js', () => ({ generateContent: mockGenerateContent }));

const mockA9PostReview = vi.hoisted(() => vi.fn());
vi.mock('../agents/a9-post/agent.js', () => ({ a9PostReview: mockA9PostReview }));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function rowFor(toolId: string) {
  const entry = entryById(toolId) as CatalogueEntry;
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

function approved() {
  return { decision: 'APPROVED', violation_type: null, confidence: 'high', notes: null };
}

describe('the worksheet-help rules', () => {
  it('forbids each thing the owner ruled out', () => {
    expect(WORKSHEET_HELP_RULES).toMatch(/never:[\s\S]*write, draft, complete or suggest an answer/i);
    expect(WORKSHEET_HELP_RULES).toContain('another way to see it');
    expect(WORKSHEET_HELP_RULES).toMatch(/give advice/i);
    expect(WORKSHEET_HELP_RULES).toMatch(/diagnosis/i);
    expect(WORKSHEET_HELP_RULES).toMatch(/promise/i);
  });

  it('asks for one of the three permitted things and nothing else', () => {
    expect(WORKSHEET_HELP_RULES).toMatch(/explain/i);
    expect(WORKSHEET_HELP_RULES).toMatch(/encourage/i);
    expect(WORKSHEET_HELP_RULES).toMatch(/open question/i);
  });

  it('builds a request from the step, not from the client\'s answers', () => {
    const request = buildWorksheetHelpRequest({
      worksheetLabel: 'Thought record',
      stepPrompt: 'What went through your mind?',
      stepHelper: 'The thought, in your own words.',
      question: 'Do I write the whole story?',
    });

    expect(request).toContain('Thought record');
    expect(request).toContain('What went through your mind?');
    expect(request).toContain('Do I write the whole story?');
    // No answer field is part of the request shape at all.
    expect(request).not.toContain('answers');
  });
});

describe('POST /worksheets/:toolId/help — reviewed before it is shown', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const { prisma } = await import('../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(rowFor('ws_thought_record') as any);
    vi.mocked(prisma.safetyState.findUnique).mockResolvedValue({ safety_state_current: 'S1' } as any);
    mockGenerateContent.mockResolvedValue({
      text: 'This step asks you to notice the thought that went through your mind. What was the first thing that came up?',
      fallbackUsed: false,
    });
    mockA9PostReview.mockResolvedValue(approved());
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns approved help', async () => {
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_thought_record/help',
      payload: { stepId: 'what_happened' },
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as any).text).toContain('This step asks you');
    expect(mockA9PostReview).toHaveBeenCalledTimes(1);
  });

  it('refuses a draft the reviewer blocks, and shows nothing of it', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Maybe another way to see it is that your boss is right and you should try harder.',
      fallbackUsed: false,
    });
    mockA9PostReview.mockResolvedValue({
      decision: 'BLOCKED',
      violation_type: 'cognitive_reframe',
      confidence: 'high',
      notes: null,
    });
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_thought_record/help',
      payload: { stepId: 'what_happened' },
    });

    expect(res.statusCode).toBe(503);
    expect((res.json() as any).error.code).toBe('HELP_UNAVAILABLE');
    expect(res.body).not.toContain('your boss is right');
  });

  it('refuses when the review itself fails', async () => {
    mockA9PostReview.mockRejectedValue(new Error('review unavailable'));
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_thought_record/help',
      payload: { stepId: 'what_happened' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('This step asks you');
  });

  it('refuses when the model is unavailable, rather than inventing a line', async () => {
    mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true });
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_thought_record/help',
      payload: { stepId: 'what_happened' },
    });

    expect(res.statusCode).toBe(503);
  });

  it('refuses a step that is not part of the worksheet', async () => {
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_thought_record/help',
      payload: { stepId: 'my_childhood' },
    });

    expect(res.statusCode).toBe(404);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('never offers help inside the safety plan', async () => {
    const { prisma } = await import('../lib/prisma.js');
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(rowFor('ws_safety_plan') as any);
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_safety_plan/help',
      payload: { stepId: 'signs' },
    });

    expect(res.statusCode).toBe(403);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
