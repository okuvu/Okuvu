'use client';

// TH-S16 — sampling config form. Agent list mirrors the stochastic router's
// `testAgentIdSchema` (apps/test-harness/src/server/routers/stochastic.ts),
// which includes 'A10A' — not present in the single-agent AgentPicker — so
// this keeps its own list rather than reusing that component's type.
const SAMPLING_AGENT_IDS = [
  'A1',
  'A2',
  'A8',
  'A9-pre',
  'A9-post',
  'A10A',
  'A13',
  'A15',
] as const;

export type SamplingAgentId = (typeof SAMPLING_AGENT_IDS)[number];

export interface SamplingFormState {
  agentId: SamplingAgentId;
  /** Raw JSON text for the agent input payload; parsed by the caller. */
  inputJson: string;
  n: number;
  targetMetric: string;
  threshold: number;
  model: string;
}

export const DEFAULT_SAMPLING_FORM_STATE: SamplingFormState = {
  agentId: 'A1',
  inputJson: '{}',
  n: 200,
  targetMetric: 'signal',
  threshold: 0.8,
  model: 'meta-llama/llama-3.1-8b-instruct',
};

const labelClass =
  'text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]';
const inputClass =
  'rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)] disabled:opacity-50';

export default function SamplingConfigForm({
  value,
  onChange,
  disabled = false,
  inputJsonError,
  nError,
}: {
  value: SamplingFormState;
  onChange: (next: SamplingFormState) => void;
  disabled?: boolean;
  /** Validation message for the input-JSON textarea, computed by the caller. */
  inputJsonError?: string | null;
  /** Validation message for the N field (e.g. "must be at least 200"). */
  nError?: string | null;
}) {
  const set = <K extends keyof SamplingFormState>(key: K, val: SamplingFormState[K]) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-md)]">
      <div className="flex flex-wrap items-end gap-[var(--spacing-md)]">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Agent</span>
          <select
            value={value.agentId}
            disabled={disabled}
            onChange={(e) => set('agentId', e.target.value as SamplingAgentId)}
            className={inputClass}
          >
            {SAMPLING_AGENT_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Model (for cost estimate)</span>
          <input
            type="text"
            value={value.model}
            disabled={disabled}
            onChange={(e) => set('model', e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>N (samples, min 200)</span>
          <input
            type="number"
            min={200}
            step={1}
            value={value.n}
            disabled={disabled}
            onChange={(e) => set('n', Number(e.target.value))}
            className={`${inputClass} w-32`}
          />
          {nError ? (
            <span className="text-[var(--text-label-sm)] text-[var(--color-error)]">{nError}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Threshold (0–1)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={value.threshold}
            disabled={disabled}
            onChange={(e) => set('threshold', Number(e.target.value))}
            className={`${inputClass} w-28`}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>
          Target metric (dot-path into agent output, e.g. &quot;signal&quot; or &quot;fallbackUsed&quot;)
        </span>
        <input
          type="text"
          value={value.targetMetric}
          disabled={disabled}
          onChange={(e) => set('targetMetric', e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Agent input (JSON object)</span>
        <textarea
          value={value.inputJson}
          disabled={disabled}
          onChange={(e) => set('inputJson', e.target.value)}
          rows={4}
          spellCheck={false}
          className={`${inputClass} font-mono text-xs`}
        />
        {inputJsonError ? (
          <span className="text-[var(--text-label-sm)] text-[var(--color-error)]">
            {inputJsonError}
          </span>
        ) : null}
      </label>
    </div>
  );
}
