'use client';

import type { PickableAgentId } from './AgentPicker';

export interface AgentSchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

/**
 * Dynamic input form built from getAgentSchema's field list — a plain text
 * input, number input, or enum dropdown per field, with a JSON textarea only
 * for the rare field that's genuinely structured (e.g. A1/A2's
 * recentHistory). Every agent's schema (agent-schemas.ts) is just string/
 * number/enum/json fields, so this renders correctly for all of them, not
 * just A2 — there's no per-agent branching left to justify a raw-JSON
 * fallback for "everything else".
 */
export default function AgentForm({
  fields,
  value,
  onChange,
}: {
  agentId: PickableAgentId;
  fields: AgentSchemaField[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <FieldControl
          key={field.name}
          field={field}
          value={value[field.name]}
          onChange={(v) => onChange({ ...value, [field.name]: v })}
        />
      ))}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: AgentSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = (
    <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
      {field.name}
      {field.required ? ' *' : ''}
      {field.description ? ` — ${field.description}` : ''}
    </span>
  );

  if (field.type.startsWith('enum:')) {
    const options = field.type.slice('enum:'.length).split(',');
    return (
      <label className="flex flex-col gap-1">
        {label}
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
        >
          <option value="">(unset — use mock default)</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'number') {
    return (
      <label className="flex flex-col gap-1">
        {label}
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
        />
      </label>
    );
  }

  if (field.type === 'json') {
    const text = value === undefined ? '' : JSON.stringify(value, null, 2);
    return (
      <label className="col-span-full flex flex-col gap-1">
        {label}
        <textarea
          defaultValue={text}
          rows={4}
          spellCheck={false}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (raw === '') {
              onChange(undefined);
              return;
            }
            try {
              onChange(JSON.parse(raw));
            } catch {
              // leave previous value in place on parse failure
            }
          }}
          className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-3 font-mono text-xs text-[var(--color-on-surface)]"
        />
      </label>
    );
  }

  // string (default)
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      />
    </label>
  );
}
