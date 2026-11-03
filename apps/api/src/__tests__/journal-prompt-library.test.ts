import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import {
  JOURNAL_PROMPT_LIBRARY,
  JOURNAL_PROMPT_LIBRARY_VERSION,
  promptsForEmotion,
  validatePromptLibrary,
  type LibraryPrompt,
} from '../agents/journal-prompt/prompt-library.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    journalEntry: { create: vi.fn(), findMany: vi.fn() },
  },
}));

/**
 * The "Get a prompt" button used to spend a live model call per tap, inside a
 * 10-second client timeout, and swallowed every failure — so a slow or failed
 * answer looked like a dead button and nothing ever appeared. It now serves a
 * fixed, reviewable library, which is both the reason this file exists and the
 * property it locks down: the library must always pass its own content rules,
 * and the route must always answer with real prompts.
 */
describe('journal prompt library — content rules', () => {
  it('passes its own validator', () => {
    expect(validatePromptLibrary()).toEqual([]);
  });

  it('covers every emotion group and the mood-less pool', () => {
    const groups = new Set(JOURNAL_PROMPT_LIBRARY.map((p) => p.group));
    for (const group of ['anxious', 'sad', 'angry', 'overwhelmed', 'numb', 'calm', 'hopeful', 'other', 'any']) {
      expect(groups.has(group as LibraryPrompt['group'])).toBe(true);
    }
  });

  it('has enough prompts per group that a client does not see the same one twice in a sitting', () => {
    const counts = new Map<string, number>();
    for (const p of JOURNAL_PROMPT_LIBRARY) counts.set(p.group, (counts.get(p.group) ?? 0) + 1);
    for (const [group, count] of counts) {
      expect(count, `group ${group}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('rejects a duplicate id', () => {
    const broken: LibraryPrompt[] = [
      ...JOURNAL_PROMPT_LIBRARY,
      { id: 'any-01', group: 'any', text: 'A different sentence entirely?' },
    ];
    expect(validatePromptLibrary(broken)).toContain('duplicate_id:any-01');
  });

  it('rejects a duplicate sentence in two groups', () => {
    const broken: LibraryPrompt[] = [
      ...JOURNAL_PROMPT_LIBRARY,
      { id: 'dup-01', group: 'sad', text: JOURNAL_PROMPT_LIBRARY[0].text },
    ];
    expect(validatePromptLibrary(broken).some((v) => v.startsWith('duplicate_text:'))).toBe(true);
  });

  it('rejects a prompt that names a diagnosis or a crisis topic', () => {
    const broken: LibraryPrompt[] = [
      ...JOURNAL_PROMPT_LIBRARY,
      { id: 'bad-01', group: 'sad', text: 'What do you think caused your depression?' },
    ];
    const violations = validatePromptLibrary(broken);
    expect(violations.some((v) => v.startsWith('banned_term:bad-01'))).toBe(true);
  });

  it('rejects an empty group, so no mood ever gets an empty answer', () => {
    const withoutNumb = JOURNAL_PROMPT_LIBRARY.filter((p) => p.group !== 'numb');
    expect(validatePromptLibrary(withoutNumb)).toContain('empty_group:numb');
  });

  it('rejects a paragraph dressed as a prompt', () => {
    const broken: LibraryPrompt[] = [
      ...JOURNAL_PROMPT_LIBRARY,
      {
        id: 'long-01',
        group: 'calm',
        text: 'One. Two. Three. Four.',
      },
    ];
    expect(validatePromptLibrary(broken)).toContain('multiple_sentences:long-01');
  });
});

describe('promptsForEmotion', () => {
  it('leads with the mood the client picked', () => {
    const prompts = promptsForEmotion(undefined, { emotion: 'anxious' });
    expect(prompts[0].group).toBe('anxious');
    expect(prompts.filter((p) => p.group === 'anxious')).toHaveLength(
      JOURNAL_PROMPT_LIBRARY.filter((p) => p.group === 'anxious').length,
    );
  });

  it('always adds the general pool, so a tap from any mood has variety', () => {
    const prompts = promptsForEmotion(undefined, { emotion: 'hopeful' });
    expect(prompts.some((p) => p.group === 'any')).toBe(true);
  });

  it('returns the general pool alone when no mood was picked', () => {
    const prompts = promptsForEmotion(undefined, { emotion: null });
    expect(prompts.every((p) => p.group === 'any')).toBe(true);
    expect(prompts.length).toBeGreaterThan(0);
  });

  it('falls back to the general pool for an unknown mood rather than an empty list', () => {
    const prompts = promptsForEmotion(undefined, { emotion: 'ecstatic' });
    expect(prompts).toHaveLength(JOURNAL_PROMPT_LIBRARY.filter((p) => p.group === 'any').length);
  });

  it('is deterministic for a given seed and moves with it', () => {
    const a = promptsForEmotion(undefined, { emotion: 'sad', seed: 0 }).map((p) => p.id);
    const b = promptsForEmotion(undefined, { emotion: 'sad', seed: 0 }).map((p) => p.id);
    const c = promptsForEmotion(undefined, { emotion: 'sad', seed: 3 }).map((p) => p.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // Same set, different order — the seed shifts rather than drops.
    expect([...a].sort()).toEqual([...c].sort());
  });
});

describe('GET /journal/prompts', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns real prompts, newest library version, and the review state', async () => {
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/journal/prompts' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version).toBe(JOURNAL_PROMPT_LIBRARY_VERSION);
    expect(body.review.reviewer).toBe('Dr Shubhangi Goswami');
    expect(Array.isArray(body.prompts)).toBe(true);
    expect(body.prompts.length).toBeGreaterThan(0);
    for (const prompt of body.prompts) {
      expect(typeof prompt.id).toBe('string');
      expect(prompt.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('filters by the mood in the query string', async () => {
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/journal/prompts?emotion=angry' });

    expect(response.statusCode).toBe(200);
    const ids = response.json().prompts.map((p: { id: string }) => p.id);
    expect(ids).toContain('ang-01');
  });

  it('ignores an unknown mood instead of answering with nothing', async () => {
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/journal/prompts?emotion=elated' });

    expect(response.statusCode).toBe(200);
    expect(response.json().prompts.length).toBeGreaterThan(0);
  });

  it('is served without a model call — no budget gate, no token spend', async () => {
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/journal/prompts' });

    // 200 rather than a 429 that a spent daily budget would produce for
    // POST /journal/prompt: reading a fixed sentence costs nothing.
    expect(response.statusCode).toBe(200);
  });

  describe('auth — bypass disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({ method: 'GET', url: '/journal/prompts' });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});
