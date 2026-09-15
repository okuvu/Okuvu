import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateJournalPrompt } from '../agents/journal-prompt/agent.js';
import { getFallbackJournalPrompt } from '../agents/journal-prompt/fallback-prompts.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => {
  return {
    generateContent: mockGenerateContent,
    DEFAULT_MAX_OUTPUT_TOKENS: 250,
    DEFAULT_TIMEOUT_MS: 10_000,
  };
});

const EMPTY_MEMORY = {
  life_context: [],
  current_stressors: [],
  recurring_themes: [],
  what_helps: [],
  what_doesnt_help: [],
  significant_events: [],
  emotional_baseline: null,
  session_count: 0,
};

describe('generateJournalPrompt (J2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the LLM-generated prompt on success', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ prompt: 'What made you smile today?' }),
      fallbackUsed: false,
    });

    const result = await generateJournalPrompt(null);

    expect(result).toBe('What made you smile today?');
  });

  it('falls back to a curated prompt when the LLM call throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('network error'));

    const result = await generateJournalPrompt(null);

    expect(result).toBe(getFallbackJournalPrompt());
  });

  it('falls back to a curated prompt when generateContent reports fallbackUsed', async () => {
    mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true });

    const result = await generateJournalPrompt(null);

    expect(result).toBe(getFallbackJournalPrompt());
  });

  it('falls back to a curated prompt on unparseable JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not json', fallbackUsed: false });

    const result = await generateJournalPrompt(null);

    expect(result).toBe(getFallbackJournalPrompt());
  });

  it('falls back to a curated prompt when the prompt field is missing', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({}), fallbackUsed: false });

    const result = await generateJournalPrompt(null);

    expect(result).toBe(getFallbackJournalPrompt());
  });

  it('injects recurring_themes into the system instruction when UserMemory exists', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ prompt: 'Reflect on your week.' }),
      fallbackUsed: false,
    });

    await generateJournalPrompt({
      ...EMPTY_MEMORY,
      recurring_themes: ['work stress', 'sleep trouble'],
      session_count: 3,
    });

    const call = mockGenerateContent.mock.calls[0][0];
    expect(call.systemInstruction).toContain('work stress');
    expect(call.systemInstruction).toContain('sleep trouble');
  });

  it('uses "null" themes when there is no UserMemory yet', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ prompt: 'Reflect on your week.' }),
      fallbackUsed: false,
    });

    await generateJournalPrompt(null);

    const call = mockGenerateContent.mock.calls[0][0];
    expect(call.systemInstruction).toContain('null');
  });
});
