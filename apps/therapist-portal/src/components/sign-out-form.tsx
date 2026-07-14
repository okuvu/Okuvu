'use client';

import { signOut } from 'next-auth/react';

export function SignOutForm() {
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-red-700"
    >
      Sign out
    </button>
  );
}
