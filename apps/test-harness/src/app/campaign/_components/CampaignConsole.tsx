'use client';

import { useMemo, useRef, useState } from 'react';
import { trpc } from '@/trpc/client';
import PersonaSheetUpload from './PersonaSheetUpload';
import CampaignResults from './CampaignResults';

type Environment = 'sandbox' | 'staging';
type GapPreset = 'immediate' | 'day3-day7' | 'weekly';

interface Params {
  environment: Environment;
  target: 'in-process' | 'live-websocket';
  sessions: number;
  turnsMin: number;
  turnsMax: number;
  gapPreset: GapPreset;
  seed: number;
  judgeEnabled: boolean;
  costCeilingUsd: number;
}

const DEFAULT_PARAMS: Params = {
  environment: 'sandbox',
  target: 'in-process',
  sessions: 3,
  turnsMin: 6,
  turnsMax: 12,
  gapPreset: 'day3-day7',
  seed: 42,
  judgeEnabled: true,
  costCeilingUsd: 25,
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
      <span className="font-medium text-[var(--color-on-surface)]">{label}</span>
      {children}
      {hint ? <span className="text-[var(--text-label-sm)] opacity-80">{hint}</span> : null}
    </label>
  );
}

const SELECT_CLASS =
  'rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[var(--text-label-sm)] text-[var(--color-on-surface)]';

/**
 * The /campaign console: upload personas → pick them → set the plan → run →
 * read verdicts. One page, in the order an operator actually works.
 *
 * Two honest constraints, stated in the UI rather than buried here:
 *   - the target is the in-process pipeline (this harness's real A1→A9→A2 run),
 *     not the deployed api.okuvu.in WebSocket — that driver does not exist yet;
 *   - the cost number is a planning estimate, and the ceiling counts only the
 *     simulator's token usage, not the pipeline's own spend.
 */
