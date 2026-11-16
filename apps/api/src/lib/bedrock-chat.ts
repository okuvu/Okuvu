/**
 * Bedrock's OpenAI-compatible **Chat Completions** transport, used for one
 * reason: it is the only Bedrock surface that will serve this model's repeated
 * instruction block from a prompt cache. `ConverseCommand` with a `cachePoint`
 * answers `AccessDeniedException` — "You invoked an unsupported model or your
 * request did not allow prompt caching". Probed against this account in
 * ap-south-1, not inferred from a model card. The same bytes sent to
 * `/openai/v1/chat/completions` come back with
 * `usage.prompt_tokens_details.cached_tokens` populated.
 *
 * What is actually established, and what is not (re-measured 16 Nov 2026, see
 * evidence/E17-S6.md §5d — this header previously claimed more than the probes
 * support):
 *
 *   Established: with a ~13k-token prompt whose first ~99% is byte-identical
 *   between calls, the surface reports ~12.9k of ~13.0k input tokens as
 *   `cached_tokens` on roughly a third of calls, and 0 on the rest. That rate
 *   did not move when the explicit `prompt_cache_breakpoint` /
 *   `prompt_cache_options` fields were removed (5 hits of 16 calls either way),
 *   nor when the per-turn values were moved from the system message into a user
 *   message (5 of 16 again). So the reuse is **implicit and best-effort, and the
 *   per-host cache story is the likely reason for the ~1-in-3 rate** — a cache
 *   entry lives on the host that served the first request.
 *
 *   Not established: that these explicit controls do anything for this model.
 *   AWS's Qwen3-32B model card lists neither implicit nor explicit prompt
 *   caching, and the explicit-caching table names Claude, GPT, Nova, GLM and Kimi
 *   but not Qwen. The fields are kept because they are inert here and would be
 *   honoured by a model that supports them; do not read their presence as proof
 *   that they are the mechanism.
 *
 * What the cache is worth here: the four turn-path calls re-send ~20.7k tokens
 * of fixed instruction every turn, and input is ~99% of the tokens billed. A
 * turn is four prompts, not one, and nothing is shared between them. The lever
 * is therefore making each prompt's body byte-identical turn to turn, which is
 * why A2's per-turn values live in §12 at the end of its prompt rather than
 * inline (see the prompt-layout rule in docs/AGENT-CODE-STANDARD.md §5).
 *
 * Failure contract: every function here either returns parsed content or
 * `{ ok: false }` with a reason. It never throws into the turn path and never
 * invents text — `bedrock.ts` falls back to Converse on `ok: false`, so a
 * cache-wrapper fault degrades to the previously-shipped behaviour instead of
 * to a failed turn.
 */

import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import type { GenerateContentParams } from './llm-types.js';
import type { TokenUsage } from './llm-types.js';

/** The OpenAI-compatible surface, on the same regional host as bedrock-runtime. */
export const CHAT_COMPLETIONS_PATH = '/openai/v1/chat/completions';

/**
 * SigV4 signing name. This is `bedrock`, not `bedrock-runtime`: the
 * `/openai/v1/*` paths are signed under the service's own signing name, and
 * using the wrong one returns a signature-mismatch 401 rather than a permission
 * error, which reads like a credentials problem and is not one.
 */
const SIGNING_NAME = 'bedrock';

/** Same tool name Converse forces, so the response reader cannot drift. */
export const STRUCTURED_OUTPUT_TOOL = 'emit_structured_json';

const TOOL_DESCRIPTION =
  'Return the complete response as a single JSON object that conforms exactly to the input schema. Do not return prose, markdown or code fences.';

/** Credentials are resolved once and reused; the SDK provider chain caches nothing across calls here. */
type CredentialIdentity = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
};

let credentialProvider: (() => Promise<CredentialIdentity>) | null = null;
let signer: SignatureV4 | null = null;
let signerRegion: string | null = null;

/** Test seam: forget the memoised credentials/signer after changing env. */
export function clearChatCompletionsSigner(): void {
  credentialProvider = null;
  signer = null;
  signerRegion = null;
}

/**
 * Prompt caching is **on** unless explicitly switched off, because the whole
 * point of this transport is the cache. `BEDROCK_PROMPT_CACHE=off` is the
 * one-env-var revert to Converse-only if the new surface misbehaves in
 * production; it needs no deploy of code.
 */
export function isPromptCachingEnabled(): boolean {
  const flag = (process.env.BEDROCK_PROMPT_CACHE ?? '').trim().toLowerCase();
  return !(flag === 'off' || flag === 'false' || flag === '0');
}

