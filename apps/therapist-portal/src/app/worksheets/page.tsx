'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { trpc } from '@/trpc/client';

/**
 * The Library, as the therapist sees it.
 *
 * Deliberately not the client's Library: this list shows the internal columns
 * the approved document marks therapist-only (which therapy it comes from, the
 * "For therapists" note, approval state, whether an invalid body would be
 * refused) and it links to a full preview of the client view.
 *
 * Filters are the five the owner named in Step 8 — therapy type, Library
 * section, who can open it, how demanding it is, how long it takes. They are
 * client-side over the catalogue query: the catalogue is a few dozen rows, and a
 * filter that round-trips to the server would make typing in the search box feel
 * broken.
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

const MINUTE_BUCKETS = [
  { key: 'any', label: 'Any length' },
  { key: 'short', label: 'Under 5 min' },
  { key: 'medium', label: '5–10 min' },
  { key: 'long', label: 'Over 10 min' },
] as const;

export default function WorksheetsPage() {
  const { data, isLoading, error } = trpc.worksheets.list.useQuery();

  const [section, setSection] = useState('');
  const [modality, setModality] = useState('');
  const [access, setAccess] = useState('');
  const [load, setLoad] = useState('');
  const [length, setLength] = useState('any');
  const [search, setSearch] = useState('');

  const rows = data ?? [];

  const sections = useMemo(
    () => [...new Set(rows.map((row) => row.section).filter(Boolean))] as string[],
    [rows],
  );
  const modalities = useMemo(
    () => [...new Set(rows.map((row) => row.modality).filter(Boolean))] as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (section && row.section !== section) return false;
      if (modality && row.modality !== modality) return false;
      if (access && row.accessMode !== access) return false;
      if (load && row.loadLevel !== load) return false;

      if (length !== 'any') {
        const minutes = row.estMinutes ?? 0;
        if (length === 'short' && minutes >= 5) return false;
        if (length === 'medium' && (minutes < 5 || minutes > 10)) return false;
        if (length === 'long' && minutes <= 10) return false;
      }

      if (term && !row.label.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, section, modality, access, load, length, search]);

  const anyFilter =
    section !== '' || modality !== '' || access !== '' || load !== '' || length !== 'any' || search !== '';

  function clearFilters() {
    setSection('');
    setModality('');
    setAccess('');
    setLoad('');
    setLength('any');
    setSearch('');
  }

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Library</span>
          </div>

          <div>
            <h1 className="text-xl font-semibold text-gray-900">Library</h1>
            <p className="mt-1 text-sm text-gray-500">
              Every approved exercise, and the same wording your client reads. Preview opens the
              client&rsquo;s view, piece by piece. Assign an exercise from a client&rsquo;s Homework
              page.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-hairline bg-oat-elevated p-3 md:grid-cols-3">
            <label className="text-[11px] font-medium text-gray-500">
              Library section
              <select
                aria-label="Filter by Library section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
              >
                <option value="">All sections</option>
                {sections.map((key) => (
                  <option key={key} value={key}>
                    {SECTION_LABELS[key] ?? key}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[11px] font-medium text-gray-500">
              Therapy type
              <select
                aria-label="Filter by therapy type"
                value={modality}
                onChange={(e) => setModality(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
              >
                <option value="">All types</option>
                {modalities.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[11px] font-medium text-gray-500">
              Who can open it
              <select
                aria-label="Filter by who can open it"
                value={access}
                onChange={(e) => setAccess(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
              >
                <option value="">Anyone</option>
                {Object.entries(ACCESS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[11px] font-medium text-gray-500">
              How demanding
              <select
                aria-label="Filter by how demanding it is"
                value={load}
                onChange={(e) => setLoad(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
              >
                <option value="">Any</option>
                <option value="light">Light</option>
                <option value="demanding">Demanding</option>
              </select>
            </label>

            <label className="text-[11px] font-medium text-gray-500">
              How long
              <select
                aria-label="Filter by how long it takes"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
              >
                {MINUTE_BUCKETS.map((bucket) => (
                  <option key={bucket.key} value={bucket.key}>
                    {bucket.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[11px] font-medium text-gray-500">
              Search
              <input
                aria-label="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              {filtered.length} of {rows.length}
              {anyFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-2 text-royal-purple hover:underline"
                >
                  Clear filters
                </button>
              )}
            </span>
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

          {data && data.length > 0 && filtered.length === 0 && (
            <p className="rounded-xl border border-hairline bg-oat-elevated p-4 text-sm text-gray-600">
              Nothing matches those filters.
            </p>
          )}

          {filtered.length > 0 && (
            <div className="space-y-6">
              {Object.entries(SECTION_LABELS).map(([key, label]) => {
                const sectionRows = filtered.filter((row) => row.section === key);
                if (sectionRows.length === 0) return null;
                return (
                  <section key={key} className="space-y-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {label}
                    </h2>
                    {sectionRows.map((row) => (
                      <Link
                        key={row.toolId}
                        href={`/worksheets/${row.toolId}`}
                        className="block rounded-xl border border-hairline bg-oat-elevated p-4 hover:shadow-md transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{row.label}</p>
                            {row.summary && (
                              <p className="mt-0.5 text-xs text-gray-600">{row.summary}</p>
                            )}
                            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                              {row.modality && <span>{row.modality}</span>}
                              <span>{ACCESS_LABELS[row.accessMode] ?? row.accessMode}</span>
                              {row.loadLevel && <span>{row.loadLevel}</span>}
                              {row.estMinutes != null && <span>{row.estMinutes} min</span>}
                              {row.hasHinglish && <span>Hinglish</span>}
                            </p>
                            {row.therapistNote && (
                              <p className="mt-2 rounded-lg bg-oat px-3 py-2 text-[11px] text-gray-600">
                                <span className="font-semibold uppercase tracking-wide text-[10px] text-gray-500">
                                  For therapists
                                </span>
                                <br />
                                {row.therapistNote}
                              </p>
                            )}
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
