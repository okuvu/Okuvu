import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import websocketPlugin from '@fastify/websocket';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { handleSessionOpen, type SendFrame } from '../lib/session-handler.js';
import { closeSession } from '../lib/session-close.js';
import type { ServerFrame, UserTurnFrame, SessionCloseFrame, CloseReason } from '@okuvu/shared-types';
import { processTurn } from '../pipeline/orchestrator.js';
import { generateOnboardingOpening } from '../agents/a2/agent.js';
import { prisma } from '../lib/prisma.js';
import { setToolResult, clearToolResult } from '../lib/tool-result-store.js';
import { clearRetrievedContext } from '../lib/retrieved-context-cache.js';

const CAP_TURN_LIMIT = 10;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

interface IdleEntry {
  timer: ReturnType<typeof setTimeout>;
  sessionId: string;
}

interface ActiveSession {
  perceivedIntensity: number | null;
  createdAt: number;
  turnNumber?: number;
}

const idleTimers = new Map<string, IdleEntry>();
const activeSessions = new Map<string, ActiveSession>();

function clearIdleTimerByConnection(connId: string): void {
  const entry = idleTimers.get(connId);
  if (entry) {
    clearTimeout(entry.timer);
    idleTimers.delete(connId);
  }
}

function setIdleTimer(
  connId: string,
  sessionId: string,
  socket: WebSocket,
  uid: string,
  log: FastifyRequest['log'],
): void {
  clearIdleTimerByConnection(connId);

  const timer = setTimeout(async () => {
    idleTimers.delete(connId);
    const result = await closeSession(sessionId, uid, 'IDLE_TIMEOUT', log);
    if (!result.alreadyClosed) {
      activeSessions.delete(sessionId);
      clearToolResult(sessionId);
      clearRetrievedContext(sessionId);
      try {
        socket.send(JSON.stringify({
          type: 'SESSION_CLOSED',
          payload: {
            session_id: sessionId,
            reason: 'IDLE_TIMEOUT' satisfies CloseReason,
            session_ended_at: result.session_ended_at,
          },
        }));
      } catch {
        log.warn({ event: 'session_close', session_id: sessionId, outcome: 'idle_timer_send_failed' }, 'Failed to send SESSION_CLOSED for idle timeout');
      }
    }
  }, IDLE_TIMEOUT_MS);

  idleTimers.set(connId, { timer, sessionId });
}

