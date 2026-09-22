import { prisma } from './prisma.js';

export interface ActiveHomework {
  id: string;
  description: string;
}

// Single source of truth for "a client's current active homework
// assignment." Previously reimplemented independently in lib/agent-context.ts
// and (necessarily, since apps/worker can't import from apps/api/src/lib)
// apps/worker/src/lib/summary.ts — see the cross-reference comment there.
// If what counts as "active" ever changes, that worker copy needs the same
// change made by hand.
export async function getActiveHomework(clientUserId: string): Promise<ActiveHomework | null> {
  const row = await prisma.homework.findFirst({
    where: { client_user_id: clientUserId, status: 'active' },
    orderBy: { assigned_at: 'desc' },
    select: { id: true, description: true },
  });

  return row ?? null;
}

export type CompleteHomeworkResult =
  | { status: 'ok'; homeworkStatus: string }
  | { status: 'not_found' };

export async function completeHomework(
  clientUserId: string,
  homeworkId: string,
): Promise<CompleteHomeworkResult> {
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { client_user_id: true },
  });

  if (!homework || homework.client_user_id !== clientUserId) {
    return { status: 'not_found' };
  }

  const updated = await prisma.homework.update({
    where: { id: homeworkId },
    data: { status: 'completed' },
  });

  return { status: 'ok', homeworkStatus: updated.status };
}
