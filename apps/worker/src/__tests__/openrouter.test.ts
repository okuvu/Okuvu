import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateContent } from '../lib/openrouter.js';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('openrouter generateContent (worker)', () => {
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
      jsonResponse({ choices: [{ message: { content: '{"narrative_summary":"ok"}' } }] }),
    );

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe('{"narrative_summary":"ok"}');
    expect(result.fallbackUsed).toBe(false);
  });

  it('maps contents/systemInstruction to system+user/assistant messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    global.fetch = fetchMock;

    await generateContent({
      systemInstruction: 'You summarise sessions.',
      contents: [
        { role: 'user', parts: [{ text: 'transcript' }] },
        { role: 'model', parts: [{ text: 'prior summary' }] },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You summarise sessions.' },
      { role: 'user', content: 'transcript' },
      { role: 'assistant', content: 'prior summary' },
    ]);
  });

  it('returns an empty, fallback result on non-2xx HTTP response', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad request' } }, false, 400));

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe('');
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
  });

  it('returns an empty, fallback result when choices/message content is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: 'content_filter' }] }));

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe('');
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
  });

  it('returns failureReason timeout when the call exceeds timeoutMs', async () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      timeoutMs: 5,
    });

    expect(result.text).toBe('');
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('timeout');
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

  it('sends only OpenRouter fields — no cloud-specific knobs leak into the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    global.fetch = fetchMock;

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 256 },
    });

    expect(result.fallbackUsed).toBe(false);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature']);
  });
});
