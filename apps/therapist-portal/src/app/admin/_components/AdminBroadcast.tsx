'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';

/**
 * Admin → every client: a service update or a festival greeting.
 *
 * The second sender class, and deliberately not a therapist tool: nothing here
 * may describe a person. Their phone shows only "News from OKUVU"; this wording
 * appears inside the app. One notice per client per IST day, and anyone who
 * switched announcements off is not buzzed — they still find it in the app.
 *
 * The send button is gated on having seen the audience and on a confirmation
 * tick. Two admins pressing send at once is not a risk the UI can solve (the
 * api's per-client dedupe does that); one admin sending by accident is.
 */

const MAX_TITLE = 120;
const MAX_BODY = 500;

const KINDS = [
  { id: 'service_update', label: 'Service update', hint: 'App news, a maintenance window, a new feature.' },
  { id: 'festival_greeting', label: 'Festival greeting', hint: 'A greeting. Nothing about care.' },
] as const;

type BroadcastKind = (typeof KINDS)[number]['id'];

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-hairline bg-oat-elevated"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      {children}
    </section>
  );
}

export function AdminBroadcast() {
  const [kind, setKind] = useState<BroadcastKind>('service_update');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const audience = trpc.admin.broadcastAudience.useQuery();
  const history = trpc.admin.broadcastHistory.useQuery();
  const send = trpc.admin.sendBroadcast.useMutation({
    onSuccess: (res) => {
      setResult(
        `Sent. ${res.rowsWritten} inbox row${res.rowsWritten === 1 ? '' : 's'} written, ` +
          `${res.pushed} phone${res.pushed === 1 ? '' : 's'} buzzed, ` +
          `${res.skippedForCap} already had a notice today.`,
      );
      setConfirmed(false);
      setTitle('');
      setBody('');
      history.refetch();
      audience.refetch();
    },
  });

  const canSend = title.trim().length >= 3 && body.trim().length >= 3 && confirmed && !send.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <div className="border-b border-hairline px-6 py-4">
          <h2 className="text-lg font-semibold text-charcoal-ink">Send a notice</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
            To every client who has the app. Their phone shows only “News from OKUVU”; this wording appears
            inside the app. One notice per client per day — a second one today will reach nobody's phone.
          </p>
        </div>

        <div className="space-y-4 p-6">
          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Kind</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {KINDS.map((option) => (
                <label
                  key={option.id}
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                    kind === option.id
                      ? 'border-charcoal-ink bg-oat font-medium text-charcoal-ink'
                      : 'border-hairline text-ink-soft'
                  }`}
                >
                  <input
                    type="radio"
                    name="notice-kind"
                    value={option.id}
                    checked={kind === option.id}
                    onChange={() => {
                      setKind(option.id);
                      setConfirmed(false);
                    }}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-soft">{KINDS.find((k) => k.id === kind)?.hint}</p>
          </fieldset>

          <div>
            <label htmlFor="notice-title" className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Heading
            </label>
            <input
              id="notice-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setConfirmed(false);
              }}
              maxLength={MAX_TITLE}
              placeholder="Diwali wishes"
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm text-charcoal-ink"
            />
          </div>

          <div>
            <label htmlFor="notice-body" className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Message
            </label>
            <textarea
              id="notice-body"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setConfirmed(false);
              }}
              maxLength={MAX_BODY}
              rows={4}
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm text-charcoal-ink"
            />
            <p className="mt-1 text-xs text-ink-soft">
              {body.length}/{MAX_BODY} — no names, no conditions, no session details. This is not a clinical
              message.
            </p>
          </div>

          {audience.isError ? (
            <p role="alert" className="text-sm text-danger">
              Could not read the audience. Do not send blind — refresh to retry.
            </p>
          ) : !audience.data ? (
            <p className="text-sm text-ink-soft">Checking who this reaches…</p>
          ) : (
            <div className="rounded-xl border border-hairline bg-oat px-5 py-4">
              <p className="text-sm text-charcoal-ink">
                <span className="font-semibold">{audience.data.recipients}</span> client
                {audience.data.recipients === 1 ? '' : 's'} will get this in the app
                {audience.data.optedOut > 0 && (
                  <>
                    {' '}
                    — <span className="font-semibold">{audience.data.optedOut}</span> of them have announcements
                    switched off, so their phone will not buzz
                  </>
                )}
                .
              </p>
              <label className="mt-3 flex items-start gap-3 text-sm text-charcoal-ink">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Send this now. It cannot be recalled.</span>
              </label>
              <button
                type="button"
                disabled={!canSend}
                onClick={() =>
                  send.mutate({ kind, title: title.trim(), body: body.trim(), confirmed: true as const })
                }
                className="mt-3 rounded-lg bg-charcoal-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {send.isPending ? 'Sending…' : 'Send notice'}
              </button>
            </div>
          )}

          {result && (
            <p role="status" className="rounded-xl border border-hairline bg-oat px-5 py-3 text-sm text-charcoal-ink">
              {result}
            </p>
          )}

          {send.isError && (
            <p role="alert" className="text-sm text-danger">
              {send.error.message}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="border-b border-hairline px-6 py-4">
          <h2 className="text-lg font-semibold text-charcoal-ink">Recent notices</h2>
          <p className="mt-1 text-xs text-ink-soft">
            So a second admin can see one already went out today. One line per send, with how many inboxes it
            reached.
          </p>
        </div>
        {history.isLoading ? (
          <div role="status" aria-busy="true" className="px-6 py-8 text-sm text-ink-soft">
            Loading…
          </div>
        ) : history.isError ? (
          <p role="alert" className="px-6 py-8 text-sm text-danger">
            Could not load the notice history. Do not read an empty list as “nothing has been sent”.
          </p>
        ) : history.data && history.data.length > 0 ? (
          <ul className="divide-y divide-hairline">
            {history.data.map((notice) => (
              <li key={`${notice.title}-${notice.sentAt}`} className="px-6 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-charcoal-ink">{notice.title}</p>
                  <p className="text-xs text-ink-soft">
                    {new Date(notice.sentAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    · {notice.recipients} inbox{notice.recipients === 1 ? '' : 'es'}
                  </p>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{notice.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base italic text-ink-soft">No notices sent yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
