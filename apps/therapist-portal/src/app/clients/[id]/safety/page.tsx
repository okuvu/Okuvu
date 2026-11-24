'use client';

/**
 * The client's Safety card.
 *
 * Two things it shows, in this order:
 *
 *   1. **Urgent flags, first and expanded.** An urgent flag is the
 *      harm-to-someone screen (owner's approval, 24 Nov 2026). It is not a
 *      notification with a link — the client's own words are on the card, so the
 *      therapist can judge the disclosure without opening anything else. That is
 *      the one place the product shows content on a flag, and it is why the flag
 *      keeps its own `source` value.
 *   2. **The history**, newest first: what happened, when, which screen the
 *      client was shown, and whether anyone has looked at it yet.
 *
 * Everything else on this page keeps the old rule: an event, a level, a time and
 * a source — no message text, no transcript.
 */

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { entryById } from '@okuvu/shared-types/worksheets';
import { trpc } from '@/trpc/client';
import { useClientHeader } from '../_components/useClientHeader';
import { TabStrip } from '../_components/TabStrip';

/** The worksheet's client-facing name, from the catalogue; the id if unknown. */
function worksheetLabel(toolId: string | null): string | null {
  if (!toolId) return null;
  return entryById(toolId)?.label ?? toolId;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function sourceLabel(source: string | null): string {
  switch (source) {
    case 'harm_to_someone':
      return 'Harm to someone else';
    case 'crisis_card':
      return 'Crisis card';
    case 's3_grounding':
      return 'Grounding card';
    case 'third_party_crisis':
      return 'Someone else at risk';
    case 'medical_emergency':
      return 'Medical emergency';
    case 'journal_entry':
      return 'Journal entry';
    case 'worksheet_answer':
      return 'Worksheet answer';
    case 'treasure_note':
      return 'Treasure Box note';
    case 'mood_log':
      return 'Mood check-in';
    default:
      return source ?? 'Not recorded';
  }
}

export default function ClientSafetyPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { label: clientLabel } = useClientHeader(clientId);

  const flagsQuery = trpc.safety.flagsForClient.useQuery(
    { clientUserId: clientId, limit: 20 },
    { enabled: Boolean(clientId) },
  );

  const acknowledge = trpc.safety.acknowledge.useMutation({
    onSuccess: async () => {
      await flagsQuery.refetch();
    },
  });

  const flags = flagsQuery.data ?? [];
  const urgent = flags.filter((flag) => flag.urgent && !flag.acknowledgedAt);
  const rest = flags.filter((flag) => !(flag.urgent && !flag.acknowledgedAt));

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-royal-purple transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Safety</span>
          </div>

          <TabStrip clientId={clientId} active="safety" />

          {flagsQuery.isLoading && (
            <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
              <p className="text-sm text-gray-500">Loading&hellip;</p>
            </div>
          )}

          {flagsQuery.isError && (
            <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
              <p role="alert" className="text-sm text-danger">
                Could not load the safety record just now. It has not been lost — try again in a
                moment.
              </p>
            </div>
          )}

          {urgent.map((flag) => (
            <div
              key={flag.id}
              className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline border-l-4 border-l-danger"
              data-testid="urgent-safety-flag"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-danger">
                    URGENT &mdash; {sourceLabel(flag.source)}
                  </h2>
                  <p className="mt-1 text-sm text-gray-900">
                    {clientLabel} wrote this on {when(flag.occurredAt)}
                    {flag.wordsFrom ? ` in ${worksheetLabel(flag.wordsFrom)}` : ''}.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-danger/10 px-2 py-1 text-[11px] font-semibold text-danger">
                  {flag.level}
                </span>
              </div>

              {flag.words ? (
                <blockquote className="mt-3 whitespace-pre-wrap rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-gray-900">
                  {flag.words}
                </blockquote>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  The answer itself is no longer on file &mdash; it may have been deleted from the
                  client&apos;s side. The event is still recorded.
                </p>
              )}

              <p className="mt-3 text-xs text-gray-500">
                {clientLabel} was shown the harm-to-someone screen: 112 as a tappable call, their
                own safety plan, and a line telling them you had been told this is urgent. They
                were not shown the helpline list.
              </p>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => acknowledge.mutate({ flagId: flag.id })}
                  disabled={acknowledge.isPending}
                  className="rounded-lg border border-violet px-3 py-2 text-xs font-medium text-royal-purple hover:bg-lavender-wash disabled:opacity-60"
                >
                  {acknowledge.isPending ? 'Saving...' : 'I have seen this'}
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              SAFETY RECORD
            </h2>
            <p className="text-xs text-gray-500">
              Events where the safety check flagged something. The client&apos;s words are shown
              only on the urgent harm-to-someone flag &mdash; every other row records what happened,
              when, and which screen they saw.
            </p>

            <div className="mt-4 space-y-2">
              {!flagsQuery.isLoading && rest.length === 0 && urgent.length === 0 && (
                <p className="text-xs italic text-gray-500">Nothing recorded.</p>
              )}
              {rest.map((flag) => {
                const seen = Boolean(flag.acknowledgedAt);
                return (
                  <div
                    key={flag.id}
                    className="rounded-lg border border-hairline bg-gray-50 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900">
                          {sourceLabel(flag.source)} &middot; {flag.level}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {when(flag.occurredAt)}
                          {seen ? ` · seen ${when(flag.acknowledgedAt!)}` : ' · not seen yet'}
                        </p>
                        {flag.urgent && flag.words && (
                          <blockquote className="mt-2 whitespace-pre-wrap rounded border border-hairline bg-white px-3 py-2 text-xs text-gray-900">
                            {flag.words}
                          </blockquote>
                        )}
                      </div>
                      {!seen && (
                        <button
                          type="button"
                          onClick={() => acknowledge.mutate({ flagId: flag.id })}
                          disabled={acknowledge.isPending}
                          className="shrink-0 text-[11px] text-royal-purple hover:underline disabled:opacity-60"
                        >
                          Mark seen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
