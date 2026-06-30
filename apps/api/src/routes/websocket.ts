import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import websocketPlugin from '@fastify/websocket';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { handleSessionOpen, type SendFrame } from '../lib/session-handler.js';
import type { ServerFrame, UserTurnFrame } from '@evia/shared-types';
import { processTurn } from '../pipeline/orchestrator.js';

export async function websocketRoute(app: FastifyInstance): Promise<void> {
  await app.register(websocketPlugin);

  app.get('/ws', {
    websocket: true,
    preHandler: [verifyFirebaseJWT],
  }, (socket: WebSocket, req: FastifyRequest) => {
    const connectionStart = Date.now();
    const { uid } = req.user;

    req.log.info({ event: 'ws_connect', user_id: uid }, 'WebSocket connected');

    const send = (frame: ServerFrame): void => {
      socket.send(JSON.stringify(frame));
    };

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
        try {
          await handleSessionOpen({
            uid,
            requestId,
            log: req.log,
            send,
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
        } catch (err) {
          req.log.error({ event: 'user_turn', request_id: requestId, user_id: uid, session_id, err }, 'Unexpected error during turn');
          send({
            type: 'ERROR',
            payload: { reason: 'TURN_FAILED' },
          });
        }
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
      req.log.info({ event: 'ws_disconnect', user_id: uid, duration_ms: durationMs }, 'WebSocket disconnected');
    });
  });
}
