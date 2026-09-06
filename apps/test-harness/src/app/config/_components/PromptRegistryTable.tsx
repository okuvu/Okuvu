'use client';

import { trpc } from '@/trpc/client';

interface PromptRegistryEntryView {
  agentId: string;
  path: string;
  version: string;
  contentHash: string;
}

export default function PromptRegistryTable() {
  const { data, isLoading, error } = trpc.testConfig.getPromptRegistry.useQuery();

  if (isLoading) {
    return (
      <p className="text-[var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
        Loading prompt registry…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-[var(--text-body-sm)] text-[var(--color-error)]">
        Failed to load prompt registry: {error.message}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)]">
      <table className="w-full text-left text-[var(--text-body-sm)]">
        <thead className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
          <tr>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Version</th>
            <th className="px-3 py-2 font-medium">Content hash (SHA-256)</th>
            <th className="px-3 py-2 font-medium">Path</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((entry: PromptRegistryEntryView, i: number) => (
            <tr
              key={`${entry.agentId}-${entry.path}-${i}`}
              className="border-t border-[var(--color-outline-variant)] text-[var(--color-on-surface)]"
            >
              <td className="px-3 py-2 font-medium">{entry.agentId}</td>
              <td className="px-3 py-2">{entry.version}</td>
              <td className="px-3 py-2 font-mono text-xs">{entry.contentHash}</td>
              <td className="px-3 py-2 font-mono text-xs text-[var(--color-on-surface-variant)]">
                {entry.path}
              </td>
            </tr>
          ))}
          {data?.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-3 py-4 text-center text-[var(--color-on-surface-variant)]"
              >
                No prompt files tracked yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