export default function CampaignConsole() {
  const utils = trpc.useUtils();

  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const stopRef = useRef(false);

  const personas = trpc.campaign.listPersonas.useQuery();
  const campaigns = trpc.campaign.list.useQuery();

  const estimate = trpc.campaign.estimate.useQuery(
    { ...params, personaIds: selectedIds },
    { enabled: selectedIds.length > 0 && params.turnsMax >= params.turnsMin, retry: false },
  );

  const start = trpc.campaign.start.useMutation();
  const advance = trpc.campaign.advance.useMutation();

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const persona of personas.data ?? []) {
      for (const tag of persona.tags) all.add(tag);
    }
    return [...all].sort();
  }, [personas.data]);

  const visiblePersonas = useMemo(
    () =>
      (personas.data ?? []).filter((persona) => (tagFilter ? persona.tags.includes(tagFilter) : true)),
    [personas.data, tagFilter],
  );

  const effectiveLabel = label.trim() || `${selectedIds.length} persona${selectedIds.length === 1 ? '' : 's'} · ${params.sessions} session${params.sessions === 1 ? '' : 's'}`;

  const togglePersona = (caseId: string) => {
    setSelectedIds((current) =>
      current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId],
    );
  };

  const handleStart = async () => {
    const result = await start.mutateAsync({ ...params, personaIds: selectedIds, label: effectiveLabel });
    setCampaignId(result.campaignId);
    await utils.campaign.list.invalidate();
  };

  const runSteps = async (stepsPerCall: number) => {
    if (!campaignId) return;
    stopRef.current = false;
    setAutoRunning(true);
    try {
      // The runner advances ONE step per call and persists after each, so a
      // stop here costs at most the step in flight — nothing is lost.
      for (;;) {
        if (stopRef.current) break;
        const result = await advance.mutateAsync({ campaignId, steps: stepsPerCall });
        await utils.campaign.get.invalidate({ campaignId });
        if (result.done) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch {
      // The mutation's error is rendered below; stopping the loop is enough here.
    } finally {
      setAutoRunning(false);
      await utils.campaign.get.invalidate({ campaignId });
      await utils.campaign.list.invalidate();
    }
  };

  const plan = estimate.data;
  const blockMessages = (plan?.blockers ?? []).filter((blocker) => blocker.severity === 'block');
  const warnMessages = (plan?.blockers ?? []).filter((blocker) => blocker.severity === 'warn');

  return (
    <div className="flex flex-col gap-[var(--spacing-xl)]">
      {/* ── 1. Upload ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
        <h2 className="text-[var(--text-title-md)] font-medium text-[var(--color-on-surface)]">1 · Upload personas</h2>
        <PersonaSheetUpload
          onImported={() => {
            void utils.campaign.listPersonas.invalidate();
          }}
        />
      </section>

      {/* ── 2. Pick ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[var(--text-title-md)] font-medium text-[var(--color-on-surface)]">
            2 · Pick personas
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-[var(--text-label-sm)]">
            <span className="text-[var(--color-on-surface-variant)]">{selectedIds.length} selected</span>
            <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className={SELECT_CLASS}>
              <option value="">all tags</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSelectedIds(visiblePersonas.map((persona) => persona.caseId))}
              className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-2 py-1"
            >
              Select all shown
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-2 py-1"
            >
              Clear
            </button>
          </div>
        </div>

        {personas.isLoading ? (
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">Loading the persona bank…</p>
        ) : null}
        {personas.error ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{personas.error.message}</p>
        ) : null}
        {personas.data && personas.data.length === 0 ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            The persona bank is empty. Upload a sheet above.
          </p>
        ) : null}

        {(personas.data?.length ?? 0) > 0 ? (
          <div className="max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]">
            <table className="w-full text-left text-[var(--text-label-sm)]">
              <thead className="sticky top-0 bg-[var(--color-surface-container-low)]">
                <tr>
                  <th className="px-2 py-1" />
                  <th className="px-2 py-1">personaId</th>
                  <th className="px-2 py-1">ver</th>
                  <th className="px-2 py-1">trajectory</th>
                  <th className="px-2 py-1">rubric</th>
                  <th className="px-2 py-1">tags</th>
                </tr>
              </thead>
              <tbody>
                {visiblePersonas.map((persona) => (
                  <tr key={persona.caseId} className="border-t border-[var(--color-outline-variant)]">
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        aria-label={`select ${persona.personaId}`}
                        checked={selectedIds.includes(persona.caseId)}
                        onChange={() => togglePersona(persona.caseId)}
                      />
                    </td>
                    <td className="px-2 py-1 font-medium">{persona.personaId}</td>
                    <td className="px-2 py-1">{persona.personaVersion}</td>
                    <td className="px-2 py-1">{persona.trajectory ?? '—'}</td>
                    <td className="px-2 py-1">
                      {persona.hasRubric ? (
                        <span title={persona.expectedBehavior ?? ''} className="text-emerald-700">
                          ✓
                        </span>
                      ) : (
                        <span className="text-amber-700">ungraded</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-[var(--color-on-surface-variant)]">{persona.tags.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* ── 3. Parameters ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
        <h2 className="text-[var(--text-title-md)] font-medium text-[var(--color-on-surface)]">3 · Parameters</h2>

        <div className="grid grid-cols-2 gap-[var(--spacing-md)] sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Target">
            <select
              value={params.target}
              onChange={(event) => setParams({ ...params, target: event.target.value as Params['target'] })}
              className={SELECT_CLASS}
            >
              <option value="in-process">in-process pipeline</option>
              <option value="live-websocket" disabled>
                live WebSocket (not built)
              </option>
            </select>
          </Field>

          <Field label="Environment" hint="beta is refused by the runner's rails">
            <select
              value={params.environment}
              onChange={(event) => setParams({ ...params, environment: event.target.value as Environment })}
              className={SELECT_CLASS}
            >
              <option value="sandbox">sandbox (canned, free)</option>
              <option value="staging">staging (real models)</option>
            </select>
          </Field>

          <Field label="Sessions per persona">
            <select
              value={params.sessions}
              onChange={(event) => setParams({ ...params, sessions: Number(event.target.value) })}
              className={SELECT_CLASS}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Gaps between sessions" hint="story-time: days cost seconds">
            <select
              value={params.gapPreset}
              onChange={(event) => setParams({ ...params, gapPreset: event.target.value as GapPreset })}
              className={SELECT_CLASS}
            >
              <option value="immediate">back to back</option>
              <option value="day3-day7">day 0 / 3 / 7</option>
              <option value="weekly">weekly</option>
            </select>
          </Field>

          <Field label="Turns per session — min">
            <select
              value={params.turnsMin}
              onChange={(event) => {
                const turnsMin = Number(event.target.value);
                setParams({ ...params, turnsMin, turnsMax: Math.max(turnsMin, params.turnsMax) });
              }}
              className={SELECT_CLASS}
            >
              {[2, 4, 6, 8, 10, 12, 16, 20].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Turns per session — max">
            <select
              value={params.turnsMax}
              onChange={(event) => setParams({ ...params, turnsMax: Number(event.target.value) })}
              className={SELECT_CLASS}
            >
              {[4, 6, 8, 10, 12, 16, 20, 24].map((value) => (
                <option key={value} value={value} disabled={value < params.turnsMin}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Seed" hint="same seed + same personas = comparable runs">
            <input
              type="number"
              min={0}
              value={params.seed}
              onChange={(event) => setParams({ ...params, seed: Number(event.target.value) })}
              className={SELECT_CLASS}
            />
          </Field>

          <Field label="Judge">
            <select
              value={params.judgeEnabled ? 'on' : 'off'}
              onChange={(event) => setParams({ ...params, judgeEnabled: event.target.value === 'on' })}
              className={SELECT_CLASS}
            >
              <option value="on">on — grade each session</option>
              <option value="off">off — conversations stay UNGRADED</option>
            </select>
          </Field>

          <Field label="Cost ceiling (USD)" hint="hard stop; the run ends INCOMPLETE">
            <input
              type="number"
              min={0.01}
              step={0.5}
              value={params.costCeilingUsd}
              onChange={(event) => setParams({ ...params, costCeilingUsd: Number(event.target.value) })}
              className={SELECT_CLASS}
            />
          </Field>
        </div>

        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Language mode is fixed to English: the in-process simulator writes English, and the pipeline runs on its
          default language mode. Mirror/Hinglish behaviour needs the live driver.
        </p>
      </section>

      {/* ── 4. Preview + run ──────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
        <h2 className="text-[var(--text-title-md)] font-medium text-[var(--color-on-surface)]">4 · Preview and run</h2>

        {selectedIds.length === 0 ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Select at least one persona to see the plan.
          </p>
        ) : null}

        {estimate.isLoading && selectedIds.length > 0 ? (
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">Estimating…</p>
        ) : null}
        {estimate.error ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{estimate.error.message}</p>
        ) : null}

        {plan ? (
          <>
            <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
              {plan.personas.length} persona{plan.personas.length === 1 ? '' : 's'} × {params.sessions} session
              {params.sessions === 1 ? '' : 's'} × {params.turnsMin}–{params.turnsMax} turns ={' '}
              <strong>{plan.estimate.plannedTurns} turns</strong> planned. Estimate{' '}
              <strong>${plan.estimate.totalUsd.toFixed(2)}</strong> (${plan.estimate.pipelineUsd.toFixed(2)} pipeline + $
              {plan.estimate.simulatorUsd.toFixed(2)} simulator + ${plan.estimate.judgeUsd.toFixed(2)} judge). Ceiling $
              {plan.estimate.costCeilingUsd.toFixed(2)}. Simulator:{' '}
              <code>{plan.simulatorModel ?? 'unresolved'}</code>
            </p>
            <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              Token arithmetic at qwen3-32b rates ($0.18/$0.71 per 1M) — the A2 prompt alone is re-sent at ~13.5k
              tokens per turn. The ceiling counts the simulator&apos;s token usage, not the pipeline&apos;s own spend.
            </p>

            {blockMessages.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-2 text-[var(--text-label-sm)] text-red-700">
                {blockMessages.map((blocker) => (
                  <li key={blocker.code}>✕ {blocker.message}</li>
                ))}
              </ul>
            ) : null}
            {warnMessages.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-2 text-[var(--text-label-sm)] text-amber-700">
                {warnMessages.map((blocker) => (
                  <li key={blocker.code}>⚠ {blocker.message}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-end gap-2">
              <Field label="Campaign label">
                <input
                  type="text"
                  value={label}
                  placeholder={effectiveLabel}
                  onChange={(event) => setLabel(event.target.value)}
                  className={`${SELECT_CLASS} min-w-[18rem]`}
                />
              </Field>
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!plan.canStart || start.isPending || autoRunning}
                className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] text-[var(--color-on-primary)] disabled:opacity-50"
              >
                {start.isPending ? 'Starting…' : 'Start campaign'}
              </button>
            </div>

            {start.error ? (
              <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{start.error.message}</p>
            ) : null}
          </>
        ) : null}

        {campaignId ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                Campaign <code>{campaignId}</code>
              </span>
              <button
                type="button"
                onClick={() => void runSteps(1)}
                disabled={autoRunning}
                className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1 text-[var(--text-label-sm)] disabled:opacity-50"
              >
                Run next step
              </button>
              <button
                type="button"
                onClick={() => void runSteps(3)}
                disabled={autoRunning}
                className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-3 py-1 text-[var(--text-label-sm)] text-[var(--color-on-primary)] disabled:opacity-50"
              >
                {autoRunning ? 'Running…' : 'Run to the end'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopRef.current = true;
                }}
                disabled={!autoRunning}
                className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1 text-[var(--text-label-sm)] disabled:opacity-50"
              >
                Stop
              </button>
            </div>
            {advance.error ? (
              <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{advance.error.message}</p>
            ) : null}
            <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              Each step is one turn or one session close, persisted before the next. Grading runs on the final step.
            </p>
          </div>
        ) : null}
      </section>

      {/* ── 5. Results ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[var(--text-title-md)] font-medium text-[var(--color-on-surface)]">5 · Results</h2>
          {campaigns.data && campaigns.data.length > 0 ? (
            <select
              value={campaignId ?? ''}
              onChange={(event) => setCampaignId(event.target.value || null)}
              className={SELECT_CLASS}
            >
              <option value="">recent campaigns…</option>
              {campaigns.data.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.label} · {campaign.status} · {campaign.personaCount} persona(s)
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {campaignId ? (
          <CampaignResults campaignId={campaignId} />
        ) : (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            No campaign selected. Start one above, or pick a recent campaign.
          </p>
        )}
      </section>
    </div>
  );
}
