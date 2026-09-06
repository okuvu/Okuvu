'use client';

const AGENT_IDS = ['A1', 'A2', 'A8', 'A9-pre', 'A9-post', 'A13', 'A15'] as const;

export type PickableAgentId = (typeof AGENT_IDS)[number];

export default function AgentPicker({
  value,
  onChange,
}: {
  value: PickableAgentId;
  onChange: (agentId: PickableAgentId) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
        Agent
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PickableAgentId)}
        className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      >
        {AGENT_IDS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}
