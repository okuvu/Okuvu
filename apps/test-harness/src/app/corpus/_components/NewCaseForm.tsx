'use client';

import { useState, useTransition } from 'react';
import type { CorpusCaseType, TestEnvironment } from '@okuvu/shared-types';
import type { createCaseAction } from '../actions';

const CASE_TYPES: CorpusCaseType[] = ['safety', 'fidelity', 'adversarial', 'persona'];
const DATA_ORIGINS: Array<'synthetic' | 'paraphrased' | 'real'> = [
  'synthetic',
  'paraphrased',
  'real',
];

export default function NewCaseForm({
  environment,
  onCreated,
  createCaseAction: createCase,
}: {
  environment: TestEnvironment;
  onCreated: () => void;
  createCaseAction: typeof createCaseAction;
}) {
  const [type, setType] = useState<CorpusCaseType>('safety');
  const [input, setInput] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [tags, setTags] = useState('');
  const [dataOrigin, setDataOrigin] = useState<'synthetic' | 'paraphrased' | 'real'>('synthetic');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCase({
        type,
        input,
        expected_output: expectedOutput || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        data_origin: dataOrigin,
        environment,
      });
      if (result.success) {
        onCreated();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]"
    >
      <div className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CorpusCaseType)}
          className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
        >
          {CASE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={dataOrigin}
          onChange={(e) => setDataOrigin(e.target.value as 'synthetic' | 'paraphrased' | 'real')}
          className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
        >
          {DATA_ORIGINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {dataOrigin === 'real' && environment !== 'beta' && (
          <span className="text-[var(--text-label-sm)] text-[var(--color-error)]">
            "real" data is only permitted in the beta environment — this will be rejected.
          </span>
        )}
      </div>
      <textarea
        required
        placeholder="Input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      />
      <textarea
        placeholder="Expected output (optional)"
        value={expectedOutput}
        onChange={(e) => setExpectedOutput(e.target.value)}
        rows={2}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      />
      <input
        placeholder="Tags (comma-separated)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      />
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-3 py-1.5 text-[var(--text-label-sm)] font-medium text-[var(--color-on-primary)] disabled:opacity-50"
      >
        Create case
      </button>
      {error && <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{error}</p>}
    </form>
  );
}
