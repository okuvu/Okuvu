import { describe, it, expect } from 'vitest';
import { createNewVersion, diffCases } from '../lib/corpus-versioning';
import type { CorpusCase } from '@evia/shared-types';

function makeCase(overrides?: Partial<CorpusCase>): CorpusCase {
  return {
    id: 'case-1',
    type: 'safety',
    version: 1,
    input: 'Original input text',
    expectedOutput: 'Original expected output',
    tags: ['tag-a', 'tag-b'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    dataOrigin: 'synthetic',
    ...overrides,
  };
}

describe('createNewVersion', () => {
  it('copies input/expectedOutput into the new row rather than referencing the old one', () => {
    const previous = makeCase();
    const next = createNewVersion(previous, { input: 'Updated input text' });

    expect(next.input).toBe('Updated input text');
    expect(next.expectedOutput).toBe(previous.expectedOutput);

    // Mutating the previous case afterward must not affect the already-built
    // new version data — proves it was copied, not referenced.
    previous.input = 'mutated!';
    previous.expectedOutput = 'mutated!';
    expect(next.input).toBe('Updated input text');
    expect(next.expectedOutput).toBe('Original expected output');
  });

  it('merges only the provided updates, falling back to previous values otherwise', () => {
    const previous = makeCase();
    const next = createNewVersion(previous, { tags: ['tag-c'] });

    expect(next.input).toBe(previous.input);
    expect(next.expectedOutput).toBe(previous.expectedOutput);
    expect(next.tags).toEqual(['tag-c']);
  });

  it('does not mutate the tags array by reference when no tag update is given', () => {
    const previous = makeCase();
    const next = createNewVersion(previous, { input: 'changed' });

    expect(next.tags).toEqual(previous.tags);
    expect(next.tags).not.toBe(previous.tags);

    next.tags.push('extra');
    expect(previous.tags).toEqual(['tag-a', 'tag-b']);
  });

  it('increments the version number', () => {
    const previous = makeCase({ version: 3 });
    const next = createNewVersion(previous, {});
    expect(next.version).toBe(4);
  });

  it('sets supersedesId to the previous case id', () => {
    const previous = makeCase({ id: 'case-abc' });
    const next = createNewVersion(previous, {});
    expect(next.supersedesId).toBe('case-abc');
  });

  it('preserves type and dataOrigin from the previous case', () => {
    const previous = makeCase({ type: 'persona', dataOrigin: 'paraphrased' });
    const next = createNewVersion(previous, {});
    expect(next.type).toBe('persona');
    expect(next.dataOrigin).toBe('paraphrased');
  });
});

describe('diffCases', () => {
  it('reports no changes for identical cases', () => {
    const a = makeCase();
    const b = makeCase();
    const diff = diffCases(a, b);
    expect(diff).toEqual({
      inputChanged: false,
      expectedOutputChanged: false,
      tagsAdded: [],
      tagsRemoved: [],
    });
  });

  it('detects input and expectedOutput changes', () => {
    const a = makeCase();
    const b = makeCase({ input: 'different input', expectedOutput: 'different output' });
    const diff = diffCases(a, b);
    expect(diff.inputChanged).toBe(true);
    expect(diff.expectedOutputChanged).toBe(true);
  });

  it('detects added and removed tags', () => {
    const a = makeCase({ tags: ['tag-a', 'tag-b'] });
    const b = makeCase({ tags: ['tag-b', 'tag-c'] });
    const diff = diffCases(a, b);
    expect(diff.tagsAdded).toEqual(['tag-c']);
    expect(diff.tagsRemoved).toEqual(['tag-a']);
  });

  it('treats undefined and empty-string expectedOutput as unchanged', () => {
    const a = makeCase({ expectedOutput: undefined });
    const b = makeCase({ expectedOutput: '' });
    const diff = diffCases(a, b);
    expect(diff.expectedOutputChanged).toBe(false);
  });
});
