'use client';

import { useEffect, useState, useTransition } from 'react';
import type { TestEnvironment } from '@okuvu/shared-types';
import type { CorpusCaseWithLineage } from '@/server/routers/corpus';
import { diffCases } from '@/lib/corpus-versioning';
import { listCasesAction, versionCaseAction, generateVariationsAction } from '../actions';
import BadgeChip from '@/app/components/BadgeChip';

// Kept as a local, presentation-only list rather than importing from
// case-factory.ts — that module pulls in vertex-ai.ts (Node-only GCP client
// libraries), which must never end up in a 'use client' bundle.
const VARIATION_KINDS = [
  'rephrasing',
  'persona_shift',
  'intensity_shift',
  'disguised_crisis',
  'injection',
  'edge_case',
] as const;
type VariationKind = (typeof VARIATION_KINDS)[number];

interface FactoryResult {
  created: number;
  duplicates: number;
  failed: number;
}

/** Walk supersedesId edges (in either direction) to find every case in the same lineage. */
function buildLineage(
  allCases: CorpusCaseWithLineage[],
  caseId: string,
): CorpusCaseWithLineage[] {
  const byId = new Map(allCases.map((c) => [c.id, c]));
  const selected = byId.get(caseId);
  if (!selected) return [];

  // Find the root by walking supersedesId backward.
  let root = selected;
  const visited = new Set<string>();
  while (root.supersedesId && byId.has(root.supersedesId) && !visited.has(root.id)) {
    visited.add(root.id);
    root = byId.get(root.supersedesId)!;
  }

  // Collect the whole lineage forward from the root.
  const lineage: CorpusCaseWithLineage[] = [root];
  let current = root;
  const seen = new Set([root.id]);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = allCases.find((c) => c.supersedesId === current.id && !seen.has(c.id));
    if (!next) break;
    lineage.push(next);
    seen.add(next.id);
    current = next;
  }

  return lineage.sort((a, b) => a.version - b.version);
}

