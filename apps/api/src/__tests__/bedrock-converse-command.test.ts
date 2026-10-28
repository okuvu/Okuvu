import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * E17-S1 — the unit half of the surface assertion.
 *
 * `bedrock-converse-surface.test.ts` proves the HTTP request (POST …/converse) by driving the
 * real SDK. That test needs a listener, so it cannot also pin the *command object*. This file
 * mocks only `BedrockRuntimeClient` and keeps the SDK's real `ConverseCommand` /
 * `InvokeModelCommand` classes, so `instanceof` is a genuine type check against the SDK rather
 * than against a hand-written stub. Replacing `new ConverseCommand(input)` with
 * `new InvokeModelCommand({...})` anywhere in the runtime path fails here immediately.
 */

const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-bedrock-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-bedrock-runtime')>();
  return {
    ...actual,
    // Only the client is faked; the command classes below stay the real SDK classes.
    BedrockRuntimeClient: vi.fn(() => ({ send: mockSend })),
  };
});

import { ConverseCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { clearBedrockClient, generateContent, generateEmbedding } from '../lib/bedrock.js';
import { DEFAULT_BEDROCK_MODEL_ID, resolveBedrockModelId } from '../lib/provider-config.js';

const ENV_KEYS = [
  'BEDROCK_MODEL_ID',
  'BEDROCK_EMBEDDING_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
  'AWS_REGION',
  'USE_CANNED_LLM_RESPONSE',
] as const;

function textReply(text: string) {
  return { output: { message: { role: 'assistant', content: [{ text }] } }, stopReason: 'end_turn' };
}

describe('E17-S1: the generation path sends ConverseCommand, never InvokeModelCommand', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    clearBedrockClient();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    clearBedrockClient();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('sends a real ConverseCommand carrying the configured model id', async () => {
    mockSend.mockResolvedValue(textReply('OK'));

    await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    const command = mockSend.mock.calls[0][0];

    expect(command).toBeInstanceOf(ConverseCommand);
    expect(command).not.toBeInstanceOf(InvokeModelCommand);
    expect(command.constructor.name).toBe('ConverseCommand');
    expect(command.input.modelId).toBe(DEFAULT_BEDROCK_MODEL_ID);
    // Converse's typed request shape — `messages[].content` blocks plus `inferenceConfig`.
    // InvokeModel would instead carry a `body` string and no `messages` at all.
    expect(Array.isArray(command.input.messages)).toBe(true);
    expect(command.input.inferenceConfig).toBeTypeOf('object');
    expect(command.input).not.toHaveProperty('body');
  });

  it('carries BEDROCK_MODEL_ID through to the command, so the id is configuration', async () => {
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
    mockSend.mockResolvedValue(textReply('OK'));

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(ConverseCommand);
    expect(mockSend.mock.calls[0][0].input.modelId).toBe('amazon.nova-lite-v1:0');
    expect(result.model).toBe('amazon.nova-lite-v1:0');
    expect(process.env.BEDROCK_MODEL_ID).toBe(resolveBedrockModelId());
  });

  it('reserves InvokeModelCommand for embeddings — the two surfaces do not overlap', async () => {
    mockSend.mockResolvedValue({
      body: { transformToString: async () => JSON.stringify({ embedding: new Array(768).fill(0.1) }) },
    });

    await generateEmbedding('hello');

    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(InvokeModelCommand);
    expect(command).not.toBeInstanceOf(ConverseCommand);
    // Embeddings go through InvokeModel with a raw body — unchanged and deliberately so.
    expect(command.input.modelId).toBe('amazon.titan-embed-text-v2:0');
    expect(typeof command.input.body).toBe('string');
  });

  it('keeps the runtime model id defined in exactly one non-test place per app', () => {
    // The model id must come from configuration, not from a second hardcoded literal that can
    // drift from `provider-config.ts`. Scanning the source is the only way to prove absence.
    const apiSrc = resolve(fileURLToPath(new URL('..', import.meta.url)));
    const workerSrc = resolve(apiSrc, '../../worker/src');

    const scan = (root: string): string[] => {
      const hits: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
            walk(full);
            continue;
          }
          if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
          if (readFileSync(full, 'utf8').includes(`'${DEFAULT_BEDROCK_MODEL_ID}'`)) {
            hits.push(relative(root, full));
          }
        }
      };
      walk(root);
      return hits.sort();
    };

    expect(scan(apiSrc)).toEqual(['lib/provider-config.ts']);
    expect(scan(workerSrc)).toEqual(['lib/provider-config.ts']);
  });
});
