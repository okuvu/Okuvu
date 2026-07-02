import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import websocketPlugin from '@fastify/websocket';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { handleSessionOpen, type SendFrame } from '../lib/session-handler.js';
import { closeSession } from '../lib/session-close.js';
import type { ServerFrame, UserTurnFrame, SessionCloseFrame, CloseReason } from '@evia/shared-types';
import { processTurn } from '../pipeline/orchestrator.js';

const CAP_TURN_LIMIT = 10;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

interface IdleEntry {
  timer: ReturnType<typeof setTimeout>;
  sessionId: string;
}

const idleTimers = new Map<string, IdleEntry>();

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
    const result = await closeSession(sessionId, 'IDLE_TIMEOUT', log);
    if (!result.alreadyClosed) {
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
            onSessionOpened: (sessionId: string) => {
              currentSessionId = sessionId;
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

        try {
          const result = await processTurn(uid, session_id, message.trim());

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

          send({
            type: 'AGENT_TURN',
            payload: {
              session_id,
              message: result.message,
              turn_count: result.turnCount,
              turn_id: result.turnId,
              tts_url: null,
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
            closeSession(session_id, 'TURN_CAP', req.log).then((closeResult) => {
              if (!closeResult.alreadyClosed) {
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

        const closeResult = await closeSession(currentSessionId, 'USER_REQUESTED', req.log);

        if (closeResult.alreadyClosed) {
          req.log.info({ event: 'session_close', request_id: requestId, user_id: uid, session_id: currentSessionId, outcome: 'already_closed' }, 'Session already closed — no-op');
          return;
        }

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

      send({
        type: 'ERROR',
        payload: { reason: 'UNKNOWN_FRAME_TYPE' },
      });
      req.log.warn({ event: 'ws_frame', request_id: requestId, user_id: uid, frame_type: parsed.type }, 'Unknown frame type');
    });

    socket.on('close', () => {
      const durationMs = Date.now() - connectionStart;
      req.log.info({ event: 'ws_disconnect', user_id: uid, conn_id: connId, duration_ms: durationMs }, 'WebSocket disconnected');
      clearIdleTimerByConnection(connId);
    });
  });
}
