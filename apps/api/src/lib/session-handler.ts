import type { ServerFrame } from '@evia/shared-types';
import { prisma } from './prisma.js';
import {
  getISTDateString,
  getDailyLimit,
  tryAcquireSessionSlot,
} from './session-limits.js';

export type SendFrame = (frame: ServerFrame) => void;
export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export interface SessionOpenContext {
  uid: string;
  requestId: string;
  log: {
    info: LogFn;
    warn: LogFn;
    error: LogFn;
  };
  send: SendFrame;
  onSessionOpened?: (sessionId: string) => void;
}

export async function handleSessionOpen(ctx: SessionOpenContext): Promise<void> {
  const { uid, requestId, log, send } = ctx;

  const user = await prisma.user.findUnique({
    where: { firebase_uid: uid },
    select: {
      id: true,
      clinical_config: { select: { care_plan_id: true } },
    },
  });

  if (!user) {
    send({
      type: 'SESSION_OPEN_REJECTED',
      payload: { reason: 'USER_NOT_FOUND' },
    });
    log.warn({ event: 'session_open', request_id: requestId, user_id: uid, outcome: 'user_not_found' }, 'User not found');
    return;
  }

  // safety_state is evaluated once at the start of this handler;
  // subsequent safety-state changes do not affect this request.
  const safetyState = await prisma.safetyState.findUnique({
    where: { user_id: user.id },
    select: { safety_state_current: true },
  });

  const isCrisis = safetyState?.safety_state_current === 'S4';
  const dateIst = getISTDateString();
  // CP3 → TL (2/day), all others (CP1/CP2/unassigned) → SD (1/day)
  const tier: 'SD' | 'TL' = user.clinical_config?.care_plan_id === 'CP3' ? 'TL' : 'SD';
  const dailyLimit = getDailyLimit(tier);

  if (isCrisis) {
    const sessionLog = await prisma.$transaction(async (tx) => {
      return tx.sessionLog.create({
        data: {
          user_id: user.id,
          session_started_at: new Date(),
        },
      });
    });

    send({
      type: 'SESSION_OPEN_CONFIRMED',
      payload: {
        session_id: sessionLog.id,
        session_started_at: sessionLog.session_started_at.toISOString(),
        crisis_bypass: true,
      },
    });
    ctx.onSessionOpened?.(sessionLog.id);
    log.info({ event: 'session_open', request_id: requestId, user_id: user.id, outcome: 'crisis_bypass' }, 'Crisis bypass session opened');
    return;
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const result = await tryAcquireSessionSlot(tx, user.id, tier, dateIst, dailyLimit);

    if (!result.allowed) {
      return { allowed: false as const, sessions_used: result.sessions_used };
    }

    const sessionLog = await tx.sessionLog.create({
      data: {
        user_id: user.id,
        session_started_at: new Date(),
      },
    });

    return {
      allowed: true as const,
      session_id: sessionLog.id,
      session_started_at: sessionLog.session_started_at.toISOString(),
      sessions_used: result.sessions_used,
    };
  });

  if (txResult.allowed) {
    send({
      type: 'SESSION_OPEN_CONFIRMED',
      payload: {
        session_id: txResult.session_id,
        session_started_at: txResult.session_started_at,
        crisis_bypass: false,
      },
    });
    ctx.onSessionOpened?.(txResult.session_id);
    log.info({ event: 'session_open', request_id: requestId, user_id: user.id, outcome: 'allowed', sessions_used: txResult.sessions_used }, 'Session opened');
  } else {
    send({
      type: 'SESSION_OPEN_REJECTED',
      payload: {
        reason: 'DAILY_LIMIT_EXCEEDED',
        retry_after: dateIst,
      },
    });
    log.info({ event: 'session_open', request_id: requestId, user_id: user.id, outcome: 'rate_limited', sessions_used: txResult.sessions_used }, 'Rate limit exceeded');
  }
}
