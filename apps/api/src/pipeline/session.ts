import { prisma } from '../lib/prisma.js';

export async function isSessionClosed(sessionId: string): Promise<boolean> {
  const session = await prisma.sessionLog.findUnique({
    where: { id: sessionId },
    select: { session_ended_at: true },
  });
  if (!session) return true;
  return session.session_ended_at !== null;
}

export async function getSessionCount(userId: string): Promise<number> {
  return prisma.sessionLog.count({
    where: { user_id: userId, session_ended_at: { not: null } },
  });
}

export async function incrementTurnCount(sessionId: string): Promise<number> {
  const updated = await prisma.sessionLog.update({
    where: { id: sessionId },
    data: { turn_count: { increment: 1 } },
  });
  return updated.turn_count;
}
