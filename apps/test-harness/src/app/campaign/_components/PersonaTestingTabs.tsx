'use client';

import { useState } from 'react';
import ClinicalRunConsole from './ClinicalRunConsole';
import CampaignConsole from './CampaignConsole';

/**
 * One persona-testing screen, two modes.
 *
 * The harness had two front doors onto the same backend: the testing.okuvu.in
 * landing page (fixed clinical run — 1 session, 15–20 turns, transcript
 * emailed to the clinical reviewer) and /campaign (three sessions with
 * day-3/day-7 gaps, explicit seed, cost ceiling, inline verdicts). Both called
 * campaign.importPersonas + campaign.start + *.advance. Maintaining both meant
 * the fixed one silently fell behind whenever the runner changed.
 *
 * Merged rather than deleted: the clinical run is the default because it is
 * what the reviewer actually uses, and the campaign knobs are one click away
 * for whoever is debugging the runner. Same backend, one surface — a change to
 * the runner now shows up in both modes at once.
 */

type Mode = 'clinical' | 'advanced';

export default function PersonaTestingTabs() {
  const [mode, setMode] = useState<Mode>('clinical');

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Persona testing mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'clinical'}
            onClick={() => setMode('clinical')}
            className={[
              'rounded-[var(--radius-md)] px-3 py-1.5 text-[var(--text-label-sm)] font-medium transition-colors',
              mode === 'clinical'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                : 'text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-low)]',
            ].join(' ')}
          >
            Clinical run
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'advanced'}
            onClick={() => setMode('advanced')}
            className={[
              'rounded-[var(--radius-md)] px-3 py-1.5 text-[var(--text-label-sm)] font-medium transition-colors',
              mode === 'advanced'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                : 'text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-low)]',
            ].join(' ')}
          >
            Advanced campaign
          </button>
        </div>

        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          {mode === 'clinical' ? (
            <>
              Upload a persona sheet, one conversation of 15–20 turns per client, transcript emailed to
              the clinical reviewer. No settings — this is the run the reviewer uses.
            </>
          ) : (
            <>
              Same backend with the plan exposed: three sessions with day-3/day-7 gaps, an explicit seed,
              a cost ceiling, and a PASS/FAIL/UNGRADED verdict per conversation inline.
            </>
          )}
        </p>
      </div>

      {mode === 'clinical' ? <ClinicalRunConsole /> : <CampaignConsole />}
    </div>
  );
}
