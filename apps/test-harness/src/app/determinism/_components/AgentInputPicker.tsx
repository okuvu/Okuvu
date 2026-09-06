'use client';

import type { TestAgentId } from '@evia/shared-types';

export const DETERMINISM_AGENT_IDS: readonly TestAgentId[] = [
  'A1',
  'A2',
  'A8',
  'A9-pre',
  'A9-post',
  'A10A',
  'A13',
  'A15',
];

export function AgentPicker({
  value,
  onChange,
  label = 'Agent',
}: {
  value: TestAgentId;
  onChange: (agentId: TestAgentId) => void;
  label?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TestAgentId)}
        className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      >
        {DETERMINISM_AGENT_IDS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A JSON textarea for the agent's `input` payload. Parses on read (via
 * `parseInputJson`) rather than on every keystroke, so the user can type
 * invalid intermediate JSON without the field fighting them.
 */
export function InputJsonField({
  value,
  onChange,
  label = 'Input (JSON)',
}: {
  value: string;
  onChange: (raw: string) => void;
  label?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        spellCheck={false}
        className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
        style={{ fontFamily: '"IBM Plex Mono", monospace' }}
      />
    </label>
  );
}

/**
 * Parse the raw textarea contents into an input record. Returns `{ ok: true,
 * value }` on success (including for an empty string, which resolves to
 * `{}`), or `{ ok: false, error }` if the JSON is invalid or not an object.
 */
export function parseInputJson(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Input must be a JSON object.' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}
