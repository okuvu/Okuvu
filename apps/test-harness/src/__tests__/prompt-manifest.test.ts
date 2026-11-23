/**
 * The A2 prompt this harness hashes for provenance must be the same prompt it
 * sends to the model.
 *
 * `prompt-hash.ts` used to hardcode `a2-okuvu-v2.1.txt` while the shim served
 * v2.6, so every TestRun recorded a `promptHash` of a prompt no model saw. The
 * run identity header said one thing and the provenance stamp another, and the
 * only way to notice was to open both files. These tests pin the pair together:
 * the manifest resolves through `apps/api/src/prompts/index.ts` (the api's own
 * constant), and — when the build shim is present — hashes byte-for-byte the
 * prompt the harness actually sends.
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import { getMonorepoRoot, getPromptManifest, hashPromptFile, resolveA2PromptEntry } from '@/lib/prompt-hash';

const root = getMonorepoRoot();
const indexSrc = readFileSync(path.join(root, 'apps', 'api', 'src', 'prompts', 'index.ts'), 'utf-8');
const currentVersion = indexSrc.match(/A2_PROMPT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] as string;

describe('prompt manifest tracks the api prompt', () => {
  it('reads the api prompt version rather than a hardcoded one', () => {
    expect(currentVersion).toMatch(/^v\d+\.\d+$/);
    expect(resolveA2PromptEntry(root).version).toBe(currentVersion);
  });

  it('points at a file that exists and is named for its own version', () => {
    const entry = resolveA2PromptEntry(root);
    expect(path.basename(entry.path)).toBe(`a2-okuvu-${entry.version}.txt`);
    expect(existsSync(entry.path)).toBe(true);
    expect(hashPromptFile(entry.path)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps A15 in the manifest so a prompt-drift hash still covers memory extraction', () => {
    const manifest = getPromptManifest();
    expect(manifest.map((entry) => entry.agentId)).toEqual(['A2', 'A15']);
    for (const entry of manifest) expect(existsSync(entry.path)).toBe(true);
  });

  it('hashes the same bytes the harness sends to the model', () => {
    // `.generated/prompt-shim.ts` is a build artifact (written by the prebuild
    // step), so it is absent on a bare checkout. Compare when it is there.
    const shimPath = path.join(root, 'apps', 'test-harness', '.generated', 'prompt-shim.ts');
    if (!existsSync(shimPath)) return;

    const shimSrc = readFileSync(shimPath, 'utf-8');
    const shimVersion = shimSrc.match(/A2_PROMPT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const body = JSON.parse(shimSrc.match(/A2_PROMPT = (".*?");\n/s)![1]) as string;
    const shimHash = createHash('sha256').update(Buffer.from(body, 'utf-8')).digest('hex');

    const entry = resolveA2PromptEntry(root);
    expect(shimVersion).toBe(entry.version);
    expect(shimHash).toBe(hashPromptFile(entry.path));
  });
});
