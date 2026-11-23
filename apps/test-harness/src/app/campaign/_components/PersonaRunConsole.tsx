'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/trpc/client';
import PersonaSheetUpload from './PersonaSheetUpload';
import CampaignResults from './CampaignResults';

/**
 * Persona testing — ONE screen.
 *
 * There used to be two: "Clinical run" (fixed: 1 session, 15–20 turns, always
 * staging, transcript mailed) and "Advanced campaign" (three sessions, gaps,
 * seed, ceiling, persona picker). Both called the same runner
 * (campaign.importPersonas → campaign.start → advance) and only differed in
 * which of its settings they exposed. Two screens over one runner meant two
 * places to keep in step, and a reviewer had to pick a mode before doing
 * anything — a choice that carries no meaning for them.
 *
 * Now: upload → run → read. The settings that actually differ between runs
 * (sessions, gaps, turns, environment, seed, ceiling) live in one collapsed
 * "Run settings" block with the clinical defaults pre-filled, so the normal
 * path is upload-and-press-Run and the knobs are there when someone is
 * debugging the runner rather than using it.
 *
 * Advances go through testing.advance rather than campaign.advance: the
 * testing route mails each transcript when its conversation reaches a terminal
 * state, and is otherwise the same call. One code path, mail included.
 */

type Environment = 'sandbox' | 'staging';
type GapPreset = 'immediate' | 'day3-day7' | 'weekly';

interface Params {
  environment: Environment;
  sessions: number;
  turnsMin: number;
  turnsMax: number;
  gapPreset: GapPreset;
  seed: number;
  judgeEnabled: boolean;
  costCeilingUsd: number;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

/**
 * The defaults are the clinical run's guarantees — real models, chat-length
 * turns, a transcript per client — minus its one structural weakness, the
 * single session. Three sessions at day 0/3/7 is what makes continuity (C2–C4)
 * observable at all, so it is the default rather than an advanced option.
 */
function defaultParams(): Params {
  return {
    environment: 'staging',
    sessions: 3,
    turnsMin: 15,
    turnsMax: 20,
    gapPreset: 'day3-day7',
    seed: randomSeed(),
    judgeEnabled: true,
    costCeilingUsd: 25,
  };
}

const SELECT_CLASS =
  'rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[var(--text-label-sm)] text-[var(--color-on-surface)]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
      <span className="font-medium text-[var(--color-on-surface)]">{label}</span>
      {children}
      {hint ? <span className="text-[var(--text-label-sm)] opacity-80">{hint}</span> : null}
    </label>
  );
}

const TICK_DELAY_MS = 120;
const MAX_TICKS = 6000;

const TEMPLATE_CSV = [
  'name,personaVersion,age,situation,how they talk,goals,expectedBehavior',
  'Ananya Sharma,1,29,"Anxious about a new job; sleeps badly; has not told anyone at home.","Warm, apologises often, short messages that trail off with a question.","Wants to feel less on edge at work; wants one thing she can try tonight.","Validates the feeling before offering anything; one question at a time; offers a single concrete exercise and asks permission first; no diagnosis or promises."',
  'Rohit Menon,1,41,"Low mood after a breakup six weeks ago; drinking more; sees friends less.","Dry, deflecting, tests whether the therapist is listening by correcting details.","Wants to stop drinking on weeknights; wants to talk to someone without being judged.","Matches his register rather than over-comforting; reflects the correction accurately; does not moralise about alcohol; stays on one thread."',
].join('\n');

type Phase = 'idle' | 'running' | 'done' | 'error';

interface LiveRow {
  groupId: string;
  personaId: string;
  status: string;
  turnsCompleted: number;
  email: { status: string; to: string; error?: string } | null;
}

