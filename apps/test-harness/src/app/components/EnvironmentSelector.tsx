'use client';

import { useSession } from 'next-auth/react';
import type { TestEnvironment } from '@okuvu/shared-types';
import { useEnvironment } from '@/lib/environment-context';

/**
 * Environment color coding — a distinct semantic axis from run-status
 * colors (lib/run-status.ts). Centralized here per story constraints so a
 * later accessibility story can add colorblind labels in one place.
 */
const ENVIRONMENT_STYLES: Record<
  TestEnvironment,
  { label: string; dotClass: string; ringClass: string }
> = {
  sandbox: {
    label: 'Sandbox',
    dotClass: 'bg-emerald-500',
    ringClass: 'focus:ring-emerald-300',
  },
  staging: {
    label: 'Staging',
    dotClass: 'bg-amber-500',
    ringClass: 'focus:ring-amber-300',
  },
  beta: {
    label: 'Beta',
    dotClass: 'bg-red-500',
    ringClass: 'focus:ring-red-300',
  },
};

const ENVIRONMENT_ORDER: TestEnvironment[] = ['sandbox', 'staging', 'beta'];

export default function EnvironmentSelector() {
  const { data: session } = useSession();
  const { environment, setEnvironment } = useEnvironment();
  const allowedEnvironments = session?.user?.environments ?? ENVIRONMENT_ORDER;

  const current = ENVIRONMENT_STYLES[environment];

  return (
    <div className="relative inline-flex items-center">
      <span
        className={`pointer-events-none absolute left-3 h-2 w-2 rounded-full ${current.dotClass}`}
        aria-hidden="true"
      />
      <select
        aria-label="Select test environment"
        value={environment}
        onChange={(e) => setEnvironment(e.target.value as TestEnvironment)}
        className={`appearance-none rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] py-1.5 pl-7 pr-8 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)] focus:outline-none focus:ring-2 ${current.ringClass}`}
      >
        {ENVIRONMENT_ORDER.map((env) => {
          const isAllowed = allowedEnvironments.includes(env);
          return (
            <option
              key={env}
              value={env}
              disabled={!isAllowed}
              title={isAllowed ? undefined : `You do not have access to ${ENVIRONMENT_STYLES[env].label}`}
            >
              {ENVIRONMENT_STYLES[env].label}
              {!isAllowed ? ' (no access)' : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}
