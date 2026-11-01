import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createCaller } from '@/server/caller';
import { formatClientLabel } from '@/lib/format';
import type {
  ConversationPage as ConversationPageData,
  ConversationTurn,
} from '@/server/routers/clients';
import { TabStrip } from '../_components/TabStrip';
import { ConsentChip } from '../_components/ConsentChip';

/**
 * E16-S9 — the therapist's read-only view of one client's conversation with
 * the agent.
 *
 * Server component on purpose: the transcript is fetched in-process through
 * the same tRPC caller the /api/trpc route uses (so the access check and the
 * ClinicalAccessLog write happen in exactly one place), and no clinical
 * content ever travels through a client-side data layer or a secret-bearing
 * request from the browser. The only client component on this page is the
 * existing ConsentChip, and only on the refusal path (it owns the "ask to
 * share" mutation).
 *
 * Not a chat UI: the portal's design doc is explicit that this is an
 * oversight tool, not a messaging product. Turns render as a plain clinical
 * timeline with a timestamp and a speaker label — no bubbles, no composer,
 * and nothing on this page can write a turn.
 */
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Narrow tRPC error shape — avoids importing the server package here. */
function errorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TurnRow({ turn }: { turn: ConversationTurn }) {
  const isClient = turn.role === 'user';
  return (
    <li
      className={`border-l-[3px] pl-4 py-3 ${
        isClient ? 'border-l-hairline' : 'border-l-violet'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {isClient ? 'Client' : 'Agent'}
        </span>
        <span className="text-xs text-gray-500">{formatTimestamp(turn.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
        {turn.content}
      </p>
    </li>
  );
}

function Shell({
  clientId,
  clientLabel,
  children,
}: {
  clientId: string;
  clientLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link
              href={`/clients/${clientId}`}
              className="hover:text-royal-purple transition-colors"
            >
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Conversation</span>
          </div>

          <h1 className="sr-only">{clientLabel} — Conversation with the agent</h1>

          <TabStrip clientId={clientId} active="conversation" />

          {children}
        </div>
      </div>
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'honey' | 'neutral' | 'danger';
  title: string;
  children: React.ReactNode;
}) {
  const rail =
    tone === 'honey' ? 'border-l-honey-deep' : tone === 'danger' ? 'border-l-danger' : 'border-l-hairline';
  return (
    <div className={`rounded-xl bg-oat-elevated p-6 border border-hairline border-l-[3px] ${rail}`}>
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h2>
      <div className="mt-2 text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

export default async function ClientConversationPage({ params, searchParams }: PageProps) {
  const { id: clientId } = await params;
  const query = await searchParams;
  const rawCursor = query.cursor;
  const cursor = typeof rawCursor === 'string' && rawCursor.length > 0 ? rawCursor : undefined;

  const clientLabel = formatClientLabel(clientId);

  if (process.env.LOCAL_DEV_BYPASS_AUTH === 'true') {
    // No fixtures: a fabricated transcript in local dev would be the one
    // thing an auditor could mistake for a real read. Bypass renders the
    // same refusal path a therapist without an access window sees.
    return (
      <Shell clientId={clientId} clientLabel={clientLabel}>
        <Notice tone="honey" title="No access to this conversation">
          Local development runs without a signed-in therapist, so there is no chat-access
          window to read under. Sign in against a real therapist account to use this view.
        </Notice>
      </Shell>
    );
  }

  const caller = await createCaller(await headers());

  let data: ConversationPageData | null = null;
  let refusal: 'no_window' | 'unavailable' | null = null;

  try {
    data = await caller.clients.conversation({ clientUserId: clientId, cursor });
  } catch (err) {
    const code = errorCode(err);
    if (code === 'FORBIDDEN') {
      refusal = 'no_window';
    } else if (code === 'BAD_REQUEST') {
      // A hand-edited or stale cursor: fall back to the first page rather
      // than showing an error for a URL the therapist did not type.
      data = await caller.clients.conversation({ clientUserId: clientId }).catch(() => null);
      if (!data) refusal = 'unavailable';
    } else if (code === 'UNAUTHORIZED') {
      redirect('/auth');
    } else {
      refusal = 'unavailable';
    }
  }

  if (refusal !== null) {
    // On a FORBIDDEN the procedure cannot tell us *why* by design, so the
    // profile read fills in the consent chip. That read is itself an
    // existing, separately-logged clinical access event (VIEW_CLIENT_DETAIL);
    // if the therapist isn't on this client at all it throws too, and the
    // page says so plainly without disclosing anything about the client.
    let detail: Awaited<ReturnType<typeof caller.clients.detail>> | null = null;
    try {
      detail = await caller.clients.detail({ clientUserId: clientId });
    } catch (err) {
      if (errorCode(err) === 'UNAUTHORIZED') redirect('/auth');
      // Anything else (not on the roster, DB unavailable) leaves detail
      // null and renders the generic notice below.
    }

    if (!detail) {
      return (
        <Shell clientId={clientId} clientLabel={clientLabel}>
          <Notice tone="neutral" title="Conversation unavailable">
            This client is not on your roster, or the conversation cannot be opened right
            now. Return to the{' '}
            <Link href="/dashboard" className="text-royal-purple hover:underline">
              dashboard
            </Link>{' '}
            and try again.
          </Notice>
        </Shell>
      );
    }

    const askedAt = detail.consent.chatAccessRequestedAt;

    return (
      <Shell clientId={clientId} clientLabel={clientLabel}>
        <Notice tone="honey" title="No access to this conversation">
          {askedAt ? (
            <>
              You asked this client to share their chat on{' '}
              <span className="font-medium">{formatTimestamp(askedAt)}</span>. A read window
              is open for 30 days from that request and it has closed — ask again to reopen
              it.
            </>
          ) : (
            <>
              Chat access has not been requested for this client. Asking opens a 30-day
              window in which you can read their conversation with the agent.
            </>
          )}
        </Notice>

        <div className="rounded-xl bg-oat-elevated p-6 border border-hairline">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
            CHAT ACCESS
          </h2>
          <ConsentChip
            clientUserId={clientId}
            clientLabel={clientLabel}
            consent={detail.consent}
          />
          <p className="mt-3 text-xs text-gray-500">
            This view is read-only. You can read the conversation; you can never send a
            message to the client through the portal.
          </p>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell clientId={clientId} clientLabel={clientLabel}>
        <Notice tone="neutral" title="Conversation unavailable">
          The conversation could not be loaded. Refresh to try again.
        </Notice>
      </Shell>
    );
  }

  const olderHref =
    data.nextCursor !== null
      ? `/clients/${clientId}/conversation?cursor=${encodeURIComponent(data.nextCursor)}`
      : null;

  return (
    <Shell clientId={clientId} clientLabel={clientLabel}>
      <div className="rounded-xl bg-oat-elevated p-6 border border-hairline">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            CONVERSATION WITH AGENT
          </h2>
          <p className="text-xs text-gray-500">
            Access window: requested {formatTimestamp(data.window.requestedAt)} · open until{' '}
            {formatTimestamp(data.window.expiresAt)}
          </p>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Read-only. Opening this page is recorded in the client&rsquo;s clinical access log.
        </p>

        {data.turns.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 italic">
            No conversation yet. The client has not exchanged any messages with the agent
            inside this window.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-hairline">
            {data.turns.map((turn) => (
              <TurnRow key={turn.id} turn={turn} />
            ))}
          </ol>
        )}

        {olderHref && (
          <div className="mt-4 border-t border-hairline pt-4">
            <Link
              href={olderHref}
              className="text-sm font-medium text-royal-purple hover:underline"
            >
              &larr; Older messages
            </Link>
          </div>
        )}
      </div>
    </Shell>
  );
}
