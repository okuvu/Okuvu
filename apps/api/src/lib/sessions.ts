import { prisma } from './prisma.js';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export type SubmitSrsResult =
  | { status: 'ok' }
  | { status: 'user_not_found' }
  | { status: 'session_not_found' }
  | { status: 'forbidden' }
  | { status: 'session_still_active' };

export async function submitSrsScore(
  authSubject: string,
  sessionId: string,
  srsScore: number,
  log?: { info: LogFn },
): Promise<SubmitSrsResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  const session = await prisma.sessionLog.findUnique({
    where: { id: sessionId },
    select: { user_id: true, session_ended_at: true },
  });

  if (!session) {
    return { status: 'session_not_found' };
  }

  if (session.user_id !== user.id) {
    return { status: 'forbidden' };
  }

  if (!session.session_ended_at) {
    return { status: 'session_still_active' };
  }

  await prisma.sessionLog.update({
    where: { id: sessionId },
    data: { session_feedback_score: srsScore },
  });

  if (log) {
    log.info(
      {
        event: 'srs_submitted',
        session_id: sessionId,
        srs_score: srsScore,
        submitted_at: new Date().toISOString(),
      },
      'SRS score submitted',
    );
  }

  return { status: 'ok' };
}
