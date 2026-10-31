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

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function relativeDays(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

type Section = 'overview' | 'therapists' | 'clients' | 'mapping' | 'progress' | 'money';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Today' },
  { id: 'therapists', label: 'Therapists' },
  { id: 'clients', label: 'Clients' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'progress', label: 'Progress' },
  { id: 'money', label: 'Money' },
];

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

function CardHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border-b border-hairline px-6 py-4">
      <h2 className="text-lg font-semibold text-charcoal-ink">{title}</h2>
      {hint && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">{hint}</p>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-6 py-3.5 text-sm text-charcoal-ink ${className}`}>{children}</td>;
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-base italic text-ink-soft">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-oat-elevated p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-charcoal-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

function StateChip({ state }: { state: 'active' | 'invited' | 'ended' | 'unassigned' }) {
  const styles: Record<string, string> = {
    active: 'bg-sage-tint text-sage-deep',
    invited: 'bg-honey-tint text-honey-deep',
    ended: 'bg-gray-100 text-gray-600',
    unassigned: 'bg-danger-tint text-danger',
  };
  const labels: Record<string, string> = {
    active: 'Active',
    invited: 'Invited',
    ended: 'Ended',
    unassigned: 'No therapist',
  };
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}

export function AdminContent() {
  const [section, setSection] = useState<Section>('overview');
  const [clientSearch, setClientSearch] = useState('');

  const amIAdmin = trpc.admin.amIAdmin.useQuery();
  const isAdmin = amIAdmin.data?.isAdmin === true;

  const therapistsQuery = trpc.admin.listTherapists.useQuery(undefined, { enabled: isAdmin });
  const pendingInvitesQuery = trpc.admin.listPendingInvites.useQuery(undefined, { enabled: isAdmin });
  const overviewQuery = trpc.admin.overview.useQuery(undefined, {
    enabled: isAdmin && section === 'overview',
  });
  const clientsQuery = trpc.admin.listClients.useQuery(
    { search: clientSearch.trim() || undefined },
    { enabled: isAdmin && section === 'clients' },
  );
  const assignmentsQuery = trpc.admin.listAssignments.useQuery(undefined, {
    enabled: isAdmin && section === 'mapping',
  });
  const progressQuery = trpc.admin.listProgress.useQuery(undefined, {
    enabled: isAdmin && section === 'progress',
  });
  const paymentsQuery = trpc.admin.paymentsStatus.useQuery(undefined, {
    enabled: isAdmin && section === 'money',
  });
  const waitlistQuery = trpc.admin.listWaitlist.useQuery(undefined, {
    enabled: isAdmin && section === 'money',
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
        <div className="mx-auto max-w-5xl animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-gray-200" />
          <div className="h-40 rounded-xl bg-gray-200" />
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-danger bg-danger-tint px-6 py-12 text-center">
            <p role="alert" className="text-sm font-medium text-danger">
              This page is restricted to OKUVU admins.
            </p>
            <p className="mt-1 text-xs text-danger">
              If you believe you should have access, ask an existing admin to add your email to
              ADMIN_EMAILS.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-charcoal-ink">Okuvu admin</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Therapists, who they are holding, how the week is going, and what is (not yet) being charged.
          </p>
        </header>

        <nav
          className="mb-6 flex flex-wrap gap-1 rounded-lg border border-hairline bg-oat-elevated p-1"
          aria-label="Admin sections"
        >
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => setSection(item.id)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                section === item.id ? 'bg-violet text-white' : 'text-ink-soft hover:text-charcoal-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* ── Today ─────────────────────────────────────────────────── */}
        {section === 'overview' && (
          <div className="space-y-4">
            {overviewQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
                ))}
              </div>
            ) : overviewQuery.data ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat
                    label="Therapists"
                    value={overviewQuery.data.therapistCount}
                    hint="Registered sign-in emails"
                  />
                  <Stat
                    label="Clients"
                    value={overviewQuery.data.clientCount}
                    hint={`${overviewQuery.data.activeAssignments} active · ${overviewQuery.data.pendingAssignments} invited`}
                  />
                  <Stat
                    label="Appointments this week"
                    value={overviewQuery.data.upcomingAppointments}
                    hint={`${overviewQuery.data.heldAppointments} held to date`}
                  />
                  <Stat
                    label="Conversations (7 days)"
                    value={overviewQuery.data.conversationsWeek}
                    hint={`${overviewQuery.data.crisisFlaggedWeek} flagged for safety review`}
                  />
                  <Stat
                    label="Mood check-ins (7 days)"
                    value={overviewQuery.data.moodCheckinsWeek}
                    hint="One tap a day per client"
                  />
                  <Stat
                    label="Waitlist"
                    value={overviewQuery.data.waitlistCount}
                    hint={
                      overviewQuery.data.lastConversationAt
                        ? `Last activity ${relativeDays(overviewQuery.data.lastConversationAt)}`
                        : 'No conversations yet'
                    }
                  />
                </div>
                {overviewQuery.data.crisisFlaggedWeek > 0 && (
                  <div className="rounded-xl border border-honey bg-honey-tint px-6 py-4">
                    <p className="text-sm font-medium text-honey-deep">
                      {overviewQuery.data.crisisFlaggedWeek} conversation
                      {overviewQuery.data.crisisFlaggedWeek === 1 ? '' : 's'} in the last 7 days carried a
                      crisis-safety flag.
                    </p>
                    <p className="mt-1 text-xs text-honey-deep/80">
                      A prompt to check the clinical side, not a report: the console deliberately cannot
                      show what was said.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <Card>
                <Empty title="Could not load the overview." hint="Refresh and try again." />
              </Card>
            )}
          </div>
        )}

        {/* ── Therapists ────────────────────────────────────────────── */}
        {section === 'therapists' && (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Add a therapist"
                hint="Their personal email. This is the address they sign in with — Google or password, whichever this deployment offers. There is no therapist signup; this table is the allowlist."
              />
              <div className="p-6">
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
                    <label htmlFor="therapist-email" className="mb-1 block text-xs font-medium text-ink-soft">
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
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="therapist-name" className="mb-1 block text-xs font-medium text-ink-soft">
                      Name (optional)
                    </label>
                    <input
                      id="therapist-name"
                      type="text"
                      value={therapistName}
                      onChange={(e) => setTherapistName(e.target.value)}
                      placeholder="Dr. Jane Doe"
                      disabled={addTherapist.isPending}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={addTherapist.isPending || !therapistEmail.trim()}
                    className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-royal-purple disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {addTherapist.isPending ? 'Adding…' : 'Add therapist'}
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
              </div>
            </Card>

            <Card>
              <CardHeader title="Therapists" />
              {therapistsQuery.isLoading ? (
                <div role="status" aria-live="polite" aria-busy="true">
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
                    <caption className="sr-only">
                      Therapists, their client count, and the date each was added.
                    </caption>
                    <thead>
                      <tr className="border-b border-gray-100">
                        <Th>Therapist</Th>
                        <Th>Clients</Th>
                        <Th>Added</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {therapistsQuery.data.map((t) => (
                        <tr key={t.id} className="border-b border-gray-100 last:border-b-0">
                          <Td>
                            <div className="font-medium">{t.name ?? t.email}</div>
                            {t.name && <div className="text-xs text-ink-soft">{t.email}</div>}
                          </Td>
                          <Td>{t.clientCount}</Td>
                          <Td className="text-ink-soft">{formatDate(t.createdAt)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No therapists yet." hint="Add one above to get started." />
              )}
            </Card>
          </div>
        )}

        {/* ── Clients ───────────────────────────────────────────────── */}
        {section === 'clients' && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-soft">
                New client &mdash; hasn&rsquo;t used the OKUVU app yet
              </p>
              <AddClientWizard therapists={therapistsQuery.data ?? []} />
            </div>

            {pendingInvitesQuery.data && pendingInvitesQuery.data.length > 0 && (
              <Card>
                <CardHeader title="Pending invites" />
                <ul className="divide-y divide-gray-100">
                  {pendingInvitesQuery.data.map((p) => (
                    <li
                      key={`${p.therapistId}-${p.clientUserId}`}
                      className="flex items-center justify-between px-6 py-3.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-charcoal-ink">{p.clientLabel}</p>
                        <p className="text-xs text-ink-soft">
                          {p.clientEmail} &middot; assigned to {p.therapistLabel} &middot; invited{' '}
                          {formatDate(p.invitedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={resendInvite.isPending}
                        onClick={() =>
                          resendInvite.mutate({ clientUserId: p.clientUserId, therapistId: p.therapistId })
                        }
                        className="text-sm font-medium text-royal-purple hover:underline disabled:opacity-60"
                      >
                        Resend
                      </button>
                    </li>
                  ))}
                </ul>
                {resendMsg && (
                  <p role="status" className="bg-sage-tint px-6 py-3 text-xs text-sage-deep">
                    {resendMsg.text}
                  </p>
                )}
              </Card>
            )}

            <Card>
              <CardHeader
                title="Add client"
                hint="Client already has the app — assigns an existing client (signed up via the app) to a therapist, and optionally records consent + language preference at the same time."
              />
              <div className="p-6">
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
                      <label htmlFor="assign-therapist" className="mb-1 block text-xs font-medium text-ink-soft">
                        Therapist
                      </label>
                      <select
                        id="assign-therapist"
                        required
                        value={assignTherapistId}
                        onChange={(e) => setAssignTherapistId(e.target.value)}
                        disabled={assignClient.isPending}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
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
                      <label htmlFor="assign-phone" className="mb-1 block text-xs font-medium text-ink-soft">
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
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="assign-language" className="mb-1 block text-xs font-medium text-ink-soft">
                        Language preference (optional)
                      </label>
                      <select
                        id="assign-language"
                        value={assignLanguageMode}
                        onChange={(e) => setAssignLanguageMode(e.target.value)}
                        disabled={assignClient.isPending}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
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
                    <label htmlFor="assign-consent" className="text-xs text-ink-soft">
                      Client has given permission for their therapist to view raw chat content
                    </label>
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={assignClient.isPending || !assignTherapistId || !assignPhone.trim()}
                      className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-royal-purple disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {assignClient.isPending ? 'Adding…' : 'Add client'}
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
              </div>
            </Card>

            <Card>
              <CardHeader title="Clients" hint="Everyone with an account, and who is holding them." />
              <div className="border-b border-hairline px-6 py-3">
                <label htmlFor="client-search" className="sr-only">
                  Search clients
                </label>
                <input
                  id="client-search"
                  type="search"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search by name, email or phone"
                  className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet"
                />
              </div>
              {clientsQuery.isLoading ? (
                <div role="status" aria-busy="true" className="px-6 py-8 text-sm text-ink-soft">
                  Loading clients…
                </div>
              ) : clientsQuery.isError ? (
                <p role="alert" className="px-6 py-8 text-sm text-danger">
                  Could not load clients. Nothing is being hidden — the query failed. Refresh to retry.
                </p>
              ) : clientsQuery.data && clientsQuery.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <Th>Client</Th>
                        <Th>Therapist</Th>
                        <Th>Status</Th>
                        <Th>Care plan</Th>
                        <Th>Joined</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientsQuery.data.map((c) => (
                        <tr key={c.id} className="border-b border-gray-100 last:border-b-0">
                          <Td>
                            <div className="font-medium">{c.name ?? c.phoneMasked}</div>
                            <div className="text-xs text-ink-soft">{c.email ?? c.phoneMasked}</div>
                          </Td>
                          <Td>
                            {c.therapists.length === 0 ? (
                              <span className="text-xs text-ink-soft">—</span>
                            ) : (
                              c.therapists.map((t) => (
                                <div key={t.id} className="text-xs">
                                  {t.label}
                                  <span className="ml-1 text-ink-soft">
                                    ({t.activated ? 'active' : 'invited'}
                                    {t.chatAccess ? ', chat access' : ''})
                                  </span>
                                </div>
                              ))
                            )}
                          </Td>
                          <Td>
                            <StateChip state={c.therapyState} />
                          </Td>
                          <Td className="text-xs text-ink-soft">{c.carePlan ?? '—'}</Td>
                          <Td className="text-xs text-ink-soft">{formatDate(c.joinedAt)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title={clientSearch ? 'No client matches that search.' : 'No clients yet.'}
                  hint={
                    clientSearch
                      ? undefined
                      : 'Add one above, or invite them from a therapist’s caseload.'
                  }
                />
              )}
            </Card>
          </div>
        )}

        {/* ── Mapping ───────────────────────────────────────────────── */}
        {section === 'mapping' && (
          <Card>
            <CardHeader
              title="Therapist ↔ client"
              hint="One row per pairing, including ended ones. A client can end up with two active therapists — this is the view that makes that visible."
            />
            {assignmentsQuery.isLoading ? (
              <div role="status" aria-busy="true" className="px-6 py-8 text-sm text-ink-soft">
                Loading mappings…
              </div>
            ) : assignmentsQuery.isError ? (
              <p role="alert" className="px-6 py-8 text-sm text-danger">
                Could not load mappings. Refresh to retry.
              </p>
            ) : assignmentsQuery.data && assignmentsQuery.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <Th>Therapist</Th>
                      <Th>Client</Th>
                      <Th>State</Th>
                      <Th>Chat access</Th>
                      <Th>Created</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentsQuery.data.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                        <Td>{row.therapistLabel}</Td>
                        <Td>
                          <div>{row.clientLabel}</div>
                          <div className="text-xs text-ink-soft">{row.clientEmail ?? '—'}</div>
                        </Td>
                        <Td>
                          <StateChip state={row.state} />
                        </Td>
                        <Td className="text-xs text-ink-soft">{row.chatAccess ? 'granted' : 'not granted'}</Td>
                        <Td className="text-xs text-ink-soft">{formatDate(row.createdAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No mappings yet." hint="Assign a client to a therapist to create one." />
            )}
          </Card>
        )}

        {/* ── Progress ──────────────────────────────────────────────── */}
        {section === 'progress' && (
          <Card>
            <CardHeader
              title="How the week is going"
              hint="Engagement, not content: turns, mood check-ins and appointments. The console never shows what a client wrote — that belongs to the therapist, and only with consent."
            />
            {progressQuery.isLoading ? (
              <div role="status" aria-busy="true" className="px-6 py-8 text-sm text-ink-soft">
                Loading progress…
              </div>
            ) : progressQuery.isError ? (
              <p role="alert" className="px-6 py-8 text-sm text-danger">
                Could not load progress. Refresh to retry.
              </p>
            ) : progressQuery.data && progressQuery.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <Th>Client</Th>
                      <Th>Last activity</Th>
                      <Th>Turns (week / total)</Th>
                      <Th>Mood check-ins</Th>
                      <Th>Appointments</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {progressQuery.data.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 last:border-b-0">
                        <Td>
                          <div className="font-medium">{p.name ?? p.phoneMasked}</div>
                          <div className="text-xs text-ink-soft">{p.email ?? '—'}</div>
                        </Td>
                        <Td className="text-xs text-ink-soft">{relativeDays(p.lastActivityAt)}</Td>
                        <Td>
                          <span className="font-medium">{p.turnsThisWeek}</span>
                          <span className="text-xs text-ink-soft"> / {p.totalTurns}</span>
                        </Td>
                        <Td>
                          <span className="font-medium">{p.moodCheckins}</span>
                          <span className="text-xs text-ink-soft">
                            {p.lastMoodDate ? ` · last ${formatDateTime(p.lastMoodDate)}` : ''}
                          </span>
                        </Td>
                        <Td>{p.appointments}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No client activity yet." />
            )}
          </Card>
        )}

        {/* ── Money ─────────────────────────────────────────────────── */}
        {section === 'money' && (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Payments" hint="Pay-in from clients, pay-out to therapists." />
              <div className="p-6">
                {paymentsQuery.isLoading ? (
                  <p className="text-sm text-ink-soft">Loading…</p>
                ) : paymentsQuery.isError ? (
                  <p role="alert" className="text-sm text-danger">
                    Could not read the payments state. Do not read an empty panel as "no money owed" —
                    refresh to retry.
                  </p>
                ) : paymentsQuery.data?.enabled === false ? (
                  <div className="rounded-xl border border-honey bg-honey-tint px-5 py-4">
                    <p className="text-sm font-medium text-honey-deep">
                      Payments are not enabled in this build.
                    </p>
                    <p className="mt-2 max-w-2xl text-xs leading-relaxed text-honey-deep/85">
                      {paymentsQuery.data.reason}
                    </p>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wider text-honey-deep/70">
                          Appointments held to date
                        </dt>
                        <dd className="text-lg font-semibold text-honey-deep">
                          {paymentsQuery.data.heldAppointments}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wider text-honey-deep/70">
                          Appointments upcoming
                        </dt>
                        <dd className="text-lg font-semibold text-honey-deep">
                          {paymentsQuery.data.upcomingAppointments}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-4 text-xs leading-relaxed text-honey-deep/70">
                      These are counts, not amounts. Nothing here should be read as revenue, an invoice or a
                      therapist settlement — those tables do not exist yet.
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader title="Waitlist" hint="People who asked for a place from the landing page." />
              {waitlistQuery.isLoading ? (
                <div role="status" aria-busy="true" className="px-6 py-8 text-sm text-ink-soft">
                  Loading waitlist…
                </div>
              ) : waitlistQuery.isError ? (
                <p role="alert" className="px-6 py-8 text-sm text-danger">
                  Could not load the waitlist. Refresh to retry.
                </p>
              ) : waitlistQuery.data && waitlistQuery.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <Th>Email</Th>
                        <Th>Phone</Th>
                        <Th>Added</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitlistQuery.data.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                          <Td>{row.email}</Td>
                          <Td className="text-xs text-ink-soft">{row.phone ?? '—'}</Td>
                          <Td className="text-xs text-ink-soft">{formatDate(row.createdAt)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Nobody on the waitlist yet." />
              )}
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
