'use client';

import Link from 'next/link';
import { trpc } from '@/trpc/client';

/**
 * The worksheet catalogue, as the therapist sees it.
 *
 * Deliberately not the client's Library: this list shows the internal columns
 * the approved document marks therapist-only (which therapy it comes from,
 * approval state, whether an invalid body would be refused) and it links to a
 * full preview of the client view. The client's own Library is a different
 * screen in the app.
 */

const SECTION_LABELS: Record<string, string> = {
  notice_and_name: 'Notice & name',
  calm_my_body: 'Calm my body',
  untangle_thoughts: 'Untangle my thoughts',
  do_what_matters: 'Do what matters',
  people_boundaries: 'People & boundaries',
  be_kinder: 'Be kinder to me',
  energy_life: 'Energy & life',
  before_after: 'Before & after session',
  safety: 'Safety',
};

const ACCESS_LABELS: Record<string, string> = {
  open: 'Anyone can open',
  assigned: 'After assignment',
  in_session: 'In session',
};

export default function WorksheetsPage() {
  const { data, isLoading, error } = trpc.worksheets.list.useQuery();

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Worksheets</span>
          </div>

          <div>
            <h1 className="text-xl font-semibold text-gray-900">Worksheets</h1>
            <p className="mt-1 text-sm text-gray-500">
              The same worksheet your client opens. Preview shows the client&rsquo;s view, piece by
              piece, with the approved wording.
            </p>
          </div>

          {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error.message}
            </p>
          )}

          {data && data.length === 0 && (
            <p className="rounded-xl border border-hairline bg-oat-elevated p-4 text-sm text-gray-600">
              No worksheets have been added to the catalogue yet.
            </p>
          )}

          {data && data.length > 0 && (
            <div className="space-y-6">
              {Object.entries(SECTION_LABELS).map(([key, label]) => {
                const rows = data.filter((row) => row.section === key);
                if (rows.length === 0) return null;
                return (
                  <section key={key} className="space-y-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</h2>
                    {rows.map((row) => (
                      <Link
                        key={row.toolId}
                        href={`/worksheets/${row.toolId}`}
                        className="block rounded-xl border border-hairline bg-oat-elevated p-4 hover:shadow-md transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{row.label}</p>
                            {row.summary && <p className="mt-0.5 text-xs text-gray-600">{row.summary}</p>}
                            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                              {row.modality && <span>{row.modality}</span>}
                              <span>{ACCESS_LABELS[row.accessMode] ?? row.accessMode}</span>
                              {row.loadLevel && <span>{row.loadLevel}</span>}
                              {row.estMinutes != null && <span>{row.estMinutes} min</span>}
                              {row.hasHinglish && <span>Hinglish</span>}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                row.status === 'approved'
                                  ? 'bg-sage-tint text-sage-deep'
                                  : row.status === 'retired'
                                    ? 'bg-gray-100 text-gray-500'
                                    : 'bg-honey-tint text-honey-deep'
                              }`}
                            >
                              {row.status}
                            </span>
                            {row.problemCount > 0 && (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                {row.problemCount} problem{row.problemCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
