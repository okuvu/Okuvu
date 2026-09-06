'use client';

import { useSession } from 'next-auth/react';
import CurrentPinPanel from './CurrentPinPanel';
import PinModelVersionForm from './PinModelVersionForm';
import TemperatureForm from './TemperatureForm';
import PromptRegistryTable from './PromptRegistryTable';

export default function ConfigRegistryClient() {
  const { data: session } = useSession();
  const isPI = session?.user?.role === 'PI';

  return (
    <div className="flex flex-col gap-[var(--spacing-xl)] p-[var(--spacing-lg)]">
      <div>
        <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
          Model Config Registry
        </h1>
        <p className="mt-1 text-[var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
          Pin model versions, temperature, and prompt hashes so test runs record a reproducible
          config triple.
        </p>
      </div>

      <section className="flex flex-col gap-[var(--spacing-sm)]">
        <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
          Current pin
        </h2>
        <CurrentPinPanel />
      </section>

      {isPI ? (
        <section className="flex flex-col gap-[var(--spacing-sm)]">
          <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
            Pin a new config (PI only)
          </h2>
          <div className="flex flex-col gap-[var(--spacing-md)] sm:flex-row sm:items-start">
            <PinModelVersionForm />
            <TemperatureForm />
          </div>
        </section>
      ) : (
        <p className="text-[var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
          Only PI-role users may pin new model configs or change temperature.
        </p>
      )}

      <section className="flex flex-col gap-[var(--spacing-sm)]">
        <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
          Prompt registry
        </h2>
        <PromptRegistryTable />
      </section>
    </div>
  );
}
