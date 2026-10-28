'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { AddClientWizard } from './AddClientWizard';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminContent() {
  const [section, setSection] = useState<'clients' | 'therapists'>('clients');
  const amIAdmin = trpc.admin.amIAdmin.useQuery();
  const therapistsQuery = trpc.admin.listTherapists.useQuery(undefined, {
    enabled: amIAdmin.data?.isAdmin === true,
  });
  const pendingInvitesQuery = trpc.admin.listPendingInvites.useQuery(undefined, {
    enabled: amIAdmin.data?.isAdmin === true,
  });
  const utils = trpc.useUtils();
  const [resendMsg, setResendMsg] = useState<{ clientUserId: string; text: string } | null>(null);
  const resendInvite = trpc.admin.resendInvite.useMutation({
    onSuccess: (res, variables) => {
      setResendMsg({
        clientUserId: variables.clientUserId,
        text: res.emailSent ? `Resent — new code ${res.inviteCode}` : `New code (email not sent): ${res.inviteCode}`,
      });
      utils.admin.listPendingInvites.invalidate();
    },
  });

  const [therapistEmail, setTherapistEmail] = useState('');
  const [therapistName, setTherapistName] = useState('');
  const [addTherapistMsg, setAddTherapistMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [assignTherapistId, setAssignTherapistId] = useState('');
  const [assignPhone, setAssignPhone] = useState('');
  const [assignLanguageMode, setAssignLanguageMode] = useState('');
  const [assignChatAccessGranted, setAssignChatAccessGranted] = useState(false);
  const [assignMsg, setAssignMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const addTherapist = trpc.admin.addTherapist.useMutation({
    onSuccess: async (result) => {
      setAddTherapistMsg({ kind: 'ok', text: `Added ${result.email} as a therapist.` });
      setTherapistEmail('');
      setTherapistName('');
      await therapistsQuery.refetch();
    },
    onError: (err) => {
      setAddTherapistMsg({ kind: 'err', text: err.message || 'Could not add therapist.' });
    },
  });

  const assignClient = trpc.admin.assignClient.useMutation({
    onSuccess: async (result) => {
      setAssignMsg(
        result.wasAlreadyAssigned
          ? {
              kind: 'ok',
              text: `Client was already assigned to ${result.therapistEmail} — consent/language preference unchanged.`,
            }
          : { kind: 'ok', text: `Assigned client to ${result.therapistEmail}.` },
      );
      setAssignPhone('');
      setAssignLanguageMode('');
      setAssignChatAccessGranted(false);
      await therapistsQuery.refetch();
    },
    onError: (err) => {
      setAssignMsg({ kind: 'err', text: err.message || 'Could not assign client.' });
    },
  });

  if (amIAdmin.isLoading) {
    return (
      <main className="p-4 md:p-8" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <div className="mx-auto max-w-3xl animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-gray-200" />
          <div className="h-40 rounded-xl bg-gray-200" />
        </div>
      </main>
    );
  }

  if (!amIAdmin.data?.isAdmin) {
    return (
      <main className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-danger bg-danger-tint px-6 py-12 text-center">
            <p role="alert" className="text-sm font-medium text-danger">
              This page is restricted to OKUVU admins.
            </p>
            <p className="mt-1 text-xs text-danger">
              If you believe you should have access, ask an existing admin to add your email to ADMIN_EMAILS.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
        <p className="mt-1 text-gray-500">Onboard therapists and assign clients to their caseload.</p>
      </header>

      <div className="mx-auto max-w-3xl">
        <div className="mb-4 inline-flex rounded-lg border border-hairline bg-oat-elevated p-1">
          <button
            type="button"
            onClick={() => setSection('clients')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              section === 'clients' ? 'bg-violet text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Clients
          </button>
          <button
            type="button"
            onClick={() => setSection('therapists')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              section === 'therapists' ? 'bg-violet text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Therapists
          </button>
        </div>
      </div>

      {section === 'therapists' && (
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Add therapist */}
        <section className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
            Add a therapist
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAddTherapistMsg(null);
              addTherapist.mutate({
                email: therapistEmail.trim(),
                name: therapistName.trim() || undefined,
              });
            }}
            className="flex flex-col gap-3 md:flex-row md:items-end"
          >
            <div className="flex-1">
              <label htmlFor="therapist-email" className="mb-1 block text-xs font-medium text-gray-500">
                Sign-in email
              </label>
              <input
                id="therapist-email"
                type="email"
                required
                value={therapistEmail}
                onChange={(e) => setTherapistEmail(e.target.value)}
                placeholder="therapist@example.com"
                disabled={addTherapist.isPending}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="therapist-name" className="mb-1 block text-xs font-medium text-gray-500">
                Name (optional)
              </label>
              <input
                id="therapist-name"
                type="text"
                value={therapistName}
                onChange={(e) => setTherapistName(e.target.value)}
                placeholder="Dr. Jane Doe"
                disabled={addTherapist.isPending}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={addTherapist.isPending || !therapistEmail.trim()}
              className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {addTherapist.isPending ? 'Adding...' : 'Add therapist'}
            </button>
          </form>
          {addTherapistMsg && (
            <p
              role={addTherapistMsg.kind === 'err' ? 'alert' : 'status'}
              aria-live={addTherapistMsg.kind === 'err' ? 'assertive' : 'polite'}
              className={`mt-3 rounded-lg p-3 text-sm ${
                addTherapistMsg.kind === 'err' ? 'bg-danger-tint text-danger' : 'bg-sage-tint text-sage-deep'
              }`}
            >
              {addTherapistMsg.text}
            </p>
          )}
        </section>
      </div>
      )}

      {section === 'clients' && (
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Invite a new client — wireframes C-01..C-06 */}
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">
            New client &mdash; hasn&rsquo;t used the OKUVU app yet
          </p>
          <AddClientWizard therapists={therapistsQuery.data ?? []} />
        </div>

        {/* Pending invites — wireframes C-07 "Resend" */}
        {pendingInvitesQuery.data && pendingInvitesQuery.data.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-hairline bg-oat-elevated shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Pending invites</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {pendingInvitesQuery.data.map((p) => (
                <li key={`${p.therapistId}-${p.clientUserId}`} className="flex items-center justify-between px-6 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.clientLabel}</p>
                    <p className="text-xs text-gray-500">
                      {p.clientEmail} &middot; assigned to {p.therapistLabel} &middot; invited {formatDate(p.invitedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={resendInvite.isPending}
                    onClick={() => resendInvite.mutate({ clientUserId: p.clientUserId, therapistId: p.therapistId })}
                    className="text-sm font-medium text-royal-purple hover:underline disabled:opacity-60"
                  >
                    Resend
                  </button>
                </li>
              ))}
            </ul>
            {resendMsg && (
              <p role="status" className="px-6 py-3 text-xs text-sage-deep bg-sage-tint">
                {resendMsg.text}
              </p>
            )}
          </section>
        )}

        {/* Add client (existing self-signed-up client) */}
        <section className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Add client
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Client already has the app &mdash; assigns an existing client (signed up via the app)
            to a therapist, and optionally records consent + language preference at the same time.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAssignMsg(null);
              assignClient.mutate({
                therapistId: assignTherapistId,
                clientPhoneNumber: assignPhone.trim(),
                chatAccessGranted: assignChatAccessGranted,
                languageMode: assignLanguageMode ? (assignLanguageMode as 'english' | 'mirror') : undefined,
              });
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <label htmlFor="assign-therapist" className="mb-1 block text-xs font-medium text-gray-500">
                  Therapist
                </label>
                <select
                  id="assign-therapist"
                  required
                  value={assignTherapistId}
                  onChange={(e) => setAssignTherapistId(e.target.value)}
                  disabled={assignClient.isPending}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
                >
                  <option value="" disabled>
                    Select a therapist
                  </option>
                  {(therapistsQuery.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ? `${t.name} (${t.email})` : t.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="assign-phone" className="mb-1 block text-xs font-medium text-gray-500">
                  Client phone number
                </label>
                <input
                  id="assign-phone"
                  type="tel"
                  required
                  value={assignPhone}
                  onChange={(e) => setAssignPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  disabled={assignClient.isPending}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="assign-language" className="mb-1 block text-xs font-medium text-gray-500">
                  Language preference (optional)
                </label>
                <select
                  id="assign-language"
                  value={assignLanguageMode}
                  onChange={(e) => setAssignLanguageMode(e.target.value)}
                  disabled={assignClient.isPending}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
                >
                  <option value="">Not set (client decides)</option>
                  <option value="english">English</option>
                  <option value="mirror">Mirror (Hinglish)</option>
                </select>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <input
                id="assign-consent"
                type="checkbox"
                checked={assignChatAccessGranted}
                onChange={(e) => setAssignChatAccessGranted(e.target.checked)}
                disabled={assignClient.isPending}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-royal-purple focus:ring-violet disabled:opacity-60"
              />
              <label htmlFor="assign-consent" className="text-xs text-gray-600">
                Client has given permission for their therapist to view raw chat content
              </label>
            </div>

            <div>
              <button
                type="submit"
                disabled={assignClient.isPending || !assignTherapistId || !assignPhone.trim()}
                className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assignClient.isPending ? 'Adding...' : 'Add client'}
              </button>
            </div>
          </form>
          {assignMsg && (
            <p
              role={assignMsg.kind === 'err' ? 'alert' : 'status'}
              aria-live={assignMsg.kind === 'err' ? 'assertive' : 'polite'}
              className={`mt-3 rounded-lg p-3 text-sm ${
                assignMsg.kind === 'err' ? 'bg-danger-tint text-danger' : 'bg-sage-tint text-sage-deep'
              }`}
            >
              {assignMsg.text}
            </p>
          )}
        </section>
      </div>
      )}

      {section === 'therapists' && (
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Therapist roster */}
        <section className="overflow-hidden rounded-xl border border-hairline bg-oat-elevated shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Therapists</h2>
          </div>
          {therapistsQuery.isLoading ? (
            <div className="space-y-0" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">Loading therapists…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse border-b border-gray-100 bg-gray-50 px-6" />
              ))}
            </div>
          ) : therapistsQuery.isError ? (
            <p role="alert" className="px-6 py-8 text-sm text-danger">
              Could not load therapists. Please refresh and try again.
            </p>
          ) : therapistsQuery.data && therapistsQuery.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Therapists, their client count, and the date each was added.</caption>
                <thead>
                  <tr className="border-b border-gray-100">
                    <th scope="col" className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Therapist</th>
                    <th scope="col" className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Clients</th>
                    <th scope="col" className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {therapistsQuery.data.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-6 py-3.5 text-sm">
                        <div className="font-medium text-gray-900">{t.name ?? t.email}</div>
                        {t.name && <div className="text-xs text-gray-500">{t.email}</div>}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-700">{t.clientCount}</td>
                      <td className="px-6 py-3.5 text-sm text-gray-500">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-base italic text-gray-500">No therapists yet.</p>
              <p className="mt-1 text-sm text-gray-500">Add one above to get started.</p>
            </div>
          )}
        </section>
      </div>
      )}
    </main>
  );
}
