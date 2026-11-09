'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { useClientHeader } from '../_components/useClientHeader';
import { TabStrip } from '../_components/TabStrip';

type HomeworkStatus = 'active' | 'completed' | 'archived';

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

type Frequency = 'once' | 'once_daily' | 'twice_daily' | 'thrice_daily' | 'as_needed';

const FREQUENCY_LABELS: Record<Frequency, string> = {
  once: 'Once',
  once_daily: 'Every day',
  twice_daily: 'Twice a day',
  thrice_daily: 'Three times a day',
  as_needed: 'When needed',
};

const MINUTE_BUCKETS = [
  { key: 'any', label: 'Any length' },
  { key: 'short', label: 'Under 5 min' },
  { key: 'medium', label: '5–10 min' },
  { key: 'long', label: 'Over 10 min' },
] as const;

function formatHomeworkDate(iso: string | Date): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: HomeworkStatus }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-sage-tint text-sage-deep">
        Completed
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-honey-tint text-honey-deep">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-gray-100 text-gray-500">
      Archived
    </span>
  );
}

/** `2026-11-12` from a date input → the instant that day starts, for storage. */
function dateInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export default function ClientHomeworkPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const DRAFT_KEY = `homework-draft-${clientId}`;

  const [description, setDescription] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(DRAFT_KEY) || '';
    }
    return '';
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Step 8 — the two ways to assign. "written" is the form that existed before
  // and keeps working exactly as it did; "library" is an approved exercise with
  // the details an exercise assignment carries.
  const [mode, setMode] = useState<'written' | 'library'>('library');

  // Written mode keeps the old optional exercise link.
  const [toolId, setToolId] = useState('');

  // Library mode.
  const [selectedToolId, setSelectedToolId] = useState('');
  const [personalNote, setPersonalNote] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [goalId, setGoalId] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [dueDate, setDueDate] = useState('');

  // Filters (owner's Step 8 list: therapy type, section, who can open, how
  // demanding, how long).
  const [section, setSection] = useState('');
  const [modality, setModality] = useState('');
  const [access, setAccess] = useState('');
  const [load, setLoad] = useState('');
  const [length, setLength] = useState('any');
  const [search, setSearch] = useState('');

  // Set building.
  const [setName, setSetName] = useState('');
  const [setPicks, setSetPicks] = useState<string[]>([]);
  const [newSetFrequency, setNewSetFrequency] = useState<Frequency>('once');
  const [newSetDueDate, setNewSetDueDate] = useState('');

  const homeworkQuery = trpc.homework.listHomework.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const toolsQuery = trpc.reminders.listTools.useQuery();

  // Only approved rows can be assigned, so the picker only offers approved
  // ones — the server refuses anything else, and the list should not offer what
  // the server would refuse.
  const libraryQuery = trpc.worksheets.list.useQuery();
  const approved = useMemo(
    () => (libraryQuery.data ?? []).filter((row) => row.status === 'approved'),
    [libraryQuery.data],
  );

  const goalsQuery = trpc.goals.list.useQuery({ clientId }, { enabled: Boolean(clientId) });
  const setsQuery = trpc.exerciseSets.list.useQuery();

  const sections = useMemo(
    () => [...new Set(approved.map((row) => row.section).filter(Boolean))] as string[],
    [approved],
  );
  const modalities = useMemo(
    () => [...new Set(approved.map((row) => row.modality).filter(Boolean))] as string[],
    [approved],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return approved.filter((row) => {
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
  }, [approved, section, modality, access, load, length, search]);

  function resetMessages() {
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationError(null);
  }

  const assignHomework = trpc.homework.assign.useMutation({
    onSuccess: async () => {
      resetMessages();
      setSuccessMessage('Homework assigned.');
      setDescription('');
      setToolId('');
      setSelectedToolId('');
      setPersonalNote('');
      setPrivateNote('');
      setGoalId('');
      sessionStorage.removeItem(DRAFT_KEY);
      await homeworkQuery.refetch();
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not assign homework.');
      setSuccessMessage(null);
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const createSet = trpc.exerciseSets.create.useMutation({
    onSuccess: async (set) => {
      setSetName('');
      setSetPicks([]);
      await setsQuery.refetch();
      setSuccessMessage(`Saved the set "${set.name}".`);
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not save the set.');
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const removeSet = trpc.exerciseSets.remove.useMutation({
    onSuccess: async () => {
      await setsQuery.refetch();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not delete the set.');
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const assignSet = trpc.homework.assignSet.useMutation({
    onSuccess: async (result) => {
      await homeworkQuery.refetch();
      setSuccessMessage(
        `Assigned ${result.homeworkIds.length} exercise${result.homeworkIds.length === 1 ? '' : 's'} from "${result.setName}".`,
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not assign the set.');
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const markCompleted = trpc.homework.markCompleted.useMutation({
    onSuccess: async () => {
      await homeworkQuery.refetch();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Could not mark homework completed.');
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  function handleWrittenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setValidationError('Homework description cannot be empty.');
      return;
    }
    if (!clientId) return;
    resetMessages();
    assignHomework.mutate({
      clientUserId: clientId,
      description: description.trim(),
      toolId: toolId || undefined,
    });
  }

  function handleLibrarySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedToolId) {
      setValidationError('Pick an exercise first.');
      return;
    }
    if (!clientId) return;
    resetMessages();
    assignHomework.mutate({
      clientUserId: clientId,
      toolId: selectedToolId,
      personalNote: personalNote.trim() || undefined,
      privateNote: privateNote.trim() || undefined,
      goalId: goalId || undefined,
      frequency,
      dueAt: dateInputToIso(dueDate),
    });
  }

  function handleCreateSet(e: React.FormEvent) {
    e.preventDefault();
    if (!setName.trim()) {
      setValidationError('Give the set a name.');
      return;
    }
    if (setPicks.length === 0) {
      setValidationError('Tick at least one exercise for the set.');
      return;
    }
    resetMessages();
    createSet.mutate({ name: setName.trim(), toolIds: setPicks });
  }

  function toggleSetPick(id: string) {
    setSetPicks((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  const { label: clientLabel } = useClientHeader(clientId);

  const selectedRow = approved.find((row) => row.toolId === selectedToolId) ?? null;

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-royal-purple transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Homework</span>
          </div>

          <TabStrip clientId={clientId} active="tools" />

          {/* Info notice */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline border-l-4 border-l-violet">
            <h1 className="text-lg font-semibold text-gray-900">Homework</h1>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              Homework you assign here appears in the client&rsquo;s chat context, so OKUVU can
              coach and check in on it. Mark an item completed once the client has reported back.
            </p>
          </div>

          {/* Homework list */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              HOMEWORK HISTORY
            </h2>

            {homeworkQuery.isLoading ? (
              <div className="space-y-3 animate-pulse" role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">Loading homework history…</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : homeworkQuery.isError ? (
              <p className="text-sm text-danger">
                Could not load homework. Please refresh and try again.
              </p>
            ) : homeworkQuery.data && homeworkQuery.data.length > 0 ? (
              <div className="space-y-3">
                {homeworkQuery.data.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-gray-50 p-4 border border-gray-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {item.description}
                      </p>
                      <StatusBadge status={item.status as HomeworkStatus} />
                    </div>
                    {item.tool && (
                      <span className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-lavender-wash text-royal-purple">
                        {item.tool.label}
                      </span>
                    )}
                    {item.personal_note && (
                      <p className="mt-1 text-xs text-gray-600">
                        For them: {item.personal_note}
                      </p>
                    )}
                    {item.therapy_goal && (
                      <p className="mt-1 text-xs text-gray-500">Goal: {item.therapy_goal}</p>
                    )}
                    {item.frequency && item.frequency !== 'once' && (
                      <p className="mt-1 text-xs text-gray-500">
                        Repeats · {FREQUENCY_LABELS[item.frequency as Frequency] ?? item.frequency}
                      </p>
                    )}
                    {item.therapist_private_note && (
                      <p className="mt-2 rounded-lg bg-oat px-3 py-2 text-xs text-gray-600 border border-hairline">
                        <span className="font-semibold uppercase tracking-wide text-[10px] text-gray-500">
                          Only you
                        </span>
                        <br />
                        {item.therapist_private_note}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">
                        Assigned {formatHomeworkDate(item.assigned_at)}
                        {item.due_at ? ` · Due ${formatHomeworkDate(item.due_at)}` : ''}
                      </span>
                      {item.status === 'active' && (
                        <button
                          type="button"
                          onClick={() =>
                            markCompleted.mutate({ homeworkId: item.id, clientId })
                          }
                          disabled={markCompleted.isPending}
                          className="text-xs font-medium text-royal-purple hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Mark completed
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500 italic">No homework assigned yet.</p>
                <p className="mt-1 text-xs text-gray-500">
                  Homework you assign below will appear here.
                </p>
              </div>
            )}
          </div>

          {/* Assign */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                ASSIGN HOMEWORK
              </h2>
              <Link
                href="/worksheets"
                className="text-xs font-medium text-royal-purple hover:underline"
              >
                Browse the whole Library
              </Link>
            </div>

            <div className="mt-3 flex gap-1 rounded-lg bg-gray-100 p-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'library'}
                onClick={() => setMode('library')}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'library' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                From the Library
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'written'}
                onClick={() => setMode('written')}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'written' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                In my own words
              </button>
            </div>

            {mode === 'library' && (
              <div className="mt-4">
                {/* Filters */}
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <label className="text-[11px] font-medium text-gray-500">
                    Section
                    <select
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
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Name"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
                    />
                  </label>
                </div>

                <p className="mt-2 text-[11px] text-gray-500">
                  {filtered.length} approved exercise{filtered.length === 1 ? '' : 's'} ·{' '}
                  <Link
                    href={selectedToolId ? `/worksheets/${selectedToolId}` : '/worksheets'}
                    className="text-royal-purple hover:underline"
                  >
                    preview as the client sees it
                  </Link>
                </p>

                <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-hairline p-2">
                  {libraryQuery.isLoading && <p className="p-2 text-xs text-gray-500">Loading…</p>}
                  {!libraryQuery.isLoading && filtered.length === 0 && (
                    <p className="p-2 text-xs text-gray-500">No exercises match those filters.</p>
                  )}
                  {filtered.map((row) => (
                    <div
                      key={row.toolId}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        selectedToolId === row.toolId ? 'bg-lavender-wash' : 'hover:bg-gray-50'
                      }`}
                    >
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="exercise"
                          className="mt-1"
                          checked={selectedToolId === row.toolId}
                          onChange={() => setSelectedToolId(row.toolId)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">{row.label}</span>
                          {row.summary && (
                            <span className="block text-xs text-gray-600">{row.summary}</span>
                          )}
                          <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-500">
                            {row.section && <span>{SECTION_LABELS[row.section] ?? row.section}</span>}
                            {row.modality && <span>{row.modality}</span>}
                            <span>{ACCESS_LABELS[row.accessMode] ?? row.accessMode}</span>
                            {row.loadLevel && <span>{row.loadLevel}</span>}
                            {row.estMinutes != null && <span>{row.estMinutes} min</span>}
                          </span>
                          {row.therapistNote && (
                            <span className="mt-1 block rounded bg-oat px-2 py-1 text-[11px] text-gray-600">
                              <span className="font-semibold uppercase tracking-wide text-[10px] text-gray-500">
                                For therapists
                              </span>
                              <br />
                              {row.therapistNote}
                            </span>
                          )}
                        </span>
                      </label>
                      <div className="mt-1 flex items-center gap-3 pl-6">
                        <label className="flex items-center gap-1 text-[11px] text-gray-500">
                          <input
                            type="checkbox"
                            checked={setPicks.includes(row.toolId)}
                            onChange={() => toggleSetPick(row.toolId)}
                          />
                          Add to a set
                        </label>
                        <Link
                          href={`/worksheets/${row.toolId}`}
                          className="text-[11px] text-royal-purple hover:underline"
                        >
                          Preview
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleLibrarySubmit} className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="personal-note"
                      className="block text-xs font-medium text-gray-500"
                    >
                      A line for them, in their own words (optional)
                    </label>
                    <input
                      id="personal-note"
                      value={personalNote}
                      onChange={(e) => setPersonalNote(e.target.value)}
                      maxLength={500}
                      placeholder="e.g. for when the 9am standup starts"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Shown above the step the worksheet marks for it. Never replaces their answers.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-medium text-gray-500">
                      How often
                      <select
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as Frequency)}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                      >
                        {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      Due
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                      />
                    </label>
                  </div>

                  <label className="block text-xs font-medium text-gray-500">
                    Linked goal (optional)
                    <select
                      value={goalId}
                      onChange={(e) => setGoalId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                    >
                      <option value="">No goal</option>
                      {(goalsQuery.data ?? [])
                        .filter((goal) => goal.status === 'active')
                        .map((goal) => (
                          <option key={goal.id} value={goal.id}>
                            {goal.text}
                          </option>
                        ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-gray-500">
                      Goals you keep with the team live on{' '}
                      <Link href={`/clients/${clientId}/notes`} className="text-royal-purple hover:underline">
                        Clinical notes
                      </Link>
                      .
                    </span>
                  </label>

                  <label className="block text-xs font-medium text-gray-500">
                    Private note — the client never sees this
                    <textarea
                      value={privateNote}
                      onChange={(e) => setPrivateNote(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="e.g. chose this one because they froze at the review"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={assignHomework.isPending || !selectedToolId}
                    className="w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {assignHomework.isPending
                      ? 'Assigning...'
                      : selectedRow
                        ? `Assign “${selectedRow.label}”`
                        : 'Assign exercise'}
                  </button>
                </form>
              </div>
            )}

            {mode === 'written' && (
              <form onSubmit={handleWrittenSubmit} className="mt-4">
                <label htmlFor="homework-description" className="sr-only">
                  Homework description
                </label>
                <textarea
                  id="homework-description"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    sessionStorage.setItem(DRAFT_KEY, e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  rows={4}
                  placeholder="e.g. Practice box breathing before bed each night this week."
                  disabled={assignHomework.isPending}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60 disabled:cursor-not-allowed"
                />

                <label htmlFor="homework-tool" className="mt-3 block text-xs font-medium text-gray-500">
                  Link to a specific exercise (optional)
                </label>
                <select
                  id="homework-tool"
                  value={toolId}
                  onChange={(e) => setToolId(e.target.value)}
                  disabled={assignHomework.isPending || toolsQuery.isLoading}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">None — text only</option>
                  {toolsQuery.data?.map((tool) => (
                    <option key={tool.toolId} value={tool.toolId}>
                      {tool.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Linking renders this as a real, playable exercise in the client&rsquo;s app —
                  only what you assign here appears there.
                </p>

                <button
                  type="submit"
                  disabled={assignHomework.isPending || !description.trim()}
                  className="mt-3 w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {assignHomework.isPending ? 'Assigning...' : 'Assign homework'}
                </button>
              </form>
            )}

            {validationError && (
              <p
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-lg bg-danger-tint p-3 text-sm text-danger text-center"
              >
                {validationError}
              </p>
            )}
            {successMessage && (
              <p
                role="status"
                aria-live="polite"
                className="mt-4 rounded-lg bg-sage-tint p-3 text-sm text-sage-deep text-center"
              >
                {successMessage}
              </p>
            )}
            {errorMessage && (
              <p
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-lg bg-danger-tint p-3 text-sm text-danger text-center"
              >
                {errorMessage}
              </p>
            )}
          </div>

          {/* Sets */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              SETS
            </h2>
            <p className="text-xs text-gray-500">
              A set is a shortcut for you. Only you can see it, and it can be assigned to any
              client on your roster.
            </p>

            <form onSubmit={handleCreateSet} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-xs font-medium text-gray-500">
                New set
                <input
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. My anxiety starter set"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <button
                type="submit"
                disabled={createSet.isPending}
                className="rounded-lg border border-violet px-3 py-2 text-xs font-medium text-royal-purple hover:bg-lavender-wash disabled:opacity-60"
              >
                {createSet.isPending
                  ? 'Saving...'
                  : `Save ${setPicks.length || 'no'} exercise${setPicks.length === 1 ? '' : 's'} as a set`}
              </button>
            </form>
            <p className="mt-1 text-[11px] text-gray-500">
              Tick exercises in the list above to put them in a new set.
            </p>

            <div className="mt-4 space-y-3">
              {(setsQuery.data ?? []).length === 0 && (
                <p className="text-xs italic text-gray-500">No sets yet.</p>
              )}
              {(setsQuery.data ?? []).map((set) => (
                <div key={set.id} className="rounded-lg border border-hairline bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{set.name}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-600">
                        {set.exercises.map((exercise) => (
                          <span key={exercise.toolId}>
                            {exercise.label}
                            {exercise.available ? '' : ' (needs editing)'}
                          </span>
                        ))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSet.mutate({ setId: set.id })}
                      disabled={removeSet.isPending}
                      className="text-[11px] text-danger hover:underline disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-[11px] font-medium text-gray-500">
                      How often
                      <select
                        value={newSetFrequency}
                        onChange={(e) => setNewSetFrequency(e.target.value as Frequency)}
                        className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
                      >
                        {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-gray-500">
                      Due
                      <input
                        type="date"
                        value={newSetDueDate}
                        onChange={(e) => setNewSetDueDate(e.target.value)}
                        className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        clientId &&
                        assignSet.mutate({
                          clientUserId: clientId,
                          setId: set.id,
                          frequency: newSetFrequency,
                          dueAt: dateInputToIso(newSetDueDate),
                        })
                      }
                      disabled={assignSet.isPending}
                      className="rounded-lg bg-violet px-3 py-2 text-xs font-medium text-white hover:bg-royal-purple disabled:opacity-60"
                    >
                      {assignSet.isPending ? 'Assigning...' : 'Assign this set'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
