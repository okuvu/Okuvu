import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  ContentBlock,
  ConverseCommandInput,
  ConverseOutput,
  Message,
  Tool,
  ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';
import { isCannedRequested, buildCannedResult, SAFE_FALLBACK } from './canned-response.js';
import { recordModelUsage } from './token-budget.js';
import type { TokenUsage } from './llm-types.js';
import {
  resolveAwsRegion,
  resolveBedrockEmbeddingModelId,
  resolveBedrockModelId,
  resolveEmbeddingDimensions,
} from './provider-config.js';

export type {
  GenerateContentParams,
  GenerateContentResult,
} from './llm-types.js';
import type {
  GenerateContentParams,
  GenerateContentResult,
} from './llm-types.js';

export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * AWS Bedrock implementation of the `GenerateContentParams` →
 * `GenerateContentResult` contract in `llm-types.ts`.
 *
 * Same `generateContent(params)` signature and argument shapes every agent
 * already used. Agents never branch on provider — `generate-content.ts` picks a
 * backend and this module is reached when `LLM_PROVIDER=bedrock` (see
 * `provider-config.ts`).
 *
 * Mapping notes:
 *
 *  • Prompt          — `systemInstruction` → `system` blocks; `role:'model'`
 *                      → `role:'assistant'`; each `parts[].text` becomes its
 *                      own text content block.
 *  • Structured JSON — the legacy provider's `generationConfig.responseSchema` is enforced
 *                      by the Gemini decoder itself. Bedrock's equivalent is
 *                      forced tool use with `toolSpec.strict: true`
 *                      (`emit_structured_json`), whose `inputSchema.json` is
 *                      the same schema converted to JSON Schema form; the
 *                      tool's `input` object is re-serialised as the result
 *                      text. `strict` is Bedrock's structured-output
 *                      enforcement, so this is schema constraint rather than
 *                      prompt hope — but it is enforced per-model (not every
 *                      Bedrock model supports strict tool use), so callers
 *                      keep validating every field, exactly as they must
 *                      today under the OpenRouter default.
 *                      `responseMimeType:'application/json'` without a schema
 *                      (A2, A9, A9-post) maps to the same forced tool with a
 *                      permissive object schema — Bedrock has no JSON "mime
 *                      type" equivalent.
 *  • `safetySettings` — the legacy provider per-category thresholds have no Converse
 *                      equivalent; Bedrock Guardrails are attached by id at
 *                      the client/account level and cannot be expressed as
 *                      per-request category thresholds. Ignored (with a log)
 *                      rather than silently pretending parity.
 *  • `thinkingConfig`, `candidateCount`, `topK` — thinking budget and
 *                      candidate counting have no Converse field; `topK` is
 *                      passed through (supported by several Bedrock models)
 *                      and dropped by the service if the model rejects it.
 *  • Timeout         — implemented with an AbortController, so the in-flight
 *                      HTTP request is actually cancelled (the the legacy provider client
 *                      only raced a timer and left the gRPC call running).
 */

let client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: resolveAwsRegion() });
  }
  return client;
}

/** Test seam: drop the memoised client after changing region/credentials env. */
export function clearBedrockClient(): void {
  client = null;
}

/**
 * Local constants must stay identical to the shared contract in `llm-types.ts`.
 * If that module's constants change shape, this stops compiling — the two
 * cannot silently drift. No runtime effect.
 */
const _llmTypesContract: Pick<
  typeof import('./llm-types.js'),
  'DEFAULT_MAX_OUTPUT_TOKENS' | 'DEFAULT_TIMEOUT_MS'
> = { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS };

/** Legacy uppercase schema-type tokens agents emit → JSON Schema type names. */
const UPPERCASE_TYPE_TO_JSON_SCHEMA: Record<string, string> = {
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  NULL: 'null',
};

/**
 * Convert a the legacy `responseSchema` (protobuf `Schema`: UPPERCASE type names,
 * `nullable`, `propertyOrdering`) into the JSON Schema the model-facing tool
 * spec needs. Bedrock validates tool schemas strictly — leaving
 * `type:"OBJECT"` in place makes every call fail — so this is not cosmetic.
 *
 * `nullable:true` becomes `type: ["string","null"]`; `propertyOrdering` (a
 * provider-specific generation hint) is dropped; an empty `required: []` is dropped
 * because several model providers reject it.
 */
