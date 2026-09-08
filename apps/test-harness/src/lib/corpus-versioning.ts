import type { CorpusCase } from '@okuvu/shared-types';

/**
 * Build the data for a new version row of a CorpusCase.
 *
 * Per the story's explicit design note: the new row must COPY `input` and
 * `expectedOutput` (merged with `updates`) rather than referencing the
 * previous row, so that a diff between any two versions is self-contained
 * and doesn't require walking the `supersedesId` chain to resolve values.
 */
export type NewCorpusVersionData = Omit<CorpusCase, 'id' | 'createdAt' | 'updatedAt'> & {
  supersedesId: string;
};

export function createNewVersion(
  previous: CorpusCase,
  updates: Partial<{
    input: string;
    expectedOutput: string;
    tags: string[];
  }>,
): NewCorpusVersionData {
  return {
    type: previous.type,
    version: previous.version + 1,
    // Copy input/expectedOutput (merged with `updates`) into the new row
    // rather than referencing the previous row, so diffs between any two
    // versions are self-contained.
    input: updates.input ?? previous.input,
    expectedOutput: updates.expectedOutput ?? previous.expectedOutput,
    tags: updates.tags ?? [...previous.tags],
    dataOrigin: previous.dataOrigin,
    supersedesId: previous.id,
  };
}

export interface CorpusCaseDiff {
  inputChanged: boolean;
  expectedOutputChanged: boolean;
  tagsAdded: string[];
  tagsRemoved: string[];
}

/** Pure diff between two CorpusCase rows (e.g. two versions in a lineage). */
export function diffCases(a: CorpusCase, b: CorpusCase): CorpusCaseDiff {
  const aTags = new Set(a.tags);
  const bTags = new Set(b.tags);

  return {
    inputChanged: a.input !== b.input,
    expectedOutputChanged: (a.expectedOutput ?? '') !== (b.expectedOutput ?? ''),
    tagsAdded: b.tags.filter((tag) => !aTags.has(tag)),
    tagsRemoved: a.tags.filter((tag) => !bTags.has(tag)),
  };
}