function getSigner(region: string): SignatureV4 {
  if (!signer || signerRegion !== region) {
    credentialProvider ??= defaultProvider() as unknown as () => Promise<CredentialIdentity>;
    signer = new SignatureV4({
      credentials: credentialProvider,
      region,
      service: SIGNING_NAME,
      sha256: Sha256,
    });
    signerRegion = region;
  }
  return signer;
}

/**
 * Base URL for the call. `BEDROCK_ENDPOINT_URL` (this transport's own knob) wins
 * over the SDK-wide `AWS_ENDPOINT_URL`, so the Converse client and this surface
 * can be pointed at different loopback stubs — a plain h2c server cannot answer a
 * `fetch`, and an HTTP/1.1 server cannot answer the SDK's h2c handshake.
 */
function resolveEndpoint(region: string): { base: string; hostname: string; protocol: 'https:' | 'http:' } {
  const override = (process.env.BEDROCK_ENDPOINT_URL ?? process.env.AWS_ENDPOINT_URL ?? '').trim();
  const base = override !== '' ? override.replace(/\/+$/, '') : `https://bedrock-runtime.${region}.amazonaws.com`;
  const parsed = new URL(base);
  return {
    base,
    hostname: parsed.host,
    protocol: parsed.protocol === 'http:' ? 'http:' : 'https:',
  };
}

// ─── Request shape ───────────────────────────────────────────────────────────

export interface ChatCompletionsRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  top_p?: number;
  stop?: string[];
  prompt_cache_options?: { mode: 'explicit' };
  response_format?: { type: 'json_object' };
  tools?: ChatTool[];
  tool_choice?: { type: 'function'; function: { name: string } };
}

type ChatTextBlock = {
  type: 'text';
  text: string;
  /** Explicit breakpoint: the whole block above it is reusable prefix. */
  prompt_cache_breakpoint?: { mode: 'explicit' };
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatTextBlock[];
  tool_calls?: unknown;
}

export interface ChatTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/**
 * The caller's schema arrives in the legacy dialect (`type:'OBJECT'`,
 * `nullable`, `propertyOrdering`). `toBedrockJsonSchema` in `bedrock.ts` already
 * converts it for the Converse tool path; this module receives the converted
 * form so both surfaces send the same schema document rather than two
 * hand-maintained copies.
 */
export type StructuredSchema = Record<string, unknown>;

export interface BuildRequestOptions {
  /** JSON Schema (already converted) — when present the reply must arrive as a tool call. */
  schema?: StructuredSchema;
  /** Caller asked for JSON but supplied no schema (A2/A9/A9-post). */
  wantsJson?: boolean;
}

export function buildChatCompletionsRequest(
  params: GenerateContentParams,
  model: string,
  options: BuildRequestOptions,
): ChatCompletionsRequest {
  const config = params.generationConfig ?? {};

  const messages: ChatMessage[] = [];
  if (params.systemInstruction) {
    messages.push({
      role: 'system',
      content: [
        {
          type: 'text',
          text: params.systemInstruction,
          prompt_cache_breakpoint: { mode: 'explicit' },
        },
      ],
    });
  }

  for (const content of params.contents) {
    const text = content.parts
      .map((part) => part.text)
      .filter((part) => part.length > 0)
      .join('');
    // An empty turn is not sendable; Converse skips it for the same reason.
    if (text.length === 0) continue;
    messages.push({ role: content.role === 'model' ? 'assistant' : 'user', content: text });
  }

  const request: ChatCompletionsRequest = {
    model,
    messages,
    max_tokens: config.maxOutputTokens ?? 2048,
    temperature: config.temperature ?? 0.7,
    prompt_cache_options: { mode: 'explicit' },
    ...(config.topP !== null && config.topP !== undefined ? { top_p: config.topP } : {}),
    ...(config.stopSequences && config.stopSequences.length > 0 ? { stop: config.stopSequences } : {}),
    // `topK` has no Chat Completions field. Dropped rather than silently
    // re-mapped: Converse accepts it, this surface does not.
  };

  if (options.schema) {
    request.tools = [
      { type: 'function', function: { name: STRUCTURED_OUTPUT_TOOL, description: TOOL_DESCRIPTION, parameters: options.schema } },
    ];
    // Same forcing as the Converse path: without `tool_choice` a model may
    // answer in prose and the caller's JSON.parse fails closed on a request it
    // could have satisfied.
    request.tool_choice = { type: 'function', function: { name: STRUCTURED_OUTPUT_TOOL } };
  } else if (options.wantsJson) {
    // No schema to constrain (permissive JSON mode). `json_object` is supported
    // on this surface for this model — probe, not documentation.
    request.response_format = { type: 'json_object' };
  }

  return request;
}

