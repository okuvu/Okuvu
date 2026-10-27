import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export type DeleteAccountResult =
  | { status: 'ok'; userId: string }
  | { status: 'user_not_found' }
  | { status: 'already_deleted' }
  | { status: 'active_session' };

export async function deleteAccount(
  authSubject: string,
  log?: { info: LogFn },
): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true, deleted_at: true },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  if (user.deleted_at) {
    return { status: 'already_deleted' };
  }

  const activeSession = await prisma.sessionLog.findFirst({
    where: { user_id: user.id, session_ended_at: null },
    select: { id: true },
  });

  if (activeSession) {
    return { status: 'active_session' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.emergencyContact.deleteMany({ where: { user_id: user.id } });
    await tx.engagementProfile.deleteMany({ where: { user_id: user.id } });
    await tx.clinicalConfig.deleteMany({ where: { user_id: user.id } });
    await tx.safetyState.deleteMany({ where: { user_id: user.id } });
    await tx.turn.deleteMany({ where: { user_id: user.id } });
    await tx.sessionSummary.deleteMany({ where: { user_id: user.id } });
    await tx.moodLog.deleteMany({ where: { user_id: user.id } });
    await tx.sessionLog.deleteMany({ where: { user_id: user.id } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        phone_number: '',
        auth_subject: `deleted-${randomUUID()}`,
        deleted_at: new Date(),
      },
    });
  });

  if (log) {
    log.info({ event: 'account_deleted', user_id: user.id }, 'Account deleted');
  }

  return { status: 'ok', userId: user.id };
}
