'use client';

// 'continuity' is the B4 regression seed for the reset-on-affirmation bug
// (OKUVU — Plumbing Fixes & Rationale v1.0) — see lib/persona-scripts.ts.
const PERSONA_IDS = ['anxious', 'crisis-escalating', 'fidelity', 'adversarial', 'continuity'] as const;

export type PersonaId = (typeof PERSONA_IDS)[number];

export default function PersonaPicker({
  value,
  onChange,
}: {
  value: PersonaId;
  onChange: (personaId: PersonaId) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
        Persona script
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PersonaId)}
        className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      >
        {PERSONA_IDS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}