export function toBedrockJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const convert = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(convert);
    if (typeof node !== 'object' || node === null) return node;

    const input = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (key === 'type' || key === 'nullable' || key === 'propertyOrdering') continue;

      if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
        // `properties` is a map of name → schema, not a schema itself, so its
        // *values* are converted individually (converting the map directly
        // would leave every nested `type` un-lowercased).
        const convertedProperties: Record<string, unknown> = {};
        for (const [propertyName, propertySchema] of Object.entries(
          value as Record<string, unknown>,
        )) {
          convertedProperties[propertyName] = convert(propertySchema);
        }
        out.properties = convertedProperties;
      } else if (key === 'items' || key === 'anyOf' || key === 'allOf' || key === 'oneOf') {
        out[key] = convert(value);
      } else if (key === 'required' && Array.isArray(value)) {
        if (value.length > 0) out.required = value;
      } else {
        out[key] = value;
      }
    }

    if (typeof input.type === 'string') {
      const base = UPPERCASE_TYPE_TO_JSON_SCHEMA[input.type.toUpperCase()] ?? input.type.toLowerCase();
      out.type =
        input.nullable === true && base !== 'null' ? [base, 'null'] : base;
    }

    return out;
  };

  return convert(schema) as Record<string, unknown>;
}

/**
 * Tool name is a constant so the forced `toolChoice` and the response reader
 * cannot drift apart.
 */
const STRUCTURED_OUTPUT_TOOL = 'emit_structured_json';

/**
 * The JSON-schema document type Bedrock's `toolSpec.inputSchema.json`
 * accepts, derived from the SDK itself so it stays correct across SDK
 * versions (`DocumentType` lives in `@smithy/types`, which is not a declared
 * dependency of this package — importing it directly would be a phantom
 * dependency under pnpm's isolated node_modules).
 */
type BedrockJsonSchema = NonNullable<
  NonNullable<NonNullable<Tool['toolSpec']>['inputSchema']>['json']
>;

/**
 * JSON Schema used when the caller asked for JSON (`responseMimeType:
 * 'application/json'`) but supplied no `responseSchema` — the A2 / A9 /
 * A9-post case. Kept permissive on purpose: this replaces the legacy provider's
 * `responseMimeType` (valid JSON, no field guarantee), not `responseSchema`
 * (valid JSON *and* shape).
 */
const PERMISSIVE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {},
  additionalProperties: true,
};

function buildToolConfig(params: GenerateContentParams): {
  toolConfig: ToolConfiguration;
  expectsJson: boolean;
} | null {
  const schema = params.generationConfig?.responseSchema as Record<string, unknown> | undefined;
  const wantsJson = params.generationConfig?.responseMimeType === 'application/json';

  if (!schema && !wantsJson) return null;

  const json = schema ? toBedrockJsonSchema(schema) : PERMISSIVE_JSON_SCHEMA;

  const tool: Tool = {
    toolSpec: {
      name: STRUCTURED_OUTPUT_TOOL,
      description:
        'Return the complete response as a single JSON object that conforms exactly to the input schema. Do not return prose, markdown or code fences.',
      inputSchema: { json: json as BedrockJsonSchema },
      // Bedrock's structured-output enforcement for tool use: the model's
      // arguments are constrained to the schema instead of merely prompted
      // towards it. Only meaningful when the caller supplied a real schema —
      // the permissive JSON fallback has nothing to enforce, and some models
      // reject `strict` outright, which is why it is not set there.
      ...(schema ? { strict: true } : {}),
    },
  };

  return {
    toolConfig: {
      tools: [tool],
      // Forced: without this, a model may answer in prose and the caller's
      // JSON.parse would fail closed on a request it could have satisfied.
      toolChoice: { tool: { name: STRUCTURED_OUTPUT_TOOL } },
    },
    expectsJson: true,
  };
}

function toBedrockMessages(contents: GenerateContentParams['contents']): Message[] {
  const messages: Message[] = [];

  for (const content of contents) {
    const blocks: ContentBlock[] = content.parts
      .map((part) => part.text)
      .filter((text) => text.length > 0)
      .map((text) => ({ text }));

    // Converse rejects an empty `content` array; skip rather than send one.
    if (blocks.length === 0) continue;

    messages.push({
      role: content.role === 'model' ? 'assistant' : 'user',
      content: blocks,
    });
  }

  return messages;
}

