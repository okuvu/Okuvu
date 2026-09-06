import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateContent } from '../lib/openrouter.js';

const SAFE_FALLBACK = "I'm here to support you. Could you tell me more about how you're feeling?";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('openrouter generateContent', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  });

  it('returns response text on a successful call', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'I hear you. Tell me more.' } }] }),
    );

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe('I hear you. Tell me more.');
    expect(result.fallbackUsed).toBe(false);
    expect(result.canned).toBe(false);
    expect(result.model).toBe('meta-llama/llama-3.1-8b-instruct');
  });

  it('maps contents/systemInstruction to system+user/assistant messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    global.fetch = fetchMock;

    await generateContent({
      systemInstruction: 'You are a helpful assistant.',
      contents: [
        { role: 'user', parts: [{ text: 'hi' }] },
        { role: 'model', parts: [{ text: 'hello there' }] },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello there' },
    ]);
  });

  it('returns SAFE_FALLBACK on non-2xx HTTP response', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad request' } }, false, 400));

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
    expect(result.canned).toBe(false);
  });

  it('returns SAFE_FALLBACK when choices/message content is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: 'content_filter' }] }));

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
  });

  it('returns SAFE_FALLBACK with failureReason timeout when the call exceeds timeoutMs', async () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      timeoutMs: 5,
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('timeout');
  });

  it('short-circuits to the canned response without calling fetch', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      useCanned: true,
      cannedResponse: 'a canned reply',
    });

    expect(result.text).toBe('a canned reply');
    expect(result.canned).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts and ignores responseSchema and thinkingConfig without error', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }));

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT' as const, properties: {}, required: [] } as never,
        thinkingConfig: { thinkingBudget: 0 } as never,
      } as never,
    });

    expect(result.text).toBe('{"ok":true}');
    expect(result.fallbackUsed).toBe(false);
  });

  it('maps responseMimeType application/json to response_format json_object', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '{}' } }] }));
    global.fetch = fetchMock;

    await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});
