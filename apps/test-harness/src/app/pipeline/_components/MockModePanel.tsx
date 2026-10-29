'use client';

import type { GovernanceState, SafetyState, TestAgentId } from '@okuvu/shared-types';
import { SAFETY_LABELS } from '@okuvu/shared-types';
import { AGENT_ORDER, mockModeFor, type MockInput } from '@/lib/dependency-graph';
import { MOCK_INPUT_LABELS, type MockValues } from './mock-mode-mapping';

const SAFETY_OPTIONS: SafetyState[] = ['S0', 'S1', 'S2', 'S3', 'S4'];
const GOVERNANCE_OPTIONS: GovernanceState[] = ['Active', 'Restricted', 'Blocked'];
const ROUTER_AGENT_OPTIONS = ['crisis', 'medical-emergency', 'deterministic-grounding', 'A2'] as const;
const ROUTER_MODE_OPTIONS = ['normal', 'blocked'] as const;

const FIELD_LABEL_CLASS =
  'text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]';
const CONTROL_CLASS =
  'rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]';

export default function MockModePanel({
  enabled,
  onToggleEnabled,
  targetAgent,
  onTargetAgentChange,
  values,
  onValuesChange,
}: {
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  targetAgent: TestAgentId;
  onTargetAgentChange: (agent: TestAgentId) => void;
  values: MockValues;
  onValuesChange: (values: MockValues) => void;
}) {
  const requiredInputs = mockModeFor(targetAgent).requiredInputs;

  const renderField = (input: MockInput) => {
    switch (input) {
      case 'safetyState':
        return (
          <label key={input} className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{MOCK_INPUT_LABELS[input]}</span>
            <select
              value={values.safetyState ?? ''}
              onChange={(e) =>
                onValuesChange({
                  ...values,
                  safetyState: (e.target.value || undefined) as SafetyState | undefined,
                })
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select...</option>
              {SAFETY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} — {SAFETY_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        );
      case 'governanceState':
        return (
          <label key={input} className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{MOCK_INPUT_LABELS[input]}</span>
            <select
              value={values.governanceState ?? ''}
              onChange={(e) =>
                onValuesChange({
                  ...values,
                  governanceState: (e.target.value || undefined) as GovernanceState | undefined,
                })
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select...</option>
              {GOVERNANCE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        );
      case 'routerDecision':
        return (
          <div key={input} className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{MOCK_INPUT_LABELS[input]}</span>
            <div className="flex gap-2">
              <select
                value={values.routerDecision?.agent ?? ''}
                onChange={(e) => {
                  const agent = e.target.value as (typeof ROUTER_AGENT_OPTIONS)[number] | '';
                  onValuesChange({
                    ...values,
                    routerDecision: agent
                      ? { agent, mode: values.routerDecision?.mode }
                      : undefined,
                  });
                }}
                className={CONTROL_CLASS}
              >
                <option value="">Agent...</option>
                {ROUTER_AGENT_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                value={values.routerDecision?.mode ?? ''}
                disabled={!values.routerDecision}
                onChange={(e) => {
                  const mode = e.target.value as (typeof ROUTER_MODE_OPTIONS)[number] | '';
                  if (!values.routerDecision) return;
                  onValuesChange({
                    ...values,
                    routerDecision: { ...values.routerDecision, mode: mode || undefined },
                  });
                }}
                className={`${CONTROL_CLASS} disabled:opacity-50`}
              >
                <option value="">Mode (optional)...</option>
                {ROUTER_MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      case 'retrievedContext':
        return (
          <label key={input} className="flex flex-col gap-1 sm:col-span-2">
            <span className={FIELD_LABEL_CLASS}>{MOCK_INPUT_LABELS[input]}</span>
            <textarea
              value={values.retrievedContext ?? ''}
              onChange={(e) =>
                onValuesChange({ ...values, retrievedContext: e.target.value || undefined })
              }
              rows={3}
              className={CONTROL_CLASS}
              placeholder="Retrieved context to inject in place of the real RAG call..."
            />
          </label>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <div className="flex items-center justify-between gap-[var(--spacing-md)]">
        <div>
          <h2 className="text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-surface)]">
            Mock Mode
          </h2>
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            Run one agent in isolation by injecting the upstream signals it would otherwise
            depend on.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
          <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)]">
            Enable
          </span>
        </label>
      </div>

      {enabled ? (
        <>
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>Target agent</span>
            <select
              value={targetAgent}
              onChange={(e) => onTargetAgentChange(e.target.value as TestAgentId)}
              className={CONTROL_CLASS}
            >
              {AGENT_ORDER.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          {requiredInputs.length === 0 ? (
            <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              {targetAgent} has no upstream dependencies — nothing to mock.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">{requiredInputs.map(renderField)}</div>
          )}

          <p className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 px-3 py-2 text-[var(--text-label-sm)] text-amber-900">
            &#9888;&#65039; Running in Mock Mode — upstream agents bypassed
          </p>
        </>
      ) : null}
    </div>
  );
}