function extractContentBlocks(output: ConverseOutput | undefined): ContentBlock[] {
  // ConverseOutput is a union (`{ message }` | `{ $unknown }`); the message
  // arm is the only one any Bedrock text/tool model returns.
  const message = (output as { message?: Message } | undefined)?.message;
  return message?.content ?? [];
}

/**
 * Pull the assistant's reply out of a Converse response. Tool-use wins over
 * text: when the model calls the forced tool, the JSON lives in
 * `toolUse.input` (already parsed) and is re-serialised — that is the
 * structured-output path, and any accompanying text block is commentary the
 * callers cannot parse.
 */
function extractReplyText(content: ContentBlock[]): string {
  const toolUse = content.find((block) => block.toolUse)?.toolUse;
  if (toolUse) {
    return JSON.stringify(toolUse.input ?? {});
  }
  return content
    .map((block) => block.text ?? '')
    .join('');
}

/**
 * E17-S6 — Converse's own token counts, narrowed to the contract's `TokenUsage`.
 *
 * `inputTokens`/`outputTokens` are what the service billed for; `totalTokens`
 * is derived rather than trusted so the two can never disagree. If a model ever
 * reported only a total, it is attributed to *output*: output is priced ~3.9×
 * input, so that direction over-states cost and therefore makes a budget refuse
 * earlier — the fail-closed direction. The reverse would under-state spend.
 */
