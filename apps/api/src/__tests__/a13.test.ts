import { describe, it, expect, vi } from 'vitest';
import { synthesise } from '../agents/a13/agent.js';
import { MAX_SPEECH_CHARS, type A13Input, type SpeechProvider } from '../agents/a13/types.js';

function makeInput(overrides: Partial<A13Input> = {}): A13Input {
  return { text: 'That sounds exhausting. Would it help to start smaller?', compiledBy: 'A12', ...overrides };
}

function makeProvider(overrides: Partial<SpeechProvider> = {}): SpeechProvider {
  return {
    name: 'fake-tts',
    synthesise: vi.fn(async () => ({ audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/mpeg' })),
    ...overrides,
  };
}

describe('A13 Delivery / Speaking Agent', () => {
  it('returns ready audio from a provider', async () => {
    const out = await synthesise(makeInput(), makeProvider());
    expect(out.status).toBe('ready');
    expect(out.audio?.length).toBe(3);
    expect(out.mimeType).toBe('audio/mpeg');
    expect(out.provider).toBe('fake-tts');
  });

  it('passes the compiled text through verbatim — A13 writes no content', async () => {
    const provider = makeProvider();
    const text = 'A sentence A12 wrote, exactly as written.';
    await synthesise(makeInput({ text }), provider);
    expect(provider.synthesise).toHaveBeenCalledWith(
      expect.objectContaining({ text }),
    );
    const arg = (provider.synthesise as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.text).toBe(text);
  });

  it('returns unavailable with null audio when no provider is configured', async () => {
    const out = await synthesise(makeInput(), null);
    expect(out.status).toBe('unavailable');
    expect(out.audio).toBeNull();
    expect(out.reason).toBe('no_speech_provider_configured');
  });

  it('refuses at S4 — no audio on the crisis path', async () => {
    const provider = makeProvider();
    const out = await synthesise(makeInput({ safetyState: 'S4' }), provider);
    expect(out.status).toBe('refused');
    expect(out.reason).toBe('refused_safety_state_S4');
    expect(provider.synthesise).not.toHaveBeenCalled();
  });

  it('refuses empty text', async () => {
    const out = await synthesise(makeInput({ text: '   ' }), makeProvider());
    expect(out.status).toBe('refused');
    expect(out.reason).toBe('empty_text');
  });

  it('refuses over-long text rather than speaking an abridged version', async () => {
    const provider = makeProvider();
    const out = await synthesise(makeInput({ text: 'a'.repeat(MAX_SPEECH_CHARS + 1) }), provider);
    expect(out.status).toBe('refused');
    expect(out.reason).toBe('text_exceeds_single_utterance_budget');
    expect(provider.synthesise).not.toHaveBeenCalled();
  });

  it('treats a provider throwing as unavailable, not ready', async () => {
    const provider = makeProvider({ synthesise: vi.fn(async () => { throw new Error('tts down'); }) });
    const out = await synthesise(makeInput(), provider);
    expect(out.status).toBe('unavailable');
    expect(out.audio).toBeNull();
    expect(out.reason).toBe('provider_error');
  });

  it('treats an empty buffer as unavailable — no silent success', async () => {
    const provider = makeProvider({ synthesise: vi.fn(async () => ({ audio: new Uint8Array(0), mimeType: 'audio/mpeg' })) });
    const out = await synthesise(makeInput(), provider);
    expect(out.status).toBe('unavailable');
    expect(out.reason).toBe('provider_returned_no_audio');
  });

  it('defaults to en-IN and passes a voice through', async () => {
    const provider = makeProvider();
    await synthesise(makeInput({ voice: 'kavya' }), provider);
    expect(provider.synthesise).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en-IN', voice: 'kavya' }),
    );
  });

  it('reports the character count it attempted', async () => {
    const out = await synthesise(makeInput({ text: 'abc' }), null);
    expect(out.characters).toBe(3);
  });
});