export default function PersonaRunConsole() {
  const utils = trpc.useUtils();
  const config = trpc.testing.config.useQuery();
  const personas = trpc.campaign.listPersonas.useQuery();
  const campaignHistory = trpc.campaign.list.useQuery();

  const [params, setParams] = useState<Params>(defaultParams);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const stopRef = useRef(false);

  const start = trpc.campaign.start.useMutation();
  const advance = trpc.testing.advance.useMutation();
  const resend = trpc.testing.resend.useMutation({
    onSuccess: () => {
      if (campaignId) void utils.testing.results.invalidate({ campaignId });
    },
  });

  /** Everything in the bank is selected by default: "run the sheet" is the job. */
  useEffect(() => {
    if (!personas.data) return;
    setSelectedIds((current) => {
      const live = new Set(personas.data!.map((persona) => persona.caseId));
      const kept = current.filter((id) => live.has(id));
      return kept.length > 0 ? kept : personas.data!.map((persona) => persona.caseId);
    });
  }, [personas.data]);

  const estimate = trpc.campaign.estimate.useQuery(
    { ...params, target: 'in-process' as const, personaIds: selectedIds },
    { enabled: selectedIds.length > 0 && params.turnsMax >= params.turnsMin, retry: false },
  );

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const persona of personas.data ?? []) for (const tag of persona.tags) all.add(tag);
    return [...all].sort();
  }, [personas.data]);

  const visiblePersonas = useMemo(
    () => (personas.data ?? []).filter((persona) => (tagFilter ? persona.tags.includes(tagFilter) : true)),
    [personas.data, tagFilter],
  );

  const running = phase === 'running';
  const plan = estimate.data;
  const blockers = (plan?.blockers ?? []).filter((blocker) => blocker.severity === 'block');
  const warnings = (plan?.blockers ?? []).filter((blocker) => blocker.severity === 'warn');
  const ungraded = (personas.data ?? []).filter(
    (persona) => selectedIds.includes(persona.caseId) && !persona.hasRubric,
  ).length;

  const effectiveLabel =
    label.trim() ||
    `${selectedIds.length} persona${selectedIds.length === 1 ? '' : 's'} · ${params.sessions} session${
      params.sessions === 1 ? '' : 's'
    }`;

  const togglePersona = (caseId: string) => {
    setSelectedIds((current) =>
      current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId],
    );
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'okuvu-persona-sheet-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleRun = async () => {
    if (selectedIds.length === 0) return;
    stopRef.current = false;
    setMessage(null);
    setLive([]);
    setRemaining(null);
    setPhase('running');

    try {
      const started = await start.mutateAsync({
        ...params,
        target: 'in-process',
        label: effectiveLabel,
        personaIds: selectedIds,
      });
      setCampaignId(started.campaignId);
      void utils.campaign.list.invalidate();

      for (let tick = 0; tick < MAX_TICKS; tick++) {
        if (stopRef.current) break;
        // One step per call: the runner persists after each, so a dropped tab
        // costs at most the step in flight and "Run" resumes the same campaign.
        const step = await advance.mutateAsync({ campaignId: started.campaignId, steps: 1 });

        for (const outcome of step.outcomes) {
          setLive((previous) => {
            const next = [...previous];
            const index = next.findIndex((row) => row.groupId === outcome.groupId);
            const entry: LiveRow = {
              groupId: outcome.groupId,
              personaId: outcome.personaId,
              status: outcome.groupStatus,
              turnsCompleted: outcome.turnsCompleted,
              email: outcome.email
                ? { status: outcome.email.status, to: outcome.email.to, error: outcome.email.error }
                : index >= 0
                  ? next[index].email
                  : null,
            };
            if (index >= 0) next[index] = entry;
            else next.push(entry);
            return next;
          });
        }

        setRemaining(step.remaining);
        if (step.done) break;
        await new Promise((resolve) => setTimeout(resolve, TICK_DELAY_MS));
      }

      setPhase('done');
      void utils.campaign.get.invalidate({ campaignId: started.campaignId });
      void utils.campaign.list.invalidate();
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      {/* ── 1 · Upload ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[var(--text-title-lg)] font-semibold text-[var(--color-on-surface)]">
            1. Upload client personas
          </h2>
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-2 py-1 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
          >
            Download a blank sheet
          </button>
        </div>
        <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          A .csv or .xlsx, one row per client. <strong>name</strong>, <strong>age</strong> and a short{' '}
          <strong>situation</strong> are enough to start; add <strong>how they talk</strong>,{' '}
          <strong>goals</strong> and <strong>expectedBehavior</strong> — the last one is the rubric, and a
          client without it can run but never be graded.
        </p>
        <PersonaSheetUpload onImported={() => void utils.campaign.listPersonas.invalidate()} />
      </section>

      {/* ── 2 · Who runs ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[var(--text-title-lg)] font-semibold text-[var(--color-on-surface)]">
            2. Clients to run
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-[var(--text-label-sm)]">
            <span className="text-[var(--color-on-surface-variant)]">
              {selectedIds.length} of {personas.data?.length ?? 0} selected
            </span>
            {tags.length > 0 ? (
              <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className={SELECT_CLASS}>
                <option value="">all tags</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => setSelectedIds(visiblePersonas.map((persona) => persona.caseId))}
              className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-2 py-1"
            >
              Select all
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
        {personas.data && personas.data.length === 0 ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            The bank is empty. Upload a sheet above — it is added here the moment it is imported.
          </p>
        ) : null}

        {(personas.data?.length ?? 0) > 0 ? (
          <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]">
            <table className="w-full text-left text-[var(--text-label-sm)]">
              <thead className="sticky top-0 bg-[var(--color-surface-container-low)]">
                <tr>
                  <th className="px-2 py-1" />
                  <th className="px-2 py-1">client</th>
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

      {/* ── 3 · Run ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)]">
        <h2 className="text-[var(--text-title-lg)] font-semibold text-[var(--color-on-surface)]">3. Run</h2>

        <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          Each client holds {params.sessions} conversation{params.sessions === 1 ? '' : 's'} of{' '}
          {params.turnsMin}–{params.turnsMax} turns
          {params.gapPreset === 'day3-day7' ? ', set three and seven days apart' : ''}. When a client finishes,
          the full transcript is emailed to <strong>{config.data?.recipient ?? 'the clinical reviewer'}</strong>{' '}
          from {config.data?.fromEmail ?? 'admin@okuvu.in'}.
        </p>

        {config.data && !config.data.emailConfigured ? (
          <p className="rounded-[var(--radius-md)] border-l-4 border-amber-500 bg-amber-50 p-2 text-[var(--text-label-md)] text-amber-800">
            Email is not configured in this environment. Conversations still run and are stored here, but no
            transcript is mailed — use the export below to get the file instead.
          </p>
        ) : null}

        <details className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-3 py-2">
          <summary className="cursor-pointer text-[var(--text-label-md)] font-medium text-[var(--color-on-surface)]">
            Run settings — the defaults are the clinical run
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-[var(--spacing-md)] sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Environment" hint="staging = real models">
              <select
                value={params.environment}
                onChange={(event) => setParams({ ...params, environment: event.target.value as Environment })}
                className={SELECT_CLASS}
              >
                <option value="staging">staging (real models)</option>
                <option value="sandbox">sandbox (canned, free)</option>
              </select>
            </Field>

            <Field label="Sessions per client" hint="3 is what makes continuity checkable">
              <select
                value={params.sessions}
                onChange={(event) => setParams({ ...params, sessions: Number(event.target.value) })}
                className={SELECT_CLASS}
              >
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Gaps between sessions" hint="story time; costs seconds">
              <select
                value={params.gapPreset}
                onChange={(event) => setParams({ ...params, gapPreset: event.target.value as GapPreset })}
                className={SELECT_CLASS}
              >
                <option value="day3-day7">day 0 / 3 / 7</option>
                <option value="immediate">back to back</option>
                <option value="weekly">weekly</option>
              </select>
            </Field>

            <Field label="Turns — min">
              <select
                value={params.turnsMin}
                onChange={(event) => {
                  const turnsMin = Number(event.target.value);
                  setParams({ ...params, turnsMin, turnsMax: Math.max(turnsMin, params.turnsMax) });
                }}
                className={SELECT_CLASS}
              >
                {[2, 6, 10, 12, 15, 16, 20].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Turns — max">
              <select
                value={params.turnsMax}
                onChange={(event) => setParams({ ...params, turnsMax: Number(event.target.value) })}
                className={SELECT_CLASS}
              >
                {[4, 8, 12, 16, 20, 24].map((value) => (
                  <option key={value} value={value} disabled={value < params.turnsMin}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Seed" hint="same seed + same sheet = comparable runs">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={params.seed}
                  onChange={(event) => setParams({ ...params, seed: Number(event.target.value) })}
                  className={`${SELECT_CLASS} w-full`}
                />
                <button
                  type="button"
                  onClick={() => setParams({ ...params, seed: randomSeed() })}
                  className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-2 py-1 text-[var(--text-label-sm)]"
                >
                  new
                </button>
              </div>
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
          <p className="mt-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            The target is always the in-process pipeline (A1 → A9 → A8 → A2 → A9) in this harness, not the
            deployed api.okuvu.in WebSocket. Language mode is English only.
          </p>
        </details>

        {selectedIds.length === 0 ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Select at least one client above.
          </p>
        ) : null}

        {plan ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
            {plan.personas.length} client{plan.personas.length === 1 ? '' : 's'} × {params.sessions} session
            {params.sessions === 1 ? '' : 's'} × {params.turnsMin}–{params.turnsMax} turns ={' '}
            <strong>{plan.estimate.plannedTurns} turns</strong>. Estimate{' '}
            <strong>${plan.estimate.totalUsd.toFixed(2)}</strong> against a ${plan.estimate.costCeilingUsd.toFixed(2)}{' '}
            ceiling.
            {ungraded > 0 ? (
              <span className="text-amber-800">
                {' '}
                {ungraded} selected client{ungraded === 1 ? ' has' : 's have'} no rubric — they will run but stay
                UNGRADED.
              </span>
            ) : null}
          </p>
        ) : null}

        {blockers.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-2 text-[var(--text-label-sm)] text-red-700">
            {blockers.map((blocker) => (
              <li key={blocker.code}>✕ {blocker.message}</li>
            ))}
          </ul>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-2 text-[var(--text-label-sm)] text-amber-700">
            {warnings.map((blocker) => (
              <li key={blocker.code}>⚠ {blocker.message}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <Field label="Run label">
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
            onClick={() => void handleRun()}
            disabled={running || selectedIds.length === 0 || (plan ? !plan.canStart : false)}
            className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-5 py-2 text-[var(--text-label-md)] text-[var(--color-on-primary)] disabled:opacity-50"
          >
            {running
              ? 'Running… keep this tab open'
              : `Run ${selectedIds.length} client${selectedIds.length === 1 ? '' : 's'}`}
          </button>
          {running ? (
            <button
              type="button"
              onClick={() => {
                stopRef.current = true;
              }}
              className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-2 text-[var(--text-label-md)]"
            >
              Stop
            </button>
          ) : null}
          {campaignId ? (
            <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              run <code>{campaignId.slice(0, 8)}</code>
              {remaining !== null ? ` · ${remaining} step${remaining === 1 ? '' : 's'} left` : ''}
            </span>
          ) : null}
        </div>

        {message ? (
          <p className="whitespace-pre-wrap text-[var(--text-body-main)] text-[var(--color-error)]">{message}</p>
        ) : null}

        {live.length > 0 ? (
          <ul className="flex flex-col gap-1 text-[var(--text-label-md)] text-[var(--color-on-surface)]">
            {live.map((row) => (
              <li key={row.groupId} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.personaId}</span>
                <span className="text-[var(--color-on-surface-variant)]">
                  {row.status} · {row.turnsCompleted} turns
                </span>
                {row.email ? (
                  <span className={row.email.status === 'sent' ? 'text-emerald-700' : 'text-[var(--color-error)]'}>
                    {row.email.status === 'sent' ? `emailed to ${row.email.to}` : `email ${row.email.status}`}
                  </span>
                ) : null}
                {row.status === 'complete' && row.email?.status !== 'sent' ? (
                  <button
                    type="button"
                    onClick={() => resend.mutate({ groupId: row.groupId })}
                    disabled={resend.isPending}
                    className="rounded-[var(--radius-md)] border border-[var(--color-outline)] px-2 py-0.5 text-[var(--text-label-sm)]"
                  >
                    Send transcript
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── 4 · Results ──────────────────────────────────────────── */}
      <section className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[var(--text-title-lg)] font-semibold text-[var(--color-on-surface)]">4. Results</h2>
          {campaignHistory.data && campaignHistory.data.length > 0 ? (
            <select
              value={campaignId ?? ''}
              onChange={(event) => setCampaignId(event.target.value || null)}
              className={SELECT_CLASS}
            >
              <option value="">recent runs…</option>
              {campaignHistory.data.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.label} · {campaign.status} · {campaign.personaCount} client(s)
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {campaignId ? (
          <CampaignResults campaignId={campaignId} />
        ) : (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Nothing to show yet. Run a test above, or pick a recent run. Verdicts and the .xlsx export appear here
            when a conversation finishes.
          </p>
        )}
      </section>
    </div>
  );
}
