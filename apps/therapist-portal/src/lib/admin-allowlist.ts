/**
 * The admin allowlist, in one place.
 *
 * Before this file the rule lived twice: `server/routers/admin.ts` decided
 * whether a caller was an admin, and `lib/auth.ts` had no idea admins
 * existed at all — sign-in only ever admitted an email that already had a
 * Therapist row. That made the operator account (admin@okuvu.in) impossible
 * to use: it is deliberately *not* a therapist, so it could never get past
 * the sign-in callback to reach the page that gates on ADMIN_EMAILS.
 *
 * Both call sites now read the same answer from here. Promotion and demotion
 * are still an env-var change on purpose (see docs/audit/
 * evia-therapist-portal-audit.md §8 "Role model") — there is no role column
 * to get wrong.
 */
export function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && getAdminEmails().has(email.toLowerCase()));
}
