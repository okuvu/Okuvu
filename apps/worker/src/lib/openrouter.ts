import type { GenerateContentParams, GenerateContentResult } from './llm-types.js';
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS } from './llm-types.js';

export { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS };

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
 * OpenRouter transport for the worker's LLM calls — worker's own copy of
 * apps/api/src/lib/openrouter.ts's logic (see generate-content.ts's doc comment
 * for why apps/worker can't import it directly). Same contract as the shared
 * types in llm-types.ts so summary.ts/memory-extraction.ts don't change at
 * their call sites.
 *
 * Not the default and not part of the AWS cutover: it is reachable only when
 * `LLM_PROVIDER=openrouter` is set explicitly (and `OPENROUTER_API_KEY` is
 * present). `responseMimeType:'application/json'` maps to
 * `response_format:{type:'json_object'}`; there is no per-category content
 * threshold concept here, and the request type no longer carries one.
 */
export async function generateContent(params: GenerateContentParams): Promise<GenerateContentResult> {
  const model = resolveModelName(params.model);
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
      return { text: '', fallbackUsed: true, failureReason: 'api_error' };
    }

    const text = json.choices?.[0]?.message?.content ?? '';

    if (!text) {
      console.error(
        { finishReason: json.choices?.[0]?.finish_reason, model },
        'OpenRouter returned an empty completion',
      );
      return { text: '', fallbackUsed: true, failureReason: 'api_error' };
    }

    return { text, fallbackUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failureReason: 'timeout' | 'api_error' = timedOut ? 'timeout' : 'api_error';
    console.error({ reason: failureReason, err: message }, 'OpenRouter call failed');
    return { text: '', fallbackUsed: true, failureReason };
  }
}
