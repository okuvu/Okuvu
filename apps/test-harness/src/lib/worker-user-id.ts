import { prisma } from './prisma';

/**
 * Map the runner's identity to the id the worker's database writes need.
 *
 * The harness carries two identities for one simulated client:
 *   - `uid`  — the auth subject (`test-user-runner-<ts>-<rand>`), which is
 *              what apps/api's `closeSession` and the harness's own lookups key on;
 *   - `User.id` — a uuid, the foreign key every clinical row points at.
 *
 * `POST /tasks/summary` writes `SessionSummary.user_id` and reads
 * `UserMemory.user_id`, both of which are `User.id`. apps/api's `closeSession`
 * resolves subject → id before enqueuing; the harness calls the worker over
 * HTTP instead, so it has to resolve at every call site. Passing the subject
 * produced `SessionSummary_user_id_fkey` violations (HTTP 500) on every
 * deployed session close, which made every campaign conversation INCOMPLETE.
 *
 * Returns the input unchanged when no user row exists yet, so the failure
 * surfaces as the worker's own error rather than a silent no-op.
 */
export async function resolveDbUserId(uid: string): Promise<string> {
  if (!prisma) return uid;
  const user = await prisma.user.findUnique({ where: { auth_subject: uid }, select: { id: true } });
  return user?.id ?? uid;
}
