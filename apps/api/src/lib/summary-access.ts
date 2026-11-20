import { sessionSummaryVisible, summaryAccessWindow } from '@okuvu/shared-types';
import { prisma } from './prisma.js';

export { sessionSummaryVisible };

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

/**
 * The client's per-session answer, layered under the relationship switch.
 *
 * The rule itself lives in @okuvu/shared-types (`sessionSummaryVisible`) so
 * the app, this api and the portal all read one copy — see the comment there
 * for the three states and which one wins.
 */

export interface SessionSharingRow {
  sessionId: string;
  startedAt: string;
  status: string;
  shared: boolean;
}

export type SessionSharingList =
  | {
      status: 'ok';
      therapistName: string | null;
      /** Null when the relationship switch is off — nothing is shared then. */
      expiresAt: string | null;
      sessions: SessionSharingRow[];
    }
  | { status: 'no_user' };

export type SessionShareOutcome =
  | { status: 'ok'; shared: boolean }
  | { status: 'no_user' }
  | { status: 'not_found' };

/**
 * GET /users/me/sessions/sharing — the sessions the client can decide about.
 *
 * Lists session start times and whether each one is currently visible to the
 * therapist. Deliberately carries no summary text: the client is not shown
 * their own summary here (product decision — the summary is the therapist's
 * read of the session, and the client already has the conversation).
 */
export async function listSessionSharing(authSubject: string): Promise<SessionSharingList> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (!user) return { status: 'no_user' };

  const relationship = await prisma.therapistClient.findFirst({
    where: { client_user_id: user.id, ended_at: null },
    orderBy: { created_at: 'desc' },
    select: {
      summary_access_granted_at: true,
      summary_access_closed_at: true,
      therapist: { select: { name: true } },
    },
  });

  const window = summaryAccessWindow(relationship);

  const summaries = await prisma.sessionSummary.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
    take: 60,
    select: {
      session_id: true,
      status: true,
      share_with_therapist: true,
      session: { select: { session_started_at: true } },
    },
  });

  return {
    status: 'ok',
    therapistName: relationship?.therapist.name ?? null,
    expiresAt: window?.expiresAt.toISOString() ?? null,
    sessions: summaries.map((summary) => ({
      sessionId: summary.session_id,
      startedAt: summary.session.session_started_at.toISOString(),
      status: summary.status,
      shared: sessionSummaryVisible(summary, relationship),
    })),
  };
}

/**
 * PATCH /users/me/sessions/:sessionId/summary-share — the only writer of
 * SessionSummary.share_with_therapist. There is no therapist-side or
 * operator-side path to this column.
 */
export async function setSessionSummaryShare(
  authSubject: string,
  sessionId: string,
  shared: boolean,
): Promise<SessionShareOutcome> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (!user) return { status: 'no_user' };

  const summary = await prisma.sessionSummary.findUnique({
    where: { user_id_session_id: { user_id: user.id, session_id: sessionId } },
    select: { id: true },
  });

  if (!summary) return { status: 'not_found' };

  await prisma.sessionSummary.update({
    where: { id: summary.id },
    // An explicit answer in either direction: `true` records "yes, this one",
    // `false` records a withhold. Neither is a reset back to null — a client
    // who turns a session back on has made a decision, and the row should
    // remember which way.
    data: { share_with_therapist: shared },
  });

  return { status: 'ok', shared };
}