export async function websocketRoute(app: FastifyInstance): Promise<void> {
  await app.register(websocketPlugin);

  app.get('/ws', {
    websocket: true,
    preHandler: [verifyFirebaseJWT],
  }, (socket: WebSocket, req: FastifyRequest) => {
    const connectionStart = Date.now();
    const { uid } = req.user;
    const connId = crypto.randomUUID();

    req.log.info({ event: 'ws_connect', user_id: uid, conn_id: connId }, 'WebSocket connected');

    const send = (frame: ServerFrame): void => {
      socket.send(JSON.stringify(frame));
    };

    let currentSessionId: string | null = null;

    socket.on('message', async (rawData: Buffer | string) => {
      const requestId = crypto.randomUUID();

      let parsed: { type: string; payload?: unknown };
      try {
        parsed = JSON.parse(typeof rawData === 'string' ? rawData : rawData.toString());
      } catch {
        send({
          type: 'ERROR',
          payload: { reason: 'INVALID_JSON' },
        });
        req.log.warn({ event: 'ws_frame', request_id: requestId, user_id: uid, outcome: 'parse_error' }, 'Malformed JSON');
        return;
      }

      if (parsed.type === 'SESSION_OPEN') {
        const payload = (parsed.payload ?? {}) as { session_id?: unknown };
        const sessionId = typeof payload.session_id === 'string' && payload.session_id.trim().length > 0
          ? payload.session_id.trim()
          : undefined;

                try {
          await handleSessionOpen({
            uid,
            requestId,
            log: req.log,
            send,
            sessionId,
            onSessionOpened: async (sessionId: string) => {
              currentSessionId = sessionId;
              activeSessions.set(sessionId, { perceivedIntensity: null, createdAt: Date.now() });

              try {
                const user = await prisma.user.findUnique({
                  where: { firebase_uid: uid },
                  select: {
                    id: true,
                    clinical_config: { select: { care_plan_id: true } },
                  },
                });
                if (user && user.clinical_config?.care_plan_id == null) {
                  const opening = await generateOnboardingOpening();
                  const turnId = crypto.randomUUID();
                  await prisma.turn.create({
                    data: {
                      id: turnId,
                      session_id: sessionId,
                      user_id: user.id,
                      turn_number: 0,
                      role: 'assistant',
                      content: opening,
                    },
                  }).catch((err: unknown) => {
                    req.log.warn({ event: 'onboarding_opening_persist', user_id: uid, err }, 'Failed to persist onboarding opening');
                  });
                  send({
                    type: 'AGENT_TURN',
                    payload: {
                      session_id: sessionId,
                      message: opening,
                      turn_count: 0,
                      turn_id: turnId,
                      tts_url: null,
                    },
                  });
                }
              } catch (err) {
                req.log.warn({ event: 'onboarding_opening', user_id: uid, err }, 'Failed to send onboarding opening message');
              }
            },
          });
        } catch (err) {
          req.log.error({ event: 'session_open', request_id: requestId, user_id: uid, err }, 'Unexpected error during session open');
          send({
            type: 'SESSION_OPEN_REJECTED',
            payload: { reason: 'INTERNAL_ERROR' },
          });
        }
        return;
      }

      if (parsed.type === 'USER_TURN') {
        const frame = parsed as UserTurnFrame;
        const { session_id, message } = frame.payload;

        if (!session_id || !message || typeof message !== 'string' || message.trim().length === 0) {
          send({
            type: 'ERROR',
            payload: { reason: 'INVALID_PAYLOAD' },
          });
          req.log.warn({ event: 'user_turn', request_id: requestId, user_id: uid, outcome: 'invalid_payload' }, 'Invalid USER_TURN payload');
          return;
        }

        req.log.info({ event: 'user_turn', request_id: requestId, user_id: uid, session_id, msg_len: message.length }, 'Processing USER_TURN');

        if (uid.startsWith('load-test-vu-')) {
          send({
            type: 'AGENT_TURN',
            payload: {
              session_id,
              message: 'Canned load-test response.',
              turn_count: 1,
              turn_id: crypto.randomUUID(),
              tts_url: null,
            },
          });
          return;
        }

        try {
          const activeSession = activeSessions.get(session_id);
          const perceivedIntensity = activeSession?.perceivedIntensity ?? null;
          const result = await processTurn(uid, session_id, message.trim(), perceivedIntensity);

          if (result.type === 'error') {
            send({
              type: 'ERROR',
              payload: { reason: 'TURN_FAILED' },
            });
            req.log.warn({ event: 'user_turn', request_id: requestId, user_id: uid, session_id, outcome: 'failed', error_code: result.errorCode }, 'Turn failed');
            return;
          }

          if (result.type === 'crisis') {
            send({
              type: 'CRISIS_SIGNAL',
              payload: { session_id },
            });
            req.log.info({ event: 'user_turn', request_id: requestId, user_id: uid, session_id, outcome: 'crisis' }, 'Crisis detected, sent CRISIS_SIGNAL');
            return;
          }

          if (result.type === 'agent_turn') {
            activeSessions.set(session_id, {
              perceivedIntensity: result.estimatedIntensity ?? null,
              createdAt: Date.now(),
              turnNumber: result.turnCount,
            });
          }

          send({
            type: 'AGENT_TURN',
            payload: {
              session_id,
              message: result.message,
              turn_count: result.turnCount,
              turn_id: result.turnId,
              tts_url: null,
              tool_card: result.toolCard,
            },
          });
          req.log.info({
            event: 'user_turn',
            request_id: requestId,
            user_id: uid,
            session_id,
            outcome: 'success',
            turn_count: result.turnCount,
            fallback_used: result.fallbackUsed,
            timing: result.timing,
          }, 'Turn completed');

          setIdleTimer(connId, session_id, socket, uid, req.log);

          if (result.turnCount >= CAP_TURN_LIMIT) {
            closeSession(session_id, req.user.uid, 'TURN_CAP', req.log).then((closeResult) => {
              if (!closeResult.alreadyClosed) {
                activeSessions.delete(session_id);
                clearToolResult(session_id);
                clearRetrievedContext(session_id);
                send({
                  type: 'SESSION_CLOSED',
                  payload: {
                    session_id,
                    reason: 'TURN_CAP',
                    session_ended_at: closeResult.session_ended_at!,
                  },
                });
                clearIdleTimerByConnection(connId);
              }
            });
          }
        } catch (err) {
          req.log.error({ event: 'user_turn', request_id: requestId, user_id: uid, session_id, err }, 'Unexpected error during turn');
          send({
            type: 'ERROR',
            payload: { reason: 'TURN_FAILED' },
          });
        }
        return;
      }

      if (parsed.type === 'SESSION_CLOSE') {
        const frame = parsed as SessionCloseFrame;

        if (!currentSessionId) {
          send({
            type: 'ERROR',
            payload: { reason: 'INVALID_PAYLOAD' },
          });
          req.log.warn({ event: 'session_close', request_id: requestId, user_id: uid, outcome: 'no_active_session' }, 'No active session to close');
          return;
        }

        const closeResult = await closeSession(currentSessionId, req.user.uid, 'USER_REQUESTED', req.log);

        if (closeResult.alreadyClosed) {
          req.log.info({ event: 'session_close', request_id: requestId, user_id: uid, session_id: currentSessionId, outcome: 'already_closed' }, 'Session already closed — no-op');
          return;
        }

        activeSessions.delete(currentSessionId);
        clearToolResult(currentSessionId);
        clearRetrievedContext(currentSessionId);

        send({
          type: 'SESSION_CLOSED',
          payload: {
            session_id: currentSessionId,
            reason: 'USER_REQUESTED',
            session_ended_at: closeResult.session_ended_at!,
          },
        });
        clearIdleTimerByConnection(connId);
        return;
      }

      if (parsed.type === 'TOOL_RESULT') {
        const pld = (parsed.payload ?? {}) as Record<string, unknown>;

        if (
          typeof pld.session_id !== 'string' ||
          pld.tool_type !== 'grounding_5431' ||
          typeof pld.result !== 'object' ||
          pld.result === null
        ) {
          send({
            type: 'ERROR',
            payload: { reason: 'INVALID_PAYLOAD' },
          });
          return;
        }

        const sessionId = pld.session_id;
        const activeSession = activeSessions.get(sessionId);
        const turnNumber = activeSession?.turnNumber;

        setToolResult(sessionId, {
          tool_type: pld.tool_type as string,
          result: pld.result as import('@okuvu/shared-types').GroundingResult,
          turn_number: turnNumber,
        });

        req.log.info({
          event: 'tool_result',
          session_id: sessionId,
          tool_type: pld.tool_type,
          turn_number: turnNumber,
        }, 'Tool result stored');
        return;
      }

      send({
        type: 'ERROR',
        payload: { reason: 'UNKNOWN_FRAME_TYPE' },
      });
      req.log.warn({ event: 'ws_frame', request_id: requestId, user_id: uid, frame_type: parsed.type }, 'Unknown frame type');
    });

    socket.on('close', () => {
      const durationMs = Date.now() - connectionStart;
      req.log.info({ event: 'ws_disconnect', user_id: uid, conn_id: connId, duration_ms: durationMs }, 'WebSocket disconnected');
      if (currentSessionId) {
        activeSessions.delete(currentSessionId);
        clearToolResult(currentSessionId);
      }
      clearIdleTimerByConnection(connId);
    });
  });
}
