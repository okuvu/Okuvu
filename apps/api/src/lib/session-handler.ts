import type { ServerFrame } from '@okuvu/shared-types';
import { prisma } from './prisma.js';

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
  sessionId?: string;
  onSessionOpened?: (sessionId: string) => void;
}
export async function handleSessionOpen(ctx: SessionOpenContext): Promise<void> {
  const {
    uid,
    requestId,
    log,
    send,
    sessionId,
    onSessionOpened,
  } = ctx;

  const user = await prisma.user.findUnique({
    where: { firebase_uid: uid },
    select: { id: true },
  });

  if (!user) {
    send({
      type: 'SESSION_OPEN_REJECTED',
      payload: { reason: 'USER_NOT_FOUND' },
    });
    log.warn({ event: 'session_open', request_id: requestId, user_id: uid, outcome: 'user_not_found' }, 'User not found');
    return;
  }

  if (sessionId) {
    const existingSession = await prisma.sessionLog.findFirst({
      where: { id: sessionId, user_id: user.id },
      select: { id: true, session_started_at: true },
    });

    if (existingSession) {
      const latestUserTurn = await prisma.turn.findFirst({
        where: { session_id: existingSession.id, role: 'user' },
        orderBy: [{ turn_number: 'desc' }, { created_at: 'desc' }],
        select: { id: true, turn_number: true },
      });

      const matchingAssistantTurn = latestUserTurn
        ? await prisma.turn.findFirst({
            where: {
              session_id: existingSession.id,
              role: 'assistant',
              turn_number: latestUserTurn.turn_number,
            },
            orderBy: [{ created_at: 'asc' }],
            select: { id: true, content: true, turn_number: true },
          })
        : null;

      if (matchingAssistantTurn) {
        send({
          type: 'SESSION_OPEN_CONFIRMED',
          payload: {
            session_id: existingSession.id,
            session_started_at: existingSession.session_started_at.toISOString(),
            crisis_bypass: false,
          },
        });
        send({
          type: 'AGENT_TURN',
          payload: {
            session_id: existingSession.id,
            message: matchingAssistantTurn.content,
            turn_count: matchingAssistantTurn.turn_number,
            turn_id: matchingAssistantTurn.id,
            tts_url: null,
          },
        });
        onSessionOpened?.(existingSession.id);
        log.info(
          {
            event: 'session_reconnect',
            request_id: requestId,
            user_id: user.id,
            session_id: existingSession.id,
            outcome: 'replayed_agent_turn',
          },
          'Reconnect replayed the assistant response for the latest user turn',
        );
        return;
      }

      send({
        type: 'SESSION_OPEN_CONFIRMED',
        payload: {
          session_id: existingSession.id,
          session_started_at: existingSession.session_started_at.toISOString(),
          crisis_bypass: false,
        },
      });
      onSessionOpened?.(existingSession.id);
      log.info(
        {
          event: 'session_reconnect',
          request_id: requestId,
          user_id: user.id,
          session_id: existingSession.id,
          outcome: latestUserTurn ? 'case_a' : 'reconnected',
        },
        latestUserTurn ? 'Reconnect detected Case A; awaiting USER_TURN' : 'Reconnected to existing session',
      );
      return;
    }
  }

  // safety_state is evaluated once at the start of this handler;
  // subsequent safety-state changes do not affect this request.
  const safetyState = await prisma.safetyState.findUnique({
    where: { user_id: user.id },
    select: { safety_state_current: true },
  });

  // OKUVU v2.0: continuous chat has no daily session limit — crisis_bypass
  // is kept purely as informational client-facing context (still worth
  // knowing this session opened during S4), not a bypass of any gate.
  const isCrisis = safetyState?.safety_state_current === 'S4';

  const sessionLog = await prisma.sessionLog.create({
    data: {
      user_id: user.id,
      session_started_at: new Date(),
    },
  });

  send({
    type: 'SESSION_OPEN_CONFIRMED',
    payload: {
      session_id: sessionLog.id,
      session_started_at: sessionLog.session_started_at.toISOString(),
      crisis_bypass: isCrisis,
    },
  });
  onSessionOpened?.(sessionLog.id);
  log.info(
    { event: 'session_open', request_id: requestId, user_id: user.id, outcome: isCrisis ? 'crisis_bypass' : 'allowed' },
    isCrisis ? 'Crisis bypass session opened' : 'Session opened',
  );
}
