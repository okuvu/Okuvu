'use client';

import { PERSONA_LABELS, type PersonaId } from '@/lib/persona-scripts';
import { FAULT_OPTIONS, type FaultOptionId } from './fault-options';
import BreathingPulse from './BreathingPulse';
import PanelHeader from './PanelHeader';
import type { ScenarioChoice } from './scenario-choice';
import type { TestEnvironment } from '@okuvu/shared-types';

const SCENARIO_DESCRIPTIONS: Record<PersonaId, string> = {
  anxious: 'Escalating anxiety over the conversation',
  'crisis-escalating': 'Tests the crisis safety pathway',
  fidelity: 'Requests outside the agent’s scope',
  adversarial: 'Attempts to break the agent’s rules',
  continuity: 'Regression seed: consent must continue, never re-onboard',
};

const SCENARIO_ICONS: Record<PersonaId, string> = {
  anxious: 'sentiment_dissatisfied',
  'crisis-escalating': 'emergency',
  fidelity: 'rule',
  adversarial: 'security',
  continuity: 'history',
};

const DEFAULT_ORDER: PersonaId[] = ['anxious', 'crisis-escalating', 'fidelity', 'adversarial', 'continuity'];
const CUSTOM_DESCRIPTION = 'Skip the script — write your own opening message';

const ENVIRONMENT_LABEL: Record<TestEnvironment, string> = {
  sandbox: 'Sandbox (free/simulated)',
  staging: 'Staging (live model)',
  beta: 'Beta (live model)',
};

function Icon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">
      {name}
    </span>
  );
}

export default function LeftConfigPanel({
  environment,
  selection,
  recentSelection,
  onSelectionChange,
  sessionActive,
  onStartSession,
  starting,
  onEndSession,
  endSessionDisabled,
  onExport,
  exportDisabled,
  faultOption,
  onFaultChange,
}: {
  environment: TestEnvironment;
  selection: ScenarioChoice | null;
  /** Last scenario a session was actually started with — shown first in the list. */
  recentSelection: ScenarioChoice | null;
  onSelectionChange: (choice: ScenarioChoice) => void;
  sessionActive: boolean;
  onStartSession: () => void;
  starting: boolean;
  onEndSession: () => void;
  endSessionDisabled: boolean;
  onExport: () => void;
  exportDisabled: boolean;
  faultOption: FaultOptionId;
  onFaultChange: (id: FaultOptionId) => void;
}) {
  // "custom" is always last — only the 4 built-in personas get reordered by
  // recency, since "custom" has no fixed script to make recency meaningful.
  const recentPersonaId = recentSelection && recentSelection !== 'custom' ? recentSelection : null;
  const orderedIds: ScenarioChoice[] = [
    ...(recentPersonaId
      ? [recentPersonaId, ...DEFAULT_ORDER.filter((id) => id !== recentPersonaId)]
      : DEFAULT_ORDER),
    'custom',
  ];
  return (
    <div className="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-soft)]">
      {/* Primary action is sticky at the top — with 4 personas + the
          fail-safe selector, "Start session" previously sat below a long
          scrollable list and was effectively invisible without scrolling
          past everything else first. */}
      <div className="flex flex-col gap-2 border-b border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
        <button
          type="button"
          onClick={onStartSession}
          disabled={starting}
          className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-body-main)] font-medium text-[var(--color-on-primary)] transition-opacity disabled:opacity-50"
        >
          {starting ? <BreathingPulse size={12} /> : null}
          {starting ? 'Starting…' : sessionActive ? 'Start new session' : 'Start session'}
        </button>

        {sessionActive ? (
          <button
            type="button"
            onClick={onEndSession}
            disabled={endSessionDisabled}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] px-4 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)] transition-colors hover:bg-[var(--color-surface-container-high)] disabled:opacity-50"
          >
            <Icon name="stop_circle" />
            End session
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-[var(--spacing-md)] overflow-y-auto p-[var(--spacing-md)]">
      {environment !== 'sandbox' ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-container)] px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-warning-container)]">
          <Icon name="bolt" />
          <span>
            You're testing against the live model in {ENVIRONMENT_LABEL[environment]} — this uses
            real model calls, not free simulated replies.
          </span>
        </div>
      ) : null}

      <div>
        <PanelHeader icon="psychology">Scenario</PanelHeader>
        <div className="mt-2 flex flex-col gap-2">
          {orderedIds.map((id) => (
            <label
              key={id}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 transition-colors ${
                selection === id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-container)]'
                  : id === 'custom'
                    ? 'border-dashed border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)]'
                    : 'border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scenario"
                  checked={selection === id}
                  onChange={() => onSelectionChange(id)}
                  className="accent-[var(--color-primary)]"
                />
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    selection === id
                      ? 'bg-[var(--color-on-primary)]/70 text-[var(--color-primary)]'
                      : 'bg-[var(--color-simulator-surface)] text-[var(--color-primary)]'
                  }`}
                >
                  <Icon name={id === 'custom' ? 'edit_note' : SCENARIO_ICONS[id]} />
                </span>
                <span className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                  {id === 'custom' ? 'Custom scenario' : PERSONA_LABELS[id]}
                </span>
              </span>
              <span className="pl-8 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                {id === 'custom' ? CUSTOM_DESCRIPTION : SCENARIO_DESCRIPTIONS[id]}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] uppercase tracking-wide text-[var(--color-on-surface-variant)]">
          <Icon name="shield" />
          Test fail-safe behavior
        </h2>
        <select
          value={faultOption}
          onChange={(e) => onFaultChange(e.target.value as FaultOptionId)}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
        >
          {FAULT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {faultOption !== 'none' ? (
          <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            Applies to your next message only, then resets.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onExport}
        disabled={exportDisabled}
        className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-outline-variant)] px-4 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)] transition-colors hover:bg-[var(--color-surface-container-low)] disabled:opacity-50"
      >
        <Icon name="download" />
        Export conversation
      </button>

      <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        Environment: {ENVIRONMENT_LABEL[environment]}
      </p>
      </div>
    </div>
  );
}
