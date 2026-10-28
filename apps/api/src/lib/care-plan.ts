import { prisma } from './prisma.js';
import type { CarePlanId, AssignmentState } from '@okuvu/shared-types';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export interface CarePlanBody {
  care_plan_id: CarePlanId;
  assignment_state: AssignmentState;
  confidence_at_last_eval: number;
  turns_evaluated: number;
  reasoning_note: string;
}

export type UpdateCarePlanResult =
  | { status: 'ok'; carePlanId: CarePlanId; assignmentState: AssignmentState }
  | { status: 'user_not_found' }
  | { status: 'forbidden' }
  | { status: 'stale_turns_evaluated'; current: number };

export async function updateCarePlan(
  authSubject: string,
  targetUserId: string,
  body: CarePlanBody,
  log?: { info: LogFn },
): Promise<UpdateCarePlanResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  if (user.id !== targetUserId) {
    return { status: 'forbidden' };
  }

  const existing = await prisma.clinicalConfig.findUnique({
    where: { user_id: user.id },
    select: { turns_evaluated: true, assignment_state: true },
  });

  if (existing && body.turns_evaluated < existing.turns_evaluated) {
    return { status: 'stale_turns_evaluated', current: existing.turns_evaluated };
  }

  const result = await prisma.clinicalConfig.upsert({
    where: { user_id: user.id },
    create: {
      user_id: user.id,
      care_plan_id: body.care_plan_id,
      assignment_state: body.assignment_state,
      confidence_at_last_eval: body.confidence_at_last_eval,
      turns_evaluated: body.turns_evaluated,
      reasoning_note: body.reasoning_note,
    },
    update: {
      care_plan_id: body.care_plan_id,
      assignment_state: body.assignment_state,
      confidence_at_last_eval: body.confidence_at_last_eval,
      turns_evaluated: body.turns_evaluated,
      reasoning_note: body.reasoning_note,
    },
  });

  if (log && existing && existing.assignment_state !== body.assignment_state) {
    log.info(
      {
        event: 'assignment_state_transition',
        user_id: user.id,
        from: existing.assignment_state,
        to: body.assignment_state,
      },
      `Assignment state changed from ${existing.assignment_state} to ${body.assignment_state}`,
    );
  }

  return {
    status: 'ok',
    carePlanId: result.care_plan_id,
    assignmentState: result.assignment_state,
  };
}
