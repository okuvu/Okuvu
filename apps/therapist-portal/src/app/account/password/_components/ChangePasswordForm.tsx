'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/trpc/client';

/**
 * Three fields, one round trip, and the outcome stated in words.
 *
 * The current password is required because the server proves it to Cognito
 * before it is allowed to write — this form is the UI for that check, not a
 * second implementation of it. Policy is mirrored locally only so a short or
 * un-symboled password is refused before the network call; Cognito remains the
 * authority and its refusals are rendered verbatim enough to act on.
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const change = trpc.account.changePassword.useMutation({
    onSuccess: (result) => {
      if (result.ok) {
        setDone(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        return;
      }
      setError(result.message);
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }
    change.mutate({ currentPassword, newPassword });
  }

  if (done) {
    return (
      <section className="mt-8 rounded-xl border border-hairline bg-oat-elevated p-6">
        <h2 className="text-lg font-semibold text-charcoal-ink">Password changed</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Use the new password the next time you sign in. Your current session stays valid.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-lg bg-royal-night px-4 py-2 text-sm font-medium text-lavender-tint"
        >
          Back to the portal
        </Link>
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-8 rounded-xl border border-hairline bg-oat-elevated p-6"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <label className="block text-sm font-medium text-charcoal-ink" htmlFor="current-password">
        Current password
      </label>
      <input
        id="current-password"
        type="password"
        autoComplete="current-password"
        required
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-charcoal-ink"
      />

      <label className="mt-5 block text-sm font-medium text-charcoal-ink" htmlFor="new-password">
        New password
      </label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        required
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-charcoal-ink"
      />
      <p className="mt-1.5 text-xs text-ink-soft">
        At least 14 characters, with upper and lower case, a number and a symbol. A password you
        have used here before is refused.
      </p>

      <label className="mt-5 block text-sm font-medium text-charcoal-ink" htmlFor="confirm-password">
        Confirm new password
      </label>
      <input
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-charcoal-ink"
      />

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-hairline bg-danger-tint px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={change.isPending}
        className="mt-6 w-full rounded-lg bg-royal-night px-4 py-2.5 text-sm font-semibold text-lavender-tint disabled:opacity-60"
      >
        {change.isPending ? 'Changing…' : 'Change password'}
      </button>

      <p className="mt-4 text-xs text-ink-soft">
        Signed in with Google and never set a password? Ask the administrator to set one for this
        address first.
      </p>
    </form>
  );
}
