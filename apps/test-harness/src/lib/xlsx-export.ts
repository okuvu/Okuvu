/**
 * One place that turns test results into a downloadable `.xlsx`.
 *
 * Every test screen in this harness produced its own ad-hoc export or none at
 * all: `/simulator` hand-rolled a JSON blob, `/results` had a server-side
 * workbook builder with no button anywhere, and the persona, fault, pipeline
 * and single-agent screens had no download at all. This module is the shared
 * shape so all six produce the same kind of file.
 *
 * Sheets are declared as `{ name, rows }` where each row is a flat record;
 * `xlsx` derives the header row from the union of keys, so a caller never
 * hand-writes headers. Column *order* follows the order keys are inserted into
 * the first row, so build rows in the order a reader should meet them.
 *
 * Browser-only functions (`downloadSheets`, `downloadBase64`) touch `document`
 * and must only be called from a click handler. `buildXlsxBuffer` is pure and
 * runs in tests.
 */

import * as XLSX from 'xlsx';

export interface SheetSpec {
  /** Excel sheet name — max 31 chars, no : \ / ? * [ ] */
  name: string;
  rows: Record<string, unknown>[];
}

/** Excel refuses to open a workbook that has zero sheets; a run with no rows still gets a header. */
const EMPTY_ROW: Record<string, unknown> = { note: 'no rows' };

export function buildXlsxBuffer(sheets: SheetSpec[]): Uint8Array {
  if (sheets.length === 0) {
    throw new Error('A workbook needs at least one sheet.');
  }

  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const rows = sheet.rows.length > 0 ? sheet.rows : [EMPTY_ROW];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Build and save a workbook from in-page state. */
export function downloadSheets(fileName: string, sheets: SheetSpec[]): void {
  const buffer = buildXlsxBuffer(sheets);
  triggerDownload(
    new Blob([buffer as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName,
  );
}

/** Save a workbook the server already built (server actions / tRPC hand back base64). */
export function downloadBase64(fileName: string, base64: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  triggerDownload(
    new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName,
  );
}

/** `2026-11-16` — the date stamp every export file name ends with. */
export function todayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Flatten any JSON value into a spreadsheet-safe cell (objects become JSON text). */
export function cell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
