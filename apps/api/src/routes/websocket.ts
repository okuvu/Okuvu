import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import websocketPlugin from '@fastify/websocket';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { handleSessionOpen, type SendFrame } from '../lib/session-handler.js';

export async function websocketRoute(app: FastifyInstance): Promise<void> {
  await app.register(websocketPlugin);

  app.get('/ws', {
    websocket: true,
    preHandler: [verifyFirebaseJWT],
  }, (socket: WebSocket, req: FastifyRequest) => {
    const connectionStart = Date.now();
    const { uid } = req.user;

    req.log.info({ event: 'ws_connect', user_id: uid }, 'WebSocket connected');

    const send: SendFrame = (frame) => {
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
        req.log.warn({ event: 'session_open', request_id: requestId, user_id: uid, outcome: 'parse_error' }, 'Malformed JSON');
        return;
      }

      if (parsed.type !== 'SESSION_OPEN') {
        send({
          type: 'ERROR',
          payload: { reason: 'UNKNOWN_FRAME_TYPE' },
        });
        req.log.warn({ event: 'frame_error', request_id: requestId, user_id: uid, frame_type: parsed.type }, 'Unknown frame type');
        return;
      }

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
    });

    socket.on('close', () => {
      const durationMs = Date.now() - connectionStart;
      req.log.info({ event: 'ws_disconnect', user_id: uid, duration_ms: durationMs }, 'WebSocket disconnected');
    });
  });
}
