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
import {
  resolveAwsRegion,
  resolveBedrockEmbeddingModelId,
  resolveBedrockModelId,
  resolveEmbeddingDimensions,
} from './provider-config.js';
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS } from './llm-types.js';
import type { GenerateContentParams, GenerateContentResult } from './llm-types.js';

export { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS };
export type { GenerateContentParams, GenerateContentResult };

/**
 * Worker's copy of `apps/api/src/lib/bedrock.ts` — the worker's LLM and
 * embedding implementation after the AWS cutover
 * (docs/AWS-CUTOVER-SPEC.md): Amazon Nova Pro for completions, Titan Text
 * Embeddings V2 (768 dims) for `SessionLog.summary_embedding`. The shared
 * request/response contract and the worker's own limits (1000 output tokens /
 * 25s) live in `llm-types.ts`. apps/api and apps/worker are separate
 * deployables that only share packages/prisma and packages/shared-types, so
 * this cannot be a cross-app import. Keep the two in step.
 *
 * Deliberate behaviours:
 *
 *  • No canned-response short-circuit — summary/memory jobs are never
 *    exercised in sandbox mode.
 *  • Per-category content-safety thresholds are not part of the request
 *    contract any more. The cutover removed them rather than pretending they
 *    worked: Bedrock Guardrails attach by id at the account/agent level, so a
 *    per-request category threshold was a no-op that every call logged.
 *    `llm-types.ts` no longer carries the field, so a caller cannot believe a
 *    policy travelled with the request when it did not.
 *  • An empty completion returns `{ text: '', fallbackUsed: false }`.
 *    `summary.ts` treats unparseable text as a parse failure and stores
 *    `summary_text: null`, so this is the safe inherited behaviour.
 *
 * Structured output mapping matches the API copy: `responseSchema` becomes a
 * forced, `strict` tool (`emit_structured_json`) whose `input` object is
 * re-serialised as the result text; `responseMimeType:'application/json'`
 * without a schema becomes the same forced tool with a permissive object
 * schema.
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

/** Upper-case schema type names (as produced by the old schema dialect) → JSON Schema names. */
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
 * Convert a schema written in the upper-case dialect (`type: 'OBJECT'`,
 * `nullable`, `propertyOrdering`) into the JSON Schema a Bedrock tool spec
 * needs. Bedrock validates tool schemas strictly — leaving `type:"OBJECT"` in
 * place fails every call.
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
      out.type = input.nullable === true && base !== 'null' ? [base, 'null'] : base;
    }

    return out;
  };

  return convert(schema) as Record<string, unknown>;
}

const STRUCTURED_OUTPUT_TOOL = 'emit_structured_json';

/** Derived from the SDK so it stays correct across SDK versions. */
type BedrockJsonSchema = NonNullable<
  NonNullable<NonNullable<Tool['toolSpec']>['inputSchema']>['json']
>;

const PERMISSIVE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {},
  additionalProperties: true,
};

function buildToolConfig(params: GenerateContentParams): ToolConfiguration | null {
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
      // Bedrock's structured-output enforcement for tool use. Only set when a
      // real schema exists; some models reject `strict` on a schema-less tool.
      ...(schema ? { strict: true } : {}),
    },
  };

  return {
    tools: [tool],
    toolChoice: { tool: { name: STRUCTURED_OUTPUT_TOOL } },
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

    messages.push({ role: content.role === 'model' ? 'assistant' : 'user', content: blocks });
  }

  return messages;
}

function extractContentBlocks(output: ConverseOutput | undefined): ContentBlock[] {
  const message = (output as { message?: Message } | undefined)?.message;
  return message?.content ?? [];
}

function extractReplyText(content: ContentBlock[]): string {
  const toolUse = content.find((block) => block.toolUse)?.toolUse;
  if (toolUse) {
    return JSON.stringify(toolUse.input ?? {});
  }
  return content.map((block) => block.text ?? '').join('');
}

export async function generateContent(
  params: GenerateContentParams,
): Promise<GenerateContentResult> {
  const model = resolveBedrockModelId(params.model);
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const generationConfig = params.generationConfig ?? {};
  const toolConfig = buildToolConfig(params);

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
    ...(toolConfig ? { toolConfig } : {}),
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

    if (!text) {
      console.error(
        { event: 'bedrock_empty_response', stop_reason: response.stopReason, model },
        'Bedrock returned empty response',
      );
    }

    return { text, fallbackUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failureReason: 'timeout' | 'api_error' = timedOut ? 'timeout' : 'api_error';
    console.error({ reason: failureReason, err: message, model }, 'Bedrock call failed');
    return { text: '', fallbackUsed: true, failureReason };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Embeddings (InvokeModel) ────────────────────────────────────────────────
//
// Same contract as the worker's `embedding.ts`: `generateEmbedding(text) =>
// number[]`. Titan V2 is the default because it is the only Bedrock embedding
// model that can emit 768 dimensions; Cohere Embed (1024-dim) is supported but
// trips the dimension guard until the column and stored rows are migrated.
//
// Semantic gap: the previous provider was called with an explicit
// similarity-oriented task type; Titan V2 has no task-type parameter and
// Cohere's `input_type` hint cannot be expressed through a `text`-only
// interface (sent as `search_document` both ways). Vectors from different
// models are not comparable — switching models requires re-embedding every
// stored summary (`src/scripts/backfill-embeddings.ts`).

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
    return { inputText: text, dimensions, normalize: true };
  }

  // Titan V1 (1536-dim) rejects `dimensions`/`normalize`.
  return { inputText: text };
}

function extractEmbeddingVector(payload: unknown, modelId: string): number[] {
  const body = payload as { embedding?: unknown; embeddings?: unknown } | null;

  const asNumbers = (value: unknown): number[] | null => {
    if (!Array.isArray(value)) return null;
    const vector = value.filter((entry): entry is number => typeof entry === 'number');
    return vector.length === value.length ? vector : null;
  };

  const titan = asNumbers(body?.embedding);
  if (titan) return titan;

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