export default function CaseEditor({
  selectedCase,
  allCases,
  environment,
  onVersioned,
  onGenerated,
}: {
  selectedCase: CorpusCaseWithLineage;
  allCases: CorpusCaseWithLineage[];
  environment: TestEnvironment;
  onVersioned: () => void;
  onGenerated: () => void;
}) {
  const [lineage, setLineage] = useState<CorpusCaseWithLineage[]>([selectedCase]);
  const [editInput, setEditInput] = useState(selectedCase.input);
  const [editExpected, setEditExpected] = useState(selectedCase.expectedOutput ?? '');
  const [editTags, setEditTags] = useState(selectedCase.tags.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [selectedKinds, setSelectedKinds] = useState<Set<VariationKind>>(new Set(VARIATION_KINDS));
  const [isGenerating, setIsGenerating] = useState(false);
  const [factoryError, setFactoryError] = useState<string | null>(null);
  const [factoryResult, setFactoryResult] = useState<FactoryResult | null>(null);

  useEffect(() => {
    setEditInput(selectedCase.input);
    setEditExpected(selectedCase.expectedOutput ?? '');
    setEditTags(selectedCase.tags.join(', '));
    setFactoryError(null);
    setFactoryResult(null);

    // Fetch full history for this case's type so the lineage is complete
    // even if the parent list is currently showing only latest versions.
    startTransition(async () => {
      const result = await listCasesAction({
        type: selectedCase.type,
        environment,
        includeHistory: true,
      });
      if (result.success) {
        setLineage(buildLineage(result.data, selectedCase.id));
      } else {
        setLineage(buildLineage(allCases, selectedCase.id));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCase.id]);

  const handleCreateVersion = () => {
    setError(null);
    startTransition(async () => {
      const result = await versionCaseAction({
        caseId: selectedCase.id,
        updates: {
          input: editInput !== selectedCase.input ? editInput : undefined,
          expectedOutput:
            editExpected !== (selectedCase.expectedOutput ?? '') ? editExpected : undefined,
          tags: editTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        },
        environment,
      });
      if (result.success) {
        onVersioned();
      } else {
        setError(result.error);
      }
    });
  };

  const toggleKind = (kind: VariationKind) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const handleGenerateVariations = () => {
    if (selectedKinds.size === 0 || isGenerating) return;
    setFactoryError(null);
    setFactoryResult(null);
    setIsGenerating(true);

    (async () => {
      const result = await generateVariationsAction({
        seedCaseId: selectedCase.id,
        kinds: Array.from(selectedKinds),
        environment,
      });
      setIsGenerating(false);
      if (result.success) {
        setFactoryResult({
          created: result.data.created.length,
          duplicates: result.data.duplicates.length,
          failed: result.data.failed.length,
        });
        onGenerated();
      } else {
        setFactoryError(result.error);
      }
    })();
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
      <div>
        <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
          {selectedCase.type} — v{selectedCase.version}
        </h2>
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          id: {selectedCase.id}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[var(--text-label-sm)] font-medium text-[var(--color-on-surface)]">
          Version history
        </h3>
        <ul className="flex flex-col gap-1">
          {lineage.map((v, idx) => {
            const prev = lineage[idx - 1];
            const diff = prev ? diffCases(prev, v) : null;
            return (
              <li
                key={v.id}
                className={`rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] p-2 text-[var(--text-label-sm)] ${
                  v.id === selectedCase.id ? 'bg-[var(--color-surface-container-low)]' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <BadgeChip>v{v.version}</BadgeChip>
                  <span className="text-[var(--color-on-surface-variant)]">
                    {new Date(v.createdAt).toLocaleString()}
                  </span>
                </div>
                {diff && (
                  <p className="mt-1 text-[var(--color-on-surface-variant)]">
                    {diff.inputChanged && 'input changed'}
                    {diff.expectedOutputChanged &&
                      (diff.inputChanged ? ', expected output changed' : 'expected output changed')}
                    {(diff.tagsAdded.length > 0 || diff.tagsRemoved.length > 0) &&
                      ` — tags +[${diff.tagsAdded.join(', ')}] -[${diff.tagsRemoved.join(', ')}]`}
                    {!diff.inputChanged &&
                      !diff.expectedOutputChanged &&
                      diff.tagsAdded.length === 0 &&
                      diff.tagsRemoved.length === 0 &&
                      'no changes'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[var(--text-label-sm)] font-medium text-[var(--color-on-surface)]">
          Case factory
        </h3>
        {selectedCase.seedId ? (
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            This case is itself a factory-generated variant (seed: {selectedCase.seedId}) — only a
            golden, hand-authored case can be used as a seed.
          </p>
        ) : (
          <>
            <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              Generate labelled variations of this case. Only &quot;rephrasing&quot; is
              label-preserving — every other kind is flagged for adjudication until a human
              confirms the expected behavior still applies.
            </p>
            <div className="flex flex-wrap gap-3">
              {VARIATION_KINDS.map((kind) => (
                <label
                  key={kind}
                  className="flex items-center gap-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedKinds.has(kind)}
                    onChange={() => toggleKind(kind)}
                  />
                  {kind}
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={selectedKinds.size === 0 || isGenerating}
              onClick={handleGenerateVariations}
              className="self-start rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] disabled:opacity-50"
            >
              {isGenerating ? 'Generating…' : `Generate variations (${selectedKinds.size})`}
            </button>
            {factoryResult && (
              <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                Created {factoryResult.created}, skipped {factoryResult.duplicates} duplicate
                {factoryResult.duplicates === 1 ? '' : 's'}, {factoryResult.failed} generation
                {factoryResult.failed === 1 ? '' : 's'} failed.
              </p>
            )}
            {factoryError && (
              <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{factoryError}</p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[var(--text-label-sm)] font-medium text-[var(--color-on-surface)]">
          Create new version
        </h3>
        <label className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Input
          <textarea
            value={editInput}
            onChange={(e) => setEditInput(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          />
        </label>
        <label className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Expected output
          <textarea
            value={editExpected}
            onChange={(e) => setEditExpected(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          />
        </label>
        <label className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Tags (comma-separated)
          <input
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          />
        </label>
        <button
          type="button"
          disabled={isPending}
          onClick={handleCreateVersion}
          className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-3 py-1.5 text-[var(--text-label-sm)] font-medium text-[var(--color-on-primary)] disabled:opacity-50"
        >
          Save as new version
        </button>
        {error && <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{error}</p>}
      </div>
    </div>
  );
}
