import {
  MAX_SPEECH_CHARS,
  DEFAULT_LANGUAGE,
  type A13Input,
  type A13Output,
  type SpeechProvider,
} from './types.js';

/**
 * A13 speaks text A12 already wrote. It performs no rewriting, no summarising
 * and no truncation: if the text is too long to speak in one utterance it
 * refuses rather than speaking a shortened version the client never read.
 */
export async function synthesise(
  input: A13Input,
  provider: SpeechProvider | null,
): Promise<A13Output> {
  const characters = typeof input.text === 'string' ? input.text.trim().length : 0;

  if (input.safetyState === 'S4') {
    return {
      status: 'refused',
      audio: null,
      mimeType: null,
      reason: 'refused_safety_state_S4',
      provider: provider?.name ?? null,
      characters,
    };
  }

  if (characters === 0) {
    return { status: 'refused', audio: null, mimeType: null, reason: 'empty_text', provider: provider?.name ?? null, characters };
  }

  if (characters > MAX_SPEECH_CHARS) {
    // Speaking an abridged version would be new content authored by A13.
    return {
      status: 'refused',
      audio: null,
      mimeType: null,
      reason: 'text_exceeds_single_utterance_budget',
      provider: provider?.name ?? null,
      characters,
    };
  }

  if (provider === null) {
    console.error({ agent: 'A13', reason: 'no_provider' }, 'A13 has no speech provider configured');
    return {
      status: 'unavailable',
      audio: null,
      mimeType: null,
      reason: 'no_speech_provider_configured',
      provider: null,
      characters,
    };
  }

  try {
    const result = await provider.synthesise({
      text: input.text,
      voice: input.voice ?? 'default',
      language: input.language ?? DEFAULT_LANGUAGE,
    });

    if (!result || !(result.audio instanceof Uint8Array) || result.audio.length === 0) {
      console.error({ agent: 'A13', provider: provider.name, reason: 'empty_audio' }, 'A13 provider returned no audio');
      return {
        status: 'unavailable',
        audio: null,
        mimeType: null,
        reason: 'provider_returned_no_audio',
        provider: provider.name,
        characters,
      };
    }

    return {
      status: 'ready',
      audio: result.audio,
      mimeType: result.mimeType,
      reason: null,
      provider: provider.name,
      characters,
    };
  } catch {
    console.error({ agent: 'A13', provider: provider.name, reason: 'provider_error' }, 'A13 synthesis failed');
    return {
      status: 'unavailable',
      audio: null,
      mimeType: null,
      reason: 'provider_error',
      provider: provider.name,
      characters,
    };
  }
}
