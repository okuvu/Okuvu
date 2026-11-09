'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';

/**
 * Send a note to a client's Treasure Box.
 *
 * Deliberately framed as a gift, not an assignment: the note waits in their
 * Updates ("Your therapist sent you something for your Treasure Box") and only
 * lands in the box when they tap Keep. Nothing is written into their box behind
 * their back, and a note they decline leaves no copy.
 *
 * There is no "mark as read" for the therapist and no delivery receipt. A
 * therapist who needs to know the client saw it asks them, which is what the
 * next session is for.
 */
export function TreasureNoteCard({
  clientId,
  clientLabel,
}: {
  clientId: string;
  clientLabel: string;
}) {
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = trpc.treasureBox.send.useMutation({
    onSuccess: () => {
      setSent(true);
      setError(null);
      setBody('');
    },
    onError: (err) => {
      setSent(false);
      setError(err.message);
    },
  });

  const remaining = 2000 - body.length;

  return (
    <section className="rounded-xl border border-hairline bg-white p-5">
      <h2 className="text-sm font-semibold text-ink">Send to their Treasure Box</h2>
      <p className="mt-1 text-xs text-ink-soft">
        Something worth keeping: a line that helped, a reminder for a hard day, a step that worked.
        It appears in {clientLabel}&rsquo;s Updates, and only goes into their box when they tap Keep.
        Write it with them if you can.
      </p>

      <label htmlFor="treasure-note" className="sr-only">
        Note for the client&rsquo;s Treasure Box
      </label>
      <textarea
        id="treasure-note"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setSent(false);
          setError(null);
        }}
        rows={4}
        maxLength={2000}
        placeholder="Write the note in your own words."
        className="mt-3 w-full rounded-lg border border-hairline bg-oat p-3 text-sm text-ink outline-none focus:border-royal-purple"
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-soft">{remaining} characters left</span>
        <button
          type="button"
          onClick={() => send.mutate({ clientId, body })}
          disabled={send.isPending || body.trim().length === 0}
          className="rounded-lg bg-royal-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {send.isPending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {sent && (
        <p role="status" className="mt-3 text-sm text-sage-deep">
          Sent. It is in their Updates now.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