function toTokenUsage(
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined;

  const hasSplit = typeof usage.inputTokens === 'number' || typeof usage.outputTokens === 'number';
  const inputTokens = hasSplit ? usage.inputTokens ?? 0 : 0;
  const outputTokens = hasSplit ? usage.outputTokens ?? 0 : usage.totalTokens ?? 0;

  if (inputTokens === 0 && outputTokens === 0) return undefined;

  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

export async function generateContent(
  params: GenerateContentParams,
): Promise<GenerateContentResult> {
  const model = resolveBedrockModelId(params.model);

  if (isCannedRequested(params)) {
    return buildCannedResult(params, model);
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const generationConfig = params.generationConfig ?? {};
  const tools = buildToolConfig(params);

  const input: ConverseCommandInput = {
    modelId: model,
    system: params.systemInstruction ? [{ text: params.systemInstruction }] : undefined,
    messages: toBedrockMessages(params.contents),
    inferenceConfig: {
      maxTokens: generationConfig.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: generationConfig.temperature ?? 0.7,
      ...(generationConfig.topP !== null && generationConfig.topP !== undefined
        ? { topP: generationConfig.topP }
        : {}),
      ...(generationConfig.topK !== null && generationConfig.topK !== undefined
        ? { topK: generationConfig.topK }
        : {}),
      ...(generationConfig.stopSequences && generationConfig.stopSequences.length > 0
        ? { stopSequences: generationConfig.stopSequences }
        : {}),
    },
    ...(tools ? { toolConfig: tools.toolConfig } : {}),
  };

  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await getClient().send(new ConverseCommand(input), {
      abortSignal: controller.signal,
    });

    const content = extractContentBlocks(response.output);
    const text = extractReplyText(content);

    // E17-S6: the service's own token counts, captured before any early
    // return. An empty candidate was still billed, so it is metered too.
    const usage = toTokenUsage(response.usage);
    recordModelUsage(usage);

    if (!text) {
      // Same failure surface as the OpenRouter path: an empty candidate (safety
      // block, MAX_TOKENS, toolUse without input) must read as a technical
      // failure, not as a silent empty answer.
      console.error(
        {
          stopReason: response.stopReason,
          usage: response.usage,
          model,
          expectsJson: tools?.expectsJson ?? false,
        },
        'Bedrock returned an empty candidate',
      );
      return { text: SAFE_FALLBACK, fallbackUsed: true, failureReason: 'api_error', model, canned: false, usage };
    }

    return { text, fallbackUsed: false, model, canned: false, usage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failureReason: 'timeout' | 'api_error' = timedOut ? 'timeout' : 'api_error';
    console.error({ reason: failureReason, err: message, model }, 'Bedrock call failed');
    return { text: SAFE_FALLBACK, fallbackUsed: true, failureReason, model, canned: false };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Embeddings (InvokeModel) ────────────────────────────────────────────────
//
// Same contract as `embedding.ts` — `generateEmbedding(text) => number[]` —
// so `embedding.ts` can swap implementations without any caller change.
//
// Titan Text Embeddings V2 is the default because it is the only Bedrock
// embedding model that can emit the 768 dimensions the pgvector column pins.
// Cohere Embed (1024-dim) is supported for completeness; using it trips the
// dimension guard below until the column and every stored row are migrated.
//
// Semantic gap worth stating plainly: the legacy provider's embedding model was
// called with `taskType: SEMANTIC_SIMILARITY`, which shapes the vector for
// symmetric similarity. Titan V2 has no task-type parameter at all, and
// Cohere's `input_type` (search_document vs search_query) is a per-call hint
// this interface (`text` only) cannot express — it is sent as
// `search_document` for both sides. Vectors from two different models are not
// comparable in any case: enabling Bedrock embeddings requires re-embedding
// every stored summary (`apps/worker/src/scripts/backfill-embeddings.ts`)
// before similarity search returns anything meaningful.

interface TitanEmbeddingRequest {
  inputText: string;
  dimensions?: number;
  normalize?: boolean;
}

interface CohereEmbeddingRequest {
  texts: string[];
  input_type: 'search_document' | 'search_query';
  truncate: 'END';
}

function isCohereModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('cohere');
}

function isTitanV2(modelId: string): boolean {
  return modelId.toLowerCase().includes('titan-embed-text-v2');
}

function buildEmbeddingBody(
  modelId: string,
  text: string,
  dimensions: number,
): TitanEmbeddingRequest | CohereEmbeddingRequest {
  if (isCohereModel(modelId)) {
    return { texts: [text], input_type: 'search_document', truncate: 'END' };
  }

  if (isTitanV2(modelId)) {
    // Titan V2 accepts 1024, 512 or 256 by default and 768 as a valid
    // dimension — 768 is chosen to match the existing column exactly.
    return { inputText: text, dimensions, normalize: true };
  }

  // Titan V1 (1536-dim) rejects `dimensions`/`normalize`.
  return { inputText: text };
}

function extractEmbeddingVector(payload: unknown, modelId: string): number[] {
  const body = payload as {
    embedding?: unknown;
    embeddings?: unknown;
  } | null;

  const asNumbers = (value: unknown): number[] | null => {
    if (!Array.isArray(value)) return null;
    const vector = value.filter((entry): entry is number => typeof entry === 'number');
    return vector.length === value.length ? vector : null;
  };

  const titan = asNumbers(body?.embedding);
  if (titan) return titan;

  // Cohere V3: { embeddings: [[...]] }; Cohere V4-shaped: { embeddings: { float: [[...]] } }.
  const embeddings = body?.embeddings;
  if (Array.isArray(embeddings)) {
    const first = asNumbers(embeddings[0]);
    if (first) return first;
  } else if (embeddings && typeof embeddings === 'object') {
    const floatMatrix = (embeddings as { float?: unknown }).float;
    if (Array.isArray(floatMatrix)) {
      const first = asNumbers(floatMatrix[0]);
      if (first) return first;
    }
  }

  throw new Error(`Bedrock embedding response for model ${modelId} contained no numeric vector`);
}

async function readBodyAsText(body: unknown): Promise<string> {
  const streamable = body as { transformToString?: () => Promise<string> } | undefined;
  if (!streamable) return '';
  if (typeof streamable.transformToString === 'function') {
    return streamable.transformToString();
  }
  return new TextDecoder().decode(body as Uint8Array);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const modelId = resolveBedrockEmbeddingModelId();
  const dimensions = resolveEmbeddingDimensions();

  const response = await getClient().send(
    new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(buildEmbeddingBody(modelId, text, dimensions)),
    }),
  );

  const raw = await readBodyAsText(response.body);
  if (!raw) {
    throw new Error(`Bedrock embedding model ${modelId} returned an empty body`);
  }

  const vector = extractEmbeddingVector(JSON.parse(raw), modelId);

  if (vector.length !== dimensions) {
    throw new Error(
      `Bedrock embedding model ${modelId} returned ${vector.length} dimensions but ` +
        `BEDROCK_EMBEDDING_DIMENSIONS is ${dimensions} (SessionLog.summary_embedding is ` +
        `vector(${dimensions})). Pick a model/width that matches the column, or migrate ` +
        `the column and re-embed every stored summary before switching.`,
    );
  }

  return vector;
}
