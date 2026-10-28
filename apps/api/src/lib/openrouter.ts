import { isCannedRequested, buildCannedResult, SAFE_FALLBACK } from './canned-response.js';
import type { GenerateContentParams, GenerateContentResult } from './llm-types.js';

export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
export const DEFAULT_TIMEOUT_MS = 30_000;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function resolveModelName(modelName?: string): string {
  return modelName ?? process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct';
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function toMessages(params: GenerateContentParams): OpenRouterMessage[] {
  return [
    { role: 'system', content: params.systemInstruction },
    ...params.contents.map((c) => ({
      role: (c.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: c.parts.map((p) => p.text).join(''),
    })),
  ];
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; code?: string | number };
}

/**
 * OpenRouter implementation of `generateContent`, same contract
 * so the four agents can dispatch to either without changing call sites.
 * `generationConfig.responseSchema` (the legacy provider structured-output enforcement)
 * and `thinkingConfig` (Gemini-2.5 "thinking budget" workaround) have no
 * OpenRouter/Llama equivalent and are silently ignored — every caller that
 * sets them already tolerates a plain JSON-object reply without schema
 * enforcement.
 */
export async function generateContent(params: GenerateContentParams): Promise<GenerateContentResult> {
  const model = resolveModelName(params.model);

  if (isCannedRequested(params)) {
    return buildCannedResult(params, model);
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const apiKey = process.env.OPENROUTER_API_KEY;

  const body: Record<string, unknown> = {
    model,
    messages: toMessages(params),
    max_tokens: params.generationConfig?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: params.generationConfig?.temperature ?? 0.7,
  };
  if (params.generationConfig?.responseMimeType === 'application/json') {
    body.response_format = { type: 'json_object' };
  }

  let timedOut = false;
  const controller = new AbortController();

  try {
    const res = await Promise.race([
      fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error('OpenRouter timeout'));
        }, timeoutMs),
      ),
    ]);

    const json = (await res.json()) as OpenRouterResponse;

    if (!res.ok) {
      console.error({ status: res.status, error: json?.error, model }, 'OpenRouter call failed');
      return { text: SAFE_FALLBACK, fallbackUsed: true, failureReason: 'api_error', model, canned: false };
    }

    const text = json.choices?.[0]?.message?.content ?? '';

    if (!text) {
      console.error(
        { finishReason: json.choices?.[0]?.finish_reason, model },
        'OpenRouter returned an empty completion',
      );
      return { text: SAFE_FALLBACK, fallbackUsed: true, failureReason: 'api_error', model, canned: false };
    }

    return { text, fallbackUsed: false, model, canned: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failureReason: 'timeout' | 'api_error' = timedOut ? 'timeout' : 'api_error';
    console.error({ reason: failureReason, err: message }, 'OpenRouter call failed');
    return { text: SAFE_FALLBACK, fallbackUsed: true, failureReason, model, canned: false };
  }
}
