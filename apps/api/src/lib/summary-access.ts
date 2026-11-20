import { prisma } from './prisma.js';

export type SummaryAccessOutcome =
  | { status: 'ok' }
  | { status: 'no_user' }
  | { status: 'no_relationship' };

/**
 * The client's own answer to "may this therapist read my session summaries".
 *
 * This is the ONLY writer of TherapistClient.summary_access_* . A therapist can
 * ask (portal clients.requestSummaryAccess) and can never answer: a
 * therapist-side attestation of consent is not consent, which is why the old
 * admin.assignClient flow no longer sets the flag.
 *
 * What a grant unlocks is summaries only — Worker 05's SessionSummary text
 * (themes, emotional state, homework progress, open loops). It never unlocks
 * the conversation: there is no transcript route in the portal at all.
 *
 * The 30-day read window is measured from the client's approval
 * (summary_access_granted_at), never from the therapist's ask, so an unanswered
 * request opens nothing. Revoking closes the window immediately and keeps the
 * timestamps, so the grant history survives.
 */
export async function setSummaryAccess(
  authSubject: string,
  therapistId: string,
  granted: boolean,
): Promise<SummaryAccessOutcome> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (!user) return { status: 'no_user' };

  const assignment = await prisma.therapistClient.findUnique({
    where: {
      therapist_id_client_user_id: {
        therapist_id: therapistId,
        client_user_id: user.id,
      },
    },
    select: { id: true },
  });

  if (!assignment) return { status: 'no_relationship' };

  await prisma.therapistClient.update({
    where: { id: assignment.id },
    data: granted
      ? {
          summary_access_granted: true,
          summary_access_requested_at: null,
          summary_access_granted_at: new Date(),
          summary_access_closed_at: null,
        }
      : {
          summary_access_granted: false,
          summary_access_requested_at: null,
          summary_access_closed_at: new Date(),
        },
  });

  return { status: 'ok' };
}
