'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import type { TestEnvironment } from '@evia/shared-types';
import { trpc } from '@/trpc/client';

export default function GateSignOff({ environment }: { environment: TestEnvironment }) {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const [gate, setGate] = useState('');
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [evidence, setEvidence] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const signOff = trpc.dashboard.signOffGate.useMutation({
    onSuccess: () => {
      setFeedback('Sign-off recorded.');
      setGate('');
      setEvidence('');
      utils.dashboard.getOverview.invalidate({ environment });
    },
    onError: (error: { message: string }) => {
      setFeedback(`Failed to record sign-off: ${error.message}`);
    },
  });

  if (session?.user?.role !== 'PI') {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
      <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
        Sign off a gate
      </h2>
      <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        Sign-offs are append-only — each decision is recorded as a new immutable entry.
      </p>

      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!gate.trim()) return;
          setFeedback(null);
          signOff.mutate({
            gate: gate.trim(),
            environment,
            decision,
            evidence: evidence.trim() || undefined,
          });
        }}
      >
        <label className="flex flex-col gap-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Gate name
          <input
            type="text"
            value={gate}
            onChange={(event) => setGate(event.target.value)}
            placeholder="e.g. safety-gate"
            required
            className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Decision
          <select
            value={decision}
            onChange={(event) => setDecision(event.target.value as 'APPROVED' | 'REJECTED')}
            className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          >
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Evidence (optional)
          <textarea
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            rows={3}
            className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
          />
        </label>

        <button
          type="submit"
          disabled={signOff.isPending}
          className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-sm)] font-medium text-[var(--color-on-primary)] transition-opacity disabled:opacity-50"
        >
          {signOff.isPending ? 'Recording…' : 'Record sign-off'}
        </button>

        {feedback ? (
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            {feedback}
          </p>
        ) : null}
      </form>
    </div>
  );
}
