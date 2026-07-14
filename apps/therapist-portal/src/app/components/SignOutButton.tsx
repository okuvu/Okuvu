'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/auth' })}
      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
    >
      Sign out
    </button>
  );
}
