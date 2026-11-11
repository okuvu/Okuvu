'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  CAMPAIGN_COLUMNS,
  isImportable,
  parsePersonaCsv,
  parsePersonaSheet,
  type PersonaSheetParseResult,
} from '@/lib/persona-sheet';
import { trpc } from '@/trpc/client';

/**
 * Step 1 of /campaign: upload a persona sheet, preview it row by row, import
 * the good rows into the persona bank.
 *
 * Parsing is the shared pure parser (`lib/persona-sheet.ts`), so what the
 * preview shows is what the server receives. The server re-validates anyway —
 * this table is an aid, not a gate.
 */
export default function PersonaSheetUpload({ onImported }: { onImported: () => void }) {
  const [parse, setParse] = useState<PersonaSheetParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    created: number;
    rejected: { row: number; personaId: string; reason: string }[];
  } | null>(null);

  const importPersonas = trpc.campaign.importPersonas.useMutation({
    onSuccess: (data) => {
      setReport({ created: data.created.length, rejected: data.rejected });
      setParse(null);
      setFileName(null);
      onImported();
    },
  });

  const handleFile = async (file: File) => {
    setParseError(null);
    setReport(null);
    setFileName(file.name);
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
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read that file — expected a .csv or .xlsx sheet.');
      setParse(null);
    }
  };

  const rows = parse?.rows ?? [];
  const importable = rows.filter(isImportable);

  const handleImport = () => {
    if (importable.length === 0) return;
    importPersonas.mutate({
      rows: importable.map((row) => ({
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
    });
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-sm)]">
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Upload a .csv or .xlsx sheet, one row per client. Semicolons separate list values inside a cell.
        Required: <strong>personaId</strong>, <strong>personaVersion</strong>, <strong>expectedBehavior</strong>.
        A persona without a rubric can be run but never graded.
      </p>

      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      />

      <details className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        <summary className="cursor-pointer">Column contract</summary>
        <ul className="mt-1 flex flex-col gap-0.5 pl-4">
          {CAMPAIGN_COLUMNS.map((column) => (
            <li key={column.column}>
              <code>{column.column}</code>
              {column.required ? ' ★' : ''} — {column.note}
            </li>
          ))}
        </ul>
      </details>

      {parseError ? <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{parseError}</p> : null}
      {importPersonas.error ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{importPersonas.error.message}</p>
      ) : null}

      {parse && parse.headerWarnings.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          {parse.headerWarnings.map((warning) => (
            <li key={warning}>· {warning}</li>
          ))}
        </ul>
      ) : null}

      {rows.length > 0 ? (
        <>
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            {fileName}: {rows.length} row{rows.length === 1 ? '' : 's'} parsed, {importable.length} importable
            {rows.length - importable.length > 0 ? `, ${rows.length - importable.length} rejected` : ''}.
          </p>
          <div className="max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]">
            <table className="w-full text-left text-[var(--text-label-sm)]">
              <thead className="sticky top-0 bg-[var(--color-surface-container-low)]">
                <tr>
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">personaId</th>
                  <th className="px-2 py-1">ver</th>
                  <th className="px-2 py-1">trajectory</th>
                  <th className="px-2 py-1">rubric</th>
                  <th className="px-2 py-1">notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ok = isImportable(row);
                  return (
                    <tr
                      key={`${row.personaId}-${row.rowNumber}`}
                      className={ok ? '' : 'bg-[var(--color-surface-container-high)]'}
                    >
                      <td className="px-2 py-1">{row.rowNumber}</td>
                      <td className="max-w-[14rem] truncate px-2 py-1">{row.personaId || '—'}</td>
                      <td className="px-2 py-1">{row.personaVersion}</td>
                      <td className="px-2 py-1">{row.trajectory ?? '—'}</td>
                      <td className="px-2 py-1">{row.expectedBehavior ? '✓' : '✗ ungraded'}</td>
                      <td className="px-2 py-1">
                        {[...row.errors, ...row.warnings].length === 0 ? (
                          <span className="text-emerald-700">ready</span>
                        ) : (
                          <span className={ok ? 'text-amber-700' : 'text-[var(--color-error)]'}>
                            {[...row.errors, ...row.warnings].join(' · ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={importPersonas.isPending || importable.length === 0}
            className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] text-[var(--color-on-primary)] disabled:opacity-50"
          >
            {importPersonas.isPending ? 'Importing…' : `Import ${importable.length} persona${importable.length === 1 ? '' : 's'}`}
          </button>
        </>
      ) : null}

      {report ? (
        <div className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
          <p>
            Added {report.created} persona{report.created === 1 ? '' : 's'} to the bank.
            {report.rejected.length > 0 ? ` ${report.rejected.length} row(s) rejected:` : ''}
          </p>
          {report.rejected.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-[var(--text-label-sm)] text-[var(--color-error)]">
              {report.rejected.map((rejection) => (
                <li key={`${rejection.row}-${rejection.personaId}`}>
                  Row {rejection.row} ({rejection.personaId}): {rejection.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