// ─── Response shape ──────────────────────────────────────────────────────────

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export interface ChatCompletionsSuccess {
  ok: true;
  text: string;
  usage?: TokenUsage;
  stopReason?: string;
}

export interface ChatCompletionsFailure {
  ok: false;
  /** Short machine-readable cause for the log line; never shown to a client. */
  reason: string;
  /** HTTP status when the surface answered but refused. */
  status?: number;
}

/**
 * Read the assistant's reply. A tool call wins over text exactly as on the
 * Converse path: the arguments *are* the structured answer, and any prose
 * alongside them is commentary the callers cannot parse.
 *
 * When a schema was sent and no tool call came back, this reports a failure
 * rather than scraping JSON out of prose — the caller then retries on Converse,
 * which enforces the schema, so the structured-output guarantee never depends on
 * this surface.
 */
export function readChatCompletionsReply(
  body: ChatCompletionsResponse,
  options: { expectsToolCall: boolean },
): ChatCompletionsSuccess | ChatCompletionsFailure {
  const choice = body.choices?.[0];
  const message = choice?.message;
  const usage = toTokenUsage(body.usage);

  const toolCall = message?.tool_calls?.[0]?.function;
  if (toolCall?.arguments) {
    return { ok: true, text: toolCall.arguments, usage, stopReason: choice?.finish_reason };
  }

  if (options.expectsToolCall) {
    return { ok: false, reason: 'no_tool_call' };
  }

  const text = typeof message?.content === 'string' ? message.content : '';
  if (text.trim().length === 0) return { ok: false, reason: 'empty_candidate' };

  return { ok: true, text, usage, stopReason: choice?.finish_reason };
}

/**
 * Token counts as this surface reports them, narrowed to the contract's
 * `TokenUsage`. `cachedInputTokens` is carried for the usage log only: the
 * per-session budget still prices every input token at the full input rate, so
 * a cache hit makes the guard *conservative* (it refuses earlier than the real
 * bill would demand), never optimistic.
 */
export function toTokenUsage(usage: ChatCompletionsResponse['usage']): TokenUsage | undefined {
  if (!usage) return undefined;
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  if (inputTokens === 0 && outputTokens === 0) return undefined;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    ...(usage.prompt_tokens_details?.cached_tokens
      ? { cachedInputTokens: usage.prompt_tokens_details.cached_tokens }
      : {}),
  };
}

// ─── The call ────────────────────────────────────────────────────────────────

export interface CallChatCompletionsOptions extends BuildRequestOptions {
  region: string;
  /** Absolute epoch-ms deadline shared with the Converse fallback. */
  deadline: number;
}

/**
 * POST one call to the Chat Completions surface. Never throws: a signed request
 * that cannot be built, a refused surface and a parse failure all come back as
 * `{ ok: false }` so the caller can fall back.
 */
export async function callChatCompletions(
  params: GenerateContentParams,
  model: string,
  options: CallChatCompletionsOptions,
): Promise<ChatCompletionsSuccess | ChatCompletionsFailure> {
  const remaining = options.deadline - Date.now();
  if (remaining <= 0) return { ok: false, reason: 'timeout_before_call' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);

  try {
    const { base, hostname, protocol } = resolveEndpoint(options.region);
    const url = new URL(`${base}${CHAT_COMPLETIONS_PATH}`);
    const request = buildChatCompletionsRequest(params, model, options);
    const body = JSON.stringify(request);

    const signed = await getSigner(options.region).sign(
      new HttpRequest({
        method: 'POST',
        protocol,
        hostname,
        path: url.pathname,
        headers: { 'content-type': 'application/json', host: hostname },
        body,
      }),
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: signed.headers as unknown as Record<string, string>,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        { status: response.status, model, surface: 'chat_completions', detail: detail.slice(0, 400) },
        'Bedrock Chat Completions refused the call; falling back to Converse',
      );
      return { ok: false, reason: `http_${response.status}`, status: response.status };
    }

    const parsed = (await response.json()) as ChatCompletionsResponse;
    return readChatCompletionsReply(parsed, { expectsToolCall: Boolean(options.schema) });
  } catch (err) {
    const aborted = controller.signal.aborted;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      { model, surface: 'chat_completions', aborted, err: message },
      'Bedrock Chat Completions call failed; falling back to Converse',
    );
    return { ok: false, reason: aborted ? 'timeout' : 'transport_error' };
  } finally {
    clearTimeout(timer);
  }
}
