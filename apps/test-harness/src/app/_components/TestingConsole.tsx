'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { trpc } from '@/trpc/client';
import {
  isImportable,
  parsePersonaCsv,
  parsePersonaSheet,
  type ParsedPersonaRow,
  type PersonaSheetParseResult,
} from '@/lib/persona-sheet';

/**
 * TH-S39 — the testing.okuvu.in landing screen.
 *
 * One job: take a sheet of client personas, hold one 15–20 turn conversation
 * per persona against the real pipeline, and mail each transcript to the
 * clinical reviewer. So the page has three states and no settings: choose a
 * file, press Run, read what was sent.
 *
 * The turn range is fixed here rather than exposed as a control because the
 * requirement is "a 15–20 turn conversation", and a per-persona count drawn
 * from the seed keeps runs from being identically shaped.
 *
 * The run loop advances one step per call (the runner's resumable design), so
 * progress is visible and a dropped connection resumes instead of restarting.
 * That also means the tab must stay open for the duration — stated on screen.
 */

const TURNS_MIN = 15;
const TURNS_MAX = 20;
const TICK_DELAY_MS = 150;
const MAX_TICKS = 800;

type Phase = 'idle' | 'importing' | 'starting' | 'running' | 'done' | 'error';

interface LiveRow {
  groupId: string;
  personaId: string;
  status: string;
  turnsCompleted: number;
  email: { status: string; to: string; error?: string } | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

export default function TestingConsole() {
  const utils = trpc.useUtils();
  const config = trpc.testing.config.useQuery();

  const [parse, setParse] = useState<PersonaSheetParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveRow[]>([]);

  const importPersonas = trpc.campaign.importPersonas.useMutation();
  const startCampaign = trpc.campaign.start.useMutation();
  const advance = trpc.testing.advance.useMutation();
  const resend = trpc.testing.resend.useMutation({
    onSuccess: () => {
      if (campaignId) void utils.testing.results.invalidate({ campaignId });
    },
  });

  const results = trpc.testing.results.useQuery(
    { campaignId: campaignId ?? '' },
    { enabled: Boolean(campaignId) && phase === 'done' },
  );

  const rows = parse?.rows ?? [];
  const importable = rows.filter(isImportable);
  const running = phase === 'importing' || phase === 'starting' || phase === 'running';

  const handleFile = async (file: File) => {
    setFileError(null);
    setMessage(null);
    setFileName(file.name);
    setParse(null);
    setCampaignId(null);
    setLive([]);
    setPhase('idle');
    try {
      const buffer = await file.arrayBuffer();
      let parsed: PersonaSheetParseResult;
      if (file.name.toLowerCase().endsWith('.csv')) {
        parsed = parsePersonaCsv(new TextDecoder('utf-8').decode(buffer));
      } else {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        parsed = parsePersonaSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }));
      }
      setParse(parsed);
    } catch (error) {
      setFileError(
        error instanceof Error
          ? `Could not read that file: ${error.message}`
          : 'Could not read that file — expected a .csv or .xlsx sheet.',
      );
    }
  };

  const handleRun = async () => {
    if (importable.length === 0) return;
    setMessage(null);
    setLive([]);
    setCampaignId(null);

    try {
      setPhase('importing');
      const imported = await importPersonas.mutateAsync({
        rows: importable.map((row: ParsedPersonaRow) => ({
          personaId: row.personaId,
          personaVersion: row.personaVersion,
          expectedBehavior: row.expectedBehavior,
          demographics: row.demographics,
          profile: row.profile,
          trajectory: row.trajectory,
          goals: row.goals,
          secrets: row.secrets,
          openerStyle: row.openerStyle,
          sampleStarters: row.sampleStarters,
          continuityCues: row.continuityCues,
          determinismRules: row.determinismRules,
          tags: row.tags,
        })),
        replaceExisting: true,
      });

      if (imported.created.length === 0) {
        setPhase('error');
        setMessage(
          imported.rejected.length > 0
            ? `Nothing imported: ${imported.rejected[0].reason}`
            : 'Nothing imported — the sheet had no runnable rows.',
        );
        return;
      }

      setPhase('starting');
      const started = await startCampaign.mutateAsync({
        label: `testing.okuvu.in — ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
        environment: 'staging',
        target: 'in-process',
        sessions: 1,
        turnsMin: TURNS_MIN,
        turnsMax: TURNS_MAX,
        gapPreset: 'immediate',
        seed: randomSeed(),
        judgeEnabled: true,
        costCeilingUsd: 25,
        personaIds: imported.created.map((row) => row.caseId),
      });

      setCampaignId(started.campaignId);
      setPhase('running');

      for (let tick = 0; tick < MAX_TICKS; tick++) {
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

        if (step.done) break;
        await sleep(TICK_DELAY_MS);
      }

      setPhase('done');
      void utils.testing.results.invalidate({ campaignId: started.campaignId });
      void utils.campaign.list.invalidate();
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const phaseLabel: Record<Phase, string> = {
    idle: '',
    importing: 'Adding the personas…',
    starting: 'Starting the run…',
    running: 'Conversations running — keep this tab open…',
    done: 'Finished.',
    error: 'Stopped.',
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)]">
        <h2 className="text-[var(--text-title-lg)] font-semibold text-[var(--color-on-surface)]">
          1. Upload client personas
        </h2>
        <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          One row per client. A <strong>name</strong>, <strong>age</strong> and a short{' '}
          <strong>situation</strong> are enough — those columns are read as the persona. Familiar
          column names also work: <code>personaId</code>, <code>profile</code>, <code>demographics</code>,{' '}
          <code>goals</code>, and a plain <code>how they talk</code> column for the opening style.
        </p>

        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={running}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="mt-3 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
        />

        {fileError ? (
          <p className="mt-2 text-[var(--text-body-main)] text-[var(--color-error)]">{fileError}</p>
        ) : null}

        {rows.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              {fileName}: {rows.length} row{rows.length === 1 ? '' : 's'} read, {importable.length} ready to run
              {rows.length - importable.length > 0 ? `, ${rows.length - importable.length} skipped` : ''}.
            </p>
            <div className="max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]">
              <table className="w-full text-left text-[var(--text-label-sm)]">
                <thead className="sticky top-0 bg-[var(--color-surface-container-low)]">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">persona</th>
                    <th className="px-2 py-1">character</th>
                    <th className="px-2 py-1">notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.personaId}-${row.rowNumber}`} className={isImportable(row) ? '' : 'opacity-60'}>
                      <td className="px-2 py-1">{row.rowNumber}</td>
                      <td className="max-w-[12rem] truncate px-2 py-1">{row.personaId || '—'}</td>
                      <td className="max-w-[16rem] truncate px-2 py-1">{row.demographics ?? '—'}</td>
                      <td className="px-2 py-1">
                        {[...row.errors, ...row.warnings].length === 0 ? (
                          <span className="text-emerald-700">ready</span>
                        ) : (
                          <span className={row.errors.length > 0 ? 'text-[var(--color-error)]' : 'text-amber-700'}>
                            {[...row.errors, ...row.warnings].join(' · ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)]">
        <h2 className="text-[var(--text-title-lg)] font-semibold text-[var(--color-on-surface)]">2. Run the test</h2>
        <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          Each persona holds one conversation of {TURNS_MIN}–{TURNS_MAX} turns with Okuvu. When a conversation
          finishes, its full transcript is emailed to{' '}
          <strong>{config.data?.recipient ?? 'the clinical reviewer'}</strong> from{' '}
          {config.data?.fromEmail ?? 'admin@okuvu.in'} — one email per persona.
        </p>

        {config.data && !config.data.emailConfigured ? (
          <p className="mt-2 rounded-[var(--radius-md)] border-l-4 border-amber-500 bg-amber-50 p-2 text-[var(--text-label-md)] text-amber-800">
            Email is not configured in this environment (COMPOSIO_CLIENT_ID / COMPOSIO_REFRESH_TOKEN). The
            conversations will still run and be stored, but nothing will be mailed.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={running || importable.length === 0}
          className="mt-4 rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-5 py-2 text-[var(--text-label-md)] text-[var(--color-on-primary)] disabled:opacity-50"
        >
          {running
            ? 'Running…'
            : `Run ${importable.length} conversation${importable.length === 1 ? '' : 's'}`}
        </button>

        {phase !== 'idle' ? (
          <p className="mt-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">{phaseLabel[phase]}</p>
        ) : null}
        {message ? (
          <p className="mt-2 whitespace-pre-wrap text-[var(--text-body-main)] text-[var(--color-error)]">{message}</p>
        ) : null}

        {live.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-1 text-[var(--text-label-md)] text-[var(--color-on-surface)]">
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
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {phase === 'done' && results.data ? (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)]">
          <h2 className="text-[var(--text-title-lg)] font-semibold text-[var(--color-on-surface)]">
            3. What was sent
          </h2>
          <table className="mt-2 w-full text-left text-[var(--text-label-sm)]">
            <thead className="bg-[var(--color-surface-container-low)]">
              <tr>
                <th className="px-2 py-1">persona</th>
                <th className="px-2 py-1">turns</th>
                <th className="px-2 py-1">conversation</th>
                <th className="px-2 py-1">transcript email</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {results.data.rows.map((row) => (
                <tr key={row.groupId} className="border-t border-[var(--color-outline-variant)]">
                  <td className="px-2 py-1">{row.personaId}</td>
                  <td className="px-2 py-1">{row.turnsCompleted}</td>
                  <td className="px-2 py-1">{row.status}</td>
                  <td className="px-2 py-1">
                    {row.email?.status === 'sent' ? (
                      <span className="text-emerald-700">sent to {row.email.to}</span>
                    ) : row.email ? (
                      <span className="text-[var(--color-error)]">
                        {row.email.status}
                        {row.email.error ? ` — ${row.email.error}` : ''}
                      </span>
                    ) : (
                      <span className="text-[var(--color-on-surface-variant)]">not sent</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => resend.mutate({ groupId: row.groupId })}
                      disabled={resend.isPending}
                      className="rounded-[var(--radius-md)] border border-[var(--color-outline)] px-2 py-0.5 text-[var(--text-label-sm)]"
                    >
                      {row.email?.status === 'sent' ? 'Send again' : 'Send'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
