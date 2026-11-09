'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { useClientHeader } from '../_components/useClientHeader';
import { TabStrip } from '../_components/TabStrip';
import {
  answersToDraft,
  draftToAnswers,
  hasContent,
} from '@/lib/safety-plan-form';

/**
 * The safety plan editor.
 *
 * Filled in WITH the client during a session, from the seven approved parts.
 * This is the only place a plan can be written: the client's app has no form
 * for it, and until a plan is saved here the Library card does not exist on
 * their side at all.
 *
 * Two things the page deliberately does not offer: a blank "new plan" template
 * written by us (every prompt is the approved document's), and a free-text
 * helpline box (the crisis numbers come from the central list, read-only).
 */
export default function ClientSafetyPlanPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { label } = useClientHeader(clientId);

  const planQuery = trpc.safetyPlan.get.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [contact, setContact] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Hydrate once, from the stored plan or from nothing.
  useEffect(() => {
    if (loaded || !planQuery.data) return;
    const fields = planQuery.data.parts.filter((part) => part.type !== 'instruction');
    setDrafts(answersToDraft(fields as never, (planQuery.data.answers ?? {}) as never));
    setContact(planQuery.data.therapistContact ?? '');
    setLoaded(true);
  }, [planQuery.data, loaded]);

  const save = trpc.safetyPlan.save.useMutation({
    onSuccess: async (result) => {
      setError(null);
      setSaved(
        result.created
          ? 'Plan saved. It is now on the client’s Library screen and on their crisis screen.'
          : 'Plan updated.',
      );
      await planQuery.refetch();
      setTimeout(() => setSaved(null), 6000);
    },
    onError: (err) => {
      setSaved(null);
      setError(err.message);
    },
  });

  const fields = useMemo(
    () => (planQuery.data?.parts ?? []).filter((part) => part.type !== 'instruction'),
    [planQuery.data],
  );

  const professionalPart = planQuery.data?.parts.find((part) => part.id === 'professional');

  const submit = () => {
    setError(null);
    const parts = fields.map((part) => ({ id: part.id, text: drafts[part.id] ?? '' }));
    if (!hasContent(draftToAnswers(fields as never, drafts))) {
      setError('Fill in at least one part before saving the plan.');
      return;
    }
    save.mutate({ clientId, parts, therapistContact: contact.trim() });
  };

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href={`/clients/${clientId}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {label}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Safety plan</h1>
        <p className="mt-1 text-sm text-gray-600">
          Fill this in together with {label}, in their words. They can read it any time, including
          from the crisis screen. Only you can change it, and only while they are on your caseload.
        </p>
      </div>

      <TabStrip clientId={clientId} active="safety-plan" />

      <div className="mt-6 space-y-4">
        {planQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {planQuery.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {planQuery.error.message}
          </div>
        )}

        {planQuery.data && (
          <>
            <div
              className={`rounded-lg border p-4 text-sm ${
                planQuery.data.exists
                  ? 'border-sage-deep/20 bg-sage-tint text-sage-deep'
                  : 'border-honey-deep/20 bg-honey-tint text-honey-deep'
              }`}
            >
              {planQuery.data.exists
                ? `This plan is live for ${label}. Changes take effect immediately.`
                : `No plan yet. Until you save one, ${label} has no safety plan card in the app — not even an empty one.`}
            </div>

            <p className="text-sm italic text-gray-500">
              {planQuery.data.intro} — the client sees this line above the parts.
            </p>

            {planQuery.data.parts.map((part, index) => {
              const heading = (
                <h2 className="text-base font-semibold text-gray-900">
                  Part {index + 1}. {part.prompt}
                </h2>
              );

              // Part 5 is the therapist's contact details plus the central
              // crisis list. It carries no client answer, so it renders as its
              // own block in the catalogue's own position — numbering stays the
              // approved order rather than skipping a number.
              if (part.type === 'instruction') {
                return (
                  <section key={part.id} className="rounded-xl border border-hairline bg-white p-5">
                    {heading}
                    <label className="mt-2 block text-sm text-gray-600" htmlFor="therapist-contact">
                      Your contact details for this client
                    </label>
                    <input
                      id="therapist-contact"
                      className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-violet focus:outline-none"
                      value={contact}
                      onChange={(event) => setContact(event.target.value)}
                      placeholder="How they reach you between sessions"
                    />

                    <p className="mt-4 text-sm font-medium text-gray-700">
                      Crisis lines (the same list as the app — not editable)
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-600">
                      {planQuery.data.helplines.map((line) => (
                        <li key={line.key}>
                          <span className="font-medium text-gray-800">{line.name}</span> —{' '}
                          {line.display}{' '}
                          <span className="text-gray-400">({line.description})</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              }

              return (
                <section key={part.id} className="rounded-xl border border-hairline bg-white p-5">
                  {heading}
                  {part.therapistPrompt && (
                    <p className="mt-1 text-sm text-gray-500">Ask: “{part.therapistPrompt}”</p>
                  )}
                  <textarea
                    className="mt-3 w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-violet focus:outline-none"
                    rows={part.id === 'one_reason' ? 2 : 4}
                    value={drafts[part.id] ?? ''}
                    placeholder="One per line"
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [part.id]: event.target.value }))
                    }
                  />
                  {part.columns.length > 0 && (
                    <p className="mt-1 text-xs text-gray-400">
                      One item per line
                      {part.columns.length > 1 ? ` — ${part.columns.join(', ')}` : ''}.
                    </p>
                  )}
                </section>
              );
            })}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={save.isPending}
                className="rounded-lg bg-royal-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {save.isPending ? 'Saving…' : planQuery.data.exists ? 'Save changes' : 'Save plan'}
              </button>
              {saved && <span className="text-sm text-sage-deep">{saved}</span>}
              {error && <span className="text-sm text-red-700">{error}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
