'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { useClientHeader } from '../_components/useClientHeader';
import { TabStrip } from '../_components/TabStrip';

type Point = { at: string; before: number | null; after: number | null };

/**
 * A plain picture of the ratings the client gave, oldest on the left. Two
 * lines, no axis, no scale label, no arrow: it shows the shape and stops
 * there, because "improving" and "getting worse" are conclusions the therapist
 * draws, not ones this page is allowed to draw for them.
 */
function Trend({ points }: { points: Point[] }) {
  const rated = points.filter((p) => p.before !== null || p.after !== null);
  if (rated.length === 0) {
    return <p className="text-xs text-gray-500">No before/after ratings on these entries.</p>;
  }

  const w = 120;
  const h = 28;
  const x = (i: number) => (rated.length === 1 ? w / 2 : (i / (rated.length - 1)) * w);
  const y = (v: number) => h - (v / 10) * h;
  const line = (key: 'before' | 'after') =>
    rated
      .map((p, i) => (p[key] === null ? null : `${x(i)},${y(p[key] as number)}`))
      .filter((part): part is string => part !== null)
      .join(' ');

  return (
    <div className="mt-2 flex items-center gap-3">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
        <polyline points={line('before')} fill="none" stroke="#6B5B95" strokeWidth="1.5" />
        <polyline points={line('after')} fill="none" stroke="#B08D57" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
      <span className="text-xs text-gray-500">
        {rated.map((p) => `${p.before ?? '–'}→${p.after ?? '–'}`).join('  ·  ')}
      </span>
    </div>
  );
}


/**
 * "Shared with me" — the only place a therapist reads a client's journal,
 * worksheet answers or Treasure notes.
 *
 * Everything on this page is here because the client turned that one item's
 * share on in their app. Turning it off removes the row from this query, so
 * the page is empty for it on the next load; there is no cache to clear and no
 * copy to chase. Nothing here is chat: chat has its own approval switch and
 * window and is read on the Conversation tab.
 *
 * The empty state is worded so a therapist does not read "nothing shared" as
 * "nothing written" — it is a choice, not an absence.
 */
export default function ClientSharedPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { label } = useClientHeader(clientId);

  const sharedQuery = trpc.shared.list.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const items = sharedQuery.data?.items ?? [];
  const patterns = sharedQuery.data?.patterns ?? [];
  const assignments = sharedQuery.data?.assignments ?? [];

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href={`/clients/${clientId}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {label}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Shared with me</h1>
        <p className="mt-1 text-sm text-gray-600">
          What {label} has chosen to share, one item at a time. Anything they stop sharing leaves
          this page immediately, and what they keep private is never here.
        </p>
      </div>

      <TabStrip clientId={clientId} active="shared" />

      {patterns.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Patterns</h2>
          <p className="mt-1 text-xs text-gray-500">
            The ratings {label} gave on the entries they shared, and what they said got in the way.
            Nothing here is scored, and nothing they kept private is counted.
          </p>
          <div className="mt-3 space-y-3">
            {patterns.map((pattern) => (
              <article
                key={pattern.worksheetId}
                className="rounded-lg border border-hairline bg-white p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{pattern.label}</h3>
                  <span className="text-xs text-gray-500">
                    {pattern.occurrences} shared {pattern.occurrences === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                {pattern.textOnly ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Shared as text only — no before/after ratings.
                  </p>
                ) : (
                  <>
                    <Trend points={pattern.points} />
                    <p className="mt-1 text-xs text-gray-500">
                      {pattern.beforeRange &&
                        `Before ${pattern.beforeRange.low}–${pattern.beforeRange.high}/10`}
                      {pattern.beforeRange && pattern.afterRange && ' · '}
                      {pattern.afterRange &&
                        `After ${pattern.afterRange.low}–${pattern.afterRange.high}/10`}
                    </p>
                  </>
                )}

                {pattern.barriers.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-500">What got in the way</p>
                    <ul className="mt-1 space-y-0.5">
                      {pattern.barriers.map((barrier, i) => (
                        <li key={i} className="text-sm text-gray-700">
                          {barrier}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {assignments.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Assigned work</h2>
          <p className="mt-1 text-xs text-gray-500">
            Whether an assignment was done. The work itself stays private unless {label} shares it.
          </p>
          <ul className="mt-3 divide-y divide-hairline rounded-lg border border-hairline bg-white">
            {assignments.map((assignment) => (
              <li
                key={assignment.homeworkId}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <p className="text-sm text-gray-900">{assignment.label}</p>
                  <p className="text-xs text-gray-500">
                    {assignment.dueAt
                      ? `Due ${new Date(assignment.dueAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}`
                      : 'No due date'}
                    {assignment.repeating && ' · Repeats'}
                  </p>
                </div>
                <span
                  className={
                    assignment.done
                      ? 'rounded-full bg-sage-tint px-2.5 py-1 text-xs font-medium text-sage-deep'
                      : 'rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600'
                  }
                >
                  {assignment.done ? 'Done' : 'Not done'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 space-y-4">
        {sharedQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {sharedQuery.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {sharedQuery.error.message}
          </div>
        )}

        {sharedQuery.data && items.length === 0 && (
          <div className="rounded-lg border border-hairline bg-oat-elevated p-4 text-sm text-gray-600">
            Nothing is shared right now. Items appear here only when {label} turns on sharing for
            that entry, worksheet or note.
          </div>
        )}

        {items.map((item) => (
          <article
            key={`${item.kind}-${item.id}`}
            className="rounded-lg border border-hairline bg-white p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">{item.title}</h2>
              <span className="text-xs text-gray-500">
                {new Date(item.at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {item.kind === 'worksheet_response' &&
              (item.feelingBefore !== null || item.feelingAfter !== null || item.helped !== null) && (
                <p className="mt-1 text-xs text-gray-500">
                  {item.feelingBefore !== null && `Before ${item.feelingBefore}/10`}
                  {item.feelingBefore !== null && item.feelingAfter !== null && ' · '}
                  {item.feelingAfter !== null && `After ${item.feelingAfter}/10`}
                  {item.feelingAfter !== null && item.helped !== null && ' · '}
                  {item.helped !== null && (item.helped ? 'Marked as helpful' : 'Not marked as helpful')}
                </p>
              )}

            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{item.body}</p>

            {item.barriers && (
              <p className="mt-2 text-xs text-gray-600">
                <span className="font-medium">What got in the way:</span> {item.barriers}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
