'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminContent() {
  const amIAdmin = trpc.admin.amIAdmin.useQuery();
  const therapistsQuery = trpc.admin.listTherapists.useQuery(undefined, {
    enabled: amIAdmin.data?.isAdmin === true,
  });

  const [therapistEmail, setTherapistEmail] = useState('');
  const [therapistName, setTherapistName] = useState('');
  const [addTherapistMsg, setAddTherapistMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [assignTherapistId, setAssignTherapistId] = useState('');
  const [assignPhone, setAssignPhone] = useState('');
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
      setAssignMsg({ kind: 'ok', text: `Assigned client to ${result.therapistEmail}.` });
      setAssignPhone('');
      await therapistsQuery.refetch();
    },
    onError: (err) => {
      setAssignMsg({ kind: 'err', text: err.message || 'Could not assign client.' });
    },
  });

  if (amIAdmin.isLoading) {
    return (
      <main className="p-4 md:p-8">
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
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
            <p role="alert" className="text-sm font-medium text-red-800">
              This page is restricted to Evia admins.
            </p>
            <p className="mt-1 text-xs text-red-600">
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

      <div className="mx-auto max-w-3xl space-y-4">
        {/* Add therapist */}
        <section className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
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
                Google account email
              </label>
              <input
                id="therapist-email"
                type="email"
                required
                value={therapistEmail}
                onChange={(e) => setTherapistEmail(e.target.value)}
                placeholder="therapist@example.com"
                disabled={addTherapist.isPending}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#1A6B5A] focus:ring-1 focus:ring-[#1A6B5A] disabled:opacity-60"
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
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#1A6B5A] focus:ring-1 focus:ring-[#1A6B5A] disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={addTherapist.isPending || !therapistEmail.trim()}
              className="rounded-lg bg-[#1A6B5A] px-4 py-2 text-sm font-medium text-white hover:bg-[#005243] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {addTherapist.isPending ? 'Adding...' : 'Add therapist'}
            </button>
          </form>
          {addTherapistMsg && (
            <p
              role={addTherapistMsg.kind === 'err' ? 'alert' : 'status'}
              aria-live={addTherapistMsg.kind === 'err' ? 'assertive' : 'polite'}
              className={`mt-3 rounded-lg p-3 text-sm ${
                addTherapistMsg.kind === 'err' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
              }`}
            >
              {addTherapistMsg.text}
            </p>
          )}
        </section>

        {/* Assign client */}
        <section className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
            Assign a client
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAssignMsg(null);
              assignClient.mutate({
                therapistId: assignTherapistId,
                clientPhoneNumber: assignPhone.trim(),
              });
            }}
            className="flex flex-col gap-3 md:flex-row md:items-end"
          >
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
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#1A6B5A] focus:ring-1 focus:ring-[#1A6B5A] disabled:opacity-60"
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
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#1A6B5A] focus:ring-1 focus:ring-[#1A6B5A] disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={assignClient.isPending || !assignTherapistId || !assignPhone.trim()}
              className="rounded-lg bg-[#1A6B5A] px-4 py-2 text-sm font-medium text-white hover:bg-[#005243] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {assignClient.isPending ? 'Assigning...' : 'Assign'}
            </button>
          </form>
          {assignMsg && (
            <p
              role={assignMsg.kind === 'err' ? 'alert' : 'status'}
              aria-live={assignMsg.kind === 'err' ? 'assertive' : 'polite'}
              className={`mt-3 rounded-lg p-3 text-sm ${
                assignMsg.kind === 'err' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
              }`}
            >
              {assignMsg.text}
            </p>
          )}
        </section>

        {/* Therapist roster */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Therapists</h2>
          </div>
          {therapistsQuery.isLoading ? (
            <div className="space-y-0">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse border-b border-gray-100 bg-gray-50 px-6" />
              ))}
            </div>
          ) : therapistsQuery.isError ? (
            <p role="alert" className="px-6 py-8 text-sm text-red-600">
              Could not load therapists. Please refresh and try again.
            </p>
          ) : therapistsQuery.data && therapistsQuery.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Therapist</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Clients</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Added</th>
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
              <p className="mt-1 text-sm text-gray-400">Add one above to get started.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
