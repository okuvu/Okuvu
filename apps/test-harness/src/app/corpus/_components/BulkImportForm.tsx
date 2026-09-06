'use client';

import { useState, useTransition } from 'react';
import * as XLSX from 'xlsx';
import type { TestEnvironment } from '@evia/shared-types';
import type { bulkImportCasesAction } from '../actions';
import { parseRows, parseCsvText, type ParsedRow } from '@/lib/corpus-csv';

const CASE_TYPES = ['safety', 'fidelity', 'adversarial', 'persona'] as const;
const DATA_ORIGINS = ['synthetic', 'paraphrased', 'real'] as const;

interface PreviewRow extends ParsedRow {
  rowNumber: number;
  warning: string | null;
}

// Purely a client-side preview aid — the server (bulkImportCases) is the
// authoritative validator and re-checks every one of these independently.
function validateRow(row: ParsedRow, environment: TestEnvironment): string | null {
  if (row.input.trim().length === 0) return 'input is empty';
  if (!CASE_TYPES.includes(row.type as (typeof CASE_TYPES)[number])) {
    return `invalid type "${row.type}" (must be one of: ${CASE_TYPES.join(', ')})`;
  }
  const origin = row.data_origin || 'synthetic';
  if (!DATA_ORIGINS.includes(origin as (typeof DATA_ORIGINS)[number])) {
    return `invalid data_origin "${origin}" (must be one of: ${DATA_ORIGINS.join(', ')})`;
  }
  if (origin === 'real' && environment !== 'beta') {
    return 'data_origin "real" is only permitted in the beta environment — this will be rejected';
  }
  return null;
}

export default function BulkImportForm({
  environment,
  onImported,
  bulkImportCasesAction: bulkImportCases,
}: {
  environment: TestEnvironment;
  onImported: () => void;
  bulkImportCasesAction: typeof bulkImportCasesAction;
}) {
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [report, setReport] = useState<{ createdCount: number; rejected: { row: number; reason: string }[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFile = async (file: File) => {
    setParseError(null);
    setReport(null);
    setSubmitError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      let sheetRows: unknown[][];
      if (file.name.toLowerCase().endsWith('.csv')) {
        // CSV is plain text: decode it as UTF-8 and parse it directly.
        // Routing CSV through the `xlsx` tokenizer silently mangles files that
        // combine UTF-8 content with RFC-4180 quote escaping (columns come
        // back blank/garbled), so we use our own tokenizer for .csv.
        const text = new TextDecoder('utf-8').decode(buffer);
        sheetRows = parseCsvText(text);
      } else {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // header: 1 returns each row as a positional value array (rather than
        // keyed by the first row) so parseRows can locate the header row itself
        // and tolerate leading blank rows. See parseRows for details.
        sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      }
      const rows = parseRows(sheetRows);
      setPreview(
        rows.map((row, i) => ({ ...row, rowNumber: i, warning: validateRow(row, environment) })),
      );
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read that file — expected a .csv or .xlsx spreadsheet.');
      setPreview([]);
    }
  };

  const handleSubmit = () => {
    if (preview.length === 0) return;
    startTransition(async () => {
      const result = await bulkImportCases({
        environment,
        rows: preview.map(({ type, input, expected_output, tags, data_origin }) => ({
          type,
          input,
          expected_output,
          tags,
          data_origin,
        })),
      });
      if (result.success) {
        setReport({ createdCount: result.data.created.length, rejected: result.data.rejected });
        setPreview([]);
        setFileName(null);
        onImported();
      } else {
        setSubmitError(result.error);
      }
    });
  };

  const warningCount = preview.filter((r) => r.warning).length;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
      <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        Upload a .csv or .xlsx file with columns: <strong>type</strong>, <strong>input</strong>,
        expected_output (optional), tags (optional, semicolon-separated), data_origin (optional,
        defaults to synthetic).
      </p>

      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="text-[var(--text-body-main)] text-[var(--color-on-surface)]"
      />

      {parseError && <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{parseError}</p>}

      {preview.length > 0 && (
        <>
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            {fileName}: {preview.length} row{preview.length === 1 ? '' : 's'} parsed
            {warningCount > 0 ? `, ${warningCount} with warnings (still submitted — the server makes the final call)` : ''}.
          </p>
          <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]">
            <table className="w-full text-left text-[var(--text-label-sm)]">
              <thead className="sticky top-0 bg-[var(--color-surface-container-low)]">
                <tr>
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">Input</th>
                  <th className="px-2 py-1">Origin</th>
                  <th className="px-2 py-1">Warning</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.rowNumber} className={row.warning ? 'bg-[var(--color-warning-container)]' : ''}>
                    <td className="px-2 py-1">{row.rowNumber + 1}</td>
                    <td className="px-2 py-1">{row.type || '—'}</td>
                    <td className="px-2 py-1 max-w-xs truncate">{row.input || '—'}</td>
                    <td className="px-2 py-1">{row.data_origin || 'synthetic'}</td>
                    <td className="px-2 py-1 text-[var(--color-on-warning-container)]">{row.warning ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-3 py-1.5 text-[var(--text-label-sm)] font-medium text-[var(--color-on-primary)] disabled:opacity-50"
          >
            {isPending ? 'Importing…' : `Import ${preview.length} row${preview.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}

      {submitError && <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{submitError}</p>}

      {report && (
        <div className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
          <p>Created {report.createdCount} case{report.createdCount === 1 ? '' : 's'}.</p>
          {report.rejected.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[var(--text-label-sm)] text-[var(--color-error)]">
              {report.rejected.map((r) => (
                <li key={r.row}>Row {r.row + 1}: {r.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
