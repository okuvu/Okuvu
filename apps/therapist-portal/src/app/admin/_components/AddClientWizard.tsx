'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';

const ISSUE_OPTIONS = ['Anxiety', 'Low mood', 'Stress', 'Sleep', 'Grief'];
const CARE_PLANS = [
  { id: 'CP1' as const, label: 'Anxiety & Worry' },
  { id: 'CP2' as const, label: 'Depression & Low Mood', suggested: true },
  { id: 'CP3' as const, label: 'Stress & Burnout' },
];

interface Therapist {
  id: string;
  email: string;
  name: string | null;
}

interface WizardState {
  therapistId: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  issues: string[];
  carePlanId: 'CP1' | 'CP2' | 'CP3' | '';
  welcomeNote: string;
  displayAbbreviation: string;
  abbreviationTouched: boolean;
  ageAttested: boolean;
}

const INITIAL_STATE: WizardState = {
  therapistId: '',
  fullName: '',
  phoneNumber: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  issues: [],
  carePlanId: '',
  welcomeNote: '',
  displayAbbreviation: '',
  abbreviationTouched: false,
  ageAttested: false,
};

function suggestedAbbreviation(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? `${first.charAt(0).toUpperCase()}.` : '';
}

// Therapist-portal wireframes C-01..C-06 — the 6-step Add-Client wizard.
// A second, additive path alongside the "Add client" section above (which
// stays for attaching an already-self-signed-up client) — this one
// creates a brand-new client and sends them an invite code.
export function AddClientWizard({ therapists }: { therapists: Therapist[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [result, setResult] = useState<{ inviteCode: string; emailSent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const utils = trpc.useUtils();
  const create = trpc.admin.createClientWithInvite.useMutation({
    onSuccess: (res) => {
      setResult({ inviteCode: res.inviteCode, emailSent: res.emailSent });
      setError(null);
      utils.admin.listTherapists.invalidate();
    },
    onError: (err) => setError(err.message || 'Could not create client.'),
  });

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function reset() {
    setState(INITIAL_STATE);
    setStep(1);
    setResult(null);
    setError(null);
    setCopied(false);
    setIsOpen(false);
  }

  function toggleIssue(issue: string) {
    setState((s) => ({
      ...s,
      issues: s.issues.includes(issue) ? s.issues.filter((i) => i !== issue) : [...s.issues, issue],
    }));
  }

  const canContinueStep1 = Boolean(state.therapistId && state.fullName.trim() && state.phoneNumber.trim() && state.email.trim());
  const canContinueStep3 = Boolean(state.carePlanId);
  const canSubmit = state.ageAttested && !create.isPending;

  if (!isOpen) {
    return (
      <section className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Invite a new client
            </h2>
            <p className="text-xs text-gray-500">
              Creates a brand-new client and sends them an invite code (email, and a code to share manually).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple transition-colors"
          >
            + New client
          </button>
        </div>
      </section>
    );
  }

  if (result) {
    return (
      <section className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Invite sent</h2>
        <div className="rounded-lg bg-sage-tint p-4 space-y-2">
          <p className="text-sm text-gray-700">
            {result.emailSent
              ? `An invite email was sent to ${state.email}.`
              : "Email wasn't sent (no email provider configured) — share the code below manually."}
          </p>
          <div className="flex items-center gap-2">
            <code className="rounded bg-oat-elevated px-3 py-1.5 text-lg font-bold tracking-widest text-royal-purple border border-hairline">
              {result.inviteCode}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(result.inviteCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="text-xs font-medium text-royal-purple hover:underline"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Valid for 7 days. The client enters this in the app via &ldquo;Have an invite code?&rdquo;
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Done
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Invite a new client</h2>
        <span className="text-xs text-gray-500">Step {step} of 6</span>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-danger-tint p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Client OTPs on either phone or email. Both must exist.</p>
          <div>
            <label htmlFor="wiz-therapist" className="mb-1 block text-xs font-medium text-gray-500">Assign to therapist</label>
            <select
              id="wiz-therapist"
              value={state.therapistId}
              onChange={(e) => update('therapistId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            >
              <option value="" disabled>Select a therapist</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{t.name ? `${t.name} (${t.email})` : t.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wiz-fullname" className="mb-1 block text-xs font-medium text-gray-500">Full name</label>
            <input
              id="wiz-fullname"
              type="text"
              value={state.fullName}
              onChange={(e) => {
                update('fullName', e.target.value);
                if (!state.abbreviationTouched) {
                  update('displayAbbreviation', suggestedAbbreviation(e.target.value));
                }
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            />
          </div>
          <div>
            <label htmlFor="wiz-phone" className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
            <input
              id="wiz-phone"
              type="tel"
              value={state.phoneNumber}
              onChange={(e) => update('phoneNumber', e.target.value)}
              placeholder="+91XXXXXXXXXX"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            />
          </div>
          <div>
            <label htmlFor="wiz-email" className="mb-1 block text-xs font-medium text-gray-500">Email</label>
            <input
              id="wiz-email"
              type="email"
              value={state.email}
              onChange={(e) => update('email', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">All optional — fill it now, later, or never.</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="wiz-dob" className="mb-1 block text-xs font-medium text-gray-500">Date of birth</label>
              <input
                id="wiz-dob"
                type="date"
                value={state.dateOfBirth}
                onChange={(e) => update('dateOfBirth', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="wiz-gender" className="mb-1 block text-xs font-medium text-gray-500">Gender</label>
              <input
                id="wiz-gender"
                type="text"
                value={state.gender}
                onChange={(e) => update('gender', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500" id="wiz-issues-label">Presenting issues</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="wiz-issues-label">
              {ISSUE_OPTIONS.map((issue) => (
                <button
                  key={issue}
                  type="button"
                  onClick={() => toggleIssue(issue)}
                  aria-pressed={state.issues.includes(issue)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    state.issues.includes(issue)
                      ? 'bg-violet text-white border-violet'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-violet'
                  }`}
                >
                  {issue}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">This steers the AI in chat &mdash; the client never sees it.</p>
          {CARE_PLANS.map((plan) => (
            <label
              key={plan.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                state.carePlanId === plan.id ? 'border-violet bg-sage-tint' : 'border-hairline hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="carePlan"
                checked={state.carePlanId === plan.id}
                onChange={() => update('carePlanId', plan.id)}
              />
              <span className="text-sm text-gray-900">{plan.label}</span>
              {plan.suggested && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-sage-deep">Suggested</span>
              )}
            </label>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">This is the emotional core &mdash; renders on the client&rsquo;s welcome screen.</p>
          <div>
            <label htmlFor="wiz-abbreviation" className="mb-1 block text-xs font-medium text-gray-500">
              What should we call them? (editable by the client later)
            </label>
            <input
              id="wiz-abbreviation"
              type="text"
              value={state.displayAbbreviation}
              onChange={(e) => {
                update('displayAbbreviation', e.target.value);
                update('abbreviationTouched', true);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            />
          </div>
          <div>
            <label htmlFor="wiz-welcome-note" className="mb-1 block text-xs font-medium text-gray-500">Welcome note (optional)</label>
            <textarea
              id="wiz-welcome-note"
              value={state.welcomeNote}
              onChange={(e) => update('welcomeNote', e.target.value)}
              rows={3}
              placeholder="Looking forward to working with you..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
            />
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Set up later, from the client&rsquo;s Tools tab once they&rsquo;ve activated — recommended, so you can
            tailor it to how the first sessions go.
          </p>
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            No tools or reminders assigned yet. You can add these from the client&rsquo;s Tools tab after they accept
            the invite.
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Review</p>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>✓ {state.fullName} &middot; {state.phoneNumber} &middot; {state.email}</li>
            <li>✓ Care plan: {CARE_PLANS.find((p) => p.id === state.carePlanId)?.label}</li>
          </ul>
          <label className="flex items-start gap-2 pt-2">
            <input
              type="checkbox"
              checked={state.ageAttested}
              onChange={(e) => update('ageAttested', e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-gray-600">I confirm this client is 18 years or older.</span>
          </label>
        </div>
      )}

      <div className="mt-5 flex justify-between">
        <button
          type="button"
          onClick={() => (step === 1 ? reset() : setStep(step - 1))}
          disabled={create.isPending}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        {step < 6 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={(step === 1 && !canContinueStep1) || (step === 3 && !canContinueStep3)}
            className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {step === 2 || step === 4 || step === 5 ? 'Skip for now' : 'Continue'}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              create.mutate({
                therapistId: state.therapistId,
                fullName: state.fullName.trim(),
                phoneNumber: state.phoneNumber.trim(),
                email: state.email.trim(),
                dateOfBirth: state.dateOfBirth || undefined,
                gender: state.gender.trim() || undefined,
                presentingIssues: state.issues,
                carePlanId: state.carePlanId as 'CP1' | 'CP2' | 'CP3',
                welcomeNote: state.welcomeNote.trim() || undefined,
                displayAbbreviation: state.displayAbbreviation.trim() || undefined,
              })
            }
            className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {create.isPending ? 'Sending invite...' : 'Add client & send invite'}
          </button>
        )}
      </div>
    </section>
  );
}
