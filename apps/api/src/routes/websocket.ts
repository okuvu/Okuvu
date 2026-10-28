import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import websocketPlugin from '@fastify/websocket';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { handleSessionOpen, type SendFrame } from '../lib/session-handler.js';
import { closeSession } from '../lib/session-close.js';
import type { ServerFrame, UserTurnFrame, SessionCloseFrame, CloseReason } from '@okuvu/shared-types';
import { processTurn } from '../pipeline/orchestrator.js';
import { BUDGET_PAUSED_RESPONSE } from '../pipeline/fallbacks.js';
import { setToolResult, clearToolResult } from '../lib/tool-result-store.js';
import { clearRetrievedContext } from '../lib/retrieved-context-cache.js';
import { checkRateLimit } from '../lib/rate-limit.js';
import {
  admitTurn,
  microUsdToUsd,
  readBudgetCounters,
  toBudgetNotice,
  withUsageMetering,
} from '../lib/token-budget.js';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_GROUNDING_ITEMS = 10;
export const MAX_GROUNDING_ITEM_LENGTH = 200;
// Each USER_TURN triggers a real LLM call (apps/api/src/pipeline/orchestrator.ts)
// — the single most expensive thing this service does per request, and the
// one @fastify/rate-limit (app.ts) never sees, since it only hooks the HTTP
// request lifecycle, not messages sent over an already-open WebSocket.
// Generous for real usage (a therapy chat exchange), tight enough to bound
// a single account's worst-case LLM spend from a runaway/malicious client.
export const MAX_TURNS_PER_WINDOW = 20;
export const TURN_WINDOW_SECONDS = 60;

export function isValidGroundingResult(value: unknown): value is import('@okuvu/shared-types').GroundingResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  const fields = ['see', 'touch', 'hear', 'smell', 'taste'] as const;
  return fields.every((f) => {
    const arr = r[f];
    return (
      Array.isArray(arr) &&
      arr.length <= MAX_GROUNDING_ITEMS &&
      arr.every((item) => typeof item === 'string' && item.length <= MAX_GROUNDING_ITEM_LENGTH)
    );
  });
}

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
    preHandler: [verifyCognitoJWT],
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
            // OKUVU v2.0: no self-serve/auto-scored onboarding opening — care
            // plan assignment is therapist-driven, not an automatic scored
            // message sequence. See docs/okuvu-v2.0/00-README-v2.0.md.
            onSessionOpened: async (sessionId: string) => {
              currentSessionId = sessionId;
              activeSessions.set(sessionId, { perceivedIntensity: null, createdAt: Date.now() });
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
        const { message } = frame.payload;

        // The session_id is never taken from the client payload for
        // authorization — currentSessionId is only ever set by
        // handleSessionOpen after it has verified the session belongs to
        // this uid (fresh session, or a { id, user_id } scoped reconnect
        // lookup). Trusting a client-supplied session_id here would let any
        // signed-in user inject turns into, and read context from, a
        // session they don't own simply by knowing/guessing its UUID.
        if (!currentSessionId) {
          send({
            type: 'ERROR',
            payload: { reason: 'INVALID_PAYLOAD' },
          });
          req.log.warn({ event: 'user_turn', request_id: requestId, user_id: uid, outcome: 'no_active_session' }, 'USER_TURN with no active session');
          return;
        }

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
          send({
            type: 'ERROR',
            payload: { reason: 'INVALID_PAYLOAD' },
          });
          req.log.warn({ event: 'user_turn', request_id: requestId, user_id: uid, outcome: 'invalid_payload' }, 'Invalid USER_TURN payload');
          return;
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
          send({
            type: 'ERROR',
            payload: { reason: 'INVALID_PAYLOAD' },
          });
          req.log.warn({ event: 'user_turn', request_id: requestId, user_id: uid, outcome: 'message_too_long', msg_len: message.length }, 'USER_TURN message exceeds max length');
          return;
        }

        const session_id = currentSessionId;

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

        const withinTurnLimit = await checkRateLimit(`ws_turn:${uid}`, MAX_TURNS_PER_WINDOW, TURN_WINDOW_SECONDS);
        if (!withinTurnLimit) {
          send({
            type: 'ERROR',
            payload: { reason: 'RATE_LIMITED' },
          });
          req.log.warn({ event: 'user_turn', request_id: requestId, user_id: uid, session_id, outcome: 'rate_limited' }, 'USER_TURN rate limit exceeded');
          return;
        }

        // E17-S6 — the cost gate. The rate limit above bounds request *volume*;
        // this bounds *spend*, which is a different failure: 20 turns a minute
        // of long conversation is still an unbounded bill. Checked before any
        // model call, so a refused turn costs nothing and cannot half-run.
        //
        // A check that throws is not a budget refusal — it is an accounting
        // fault, and the module already absorbs Redis being down. Logging it
        // loudly and serving the turn (rather than silently dropping a therapy
        // message on a bug in the meter) is the only failure this gate allows,
        // and it is bounded by the rate limit that ran above.
        let admission: Awaited<ReturnType<typeof admitTurn>> | null = null;
        try {
          admission = await admitTurn({ userId: uid, sessionId: session_id, message: message.trim() });
        } catch (err) {
          req.log.error({ event: 'budget_check', request_id: requestId, user_id: uid, session_id, err }, 'Budget check failed — serving the turn unmetered');
        }

        if (admission?.action === 'refuse') {
          const notice = toBudgetNotice(admission.budget, BUDGET_PAUSED_RESPONSE);
          // Carried on AGENT_TURN, not on an ERROR frame: the deployed client
          // renders AGENT_TURN.message as an assistant message and drops ERROR
          // frames silently (apps/mobile/lib/src/core/websocket_service.dart),
          // so an ERROR-only refusal would show the user *nothing*. The
          // structured code travels in `budget` for any client that wants it.
          send({
            type: 'AGENT_TURN',
            payload: {
              session_id,
              message: BUDGET_PAUSED_RESPONSE,
              turn_count: activeSessions.get(session_id)?.turnNumber ?? 0,
              turn_id: null,
              tts_url: null,
              budget: notice,
            },
          });
          req.log.warn({
            event: 'user_turn',
            request_id: requestId,
            user_id: uid,
            session_id,
            outcome: 'budget_exceeded',
            code: notice.code,
            status: notice.status,
            used_session_tokens: notice.used.session_tokens,
            used_daily_cost_usd: notice.used.daily_cost_usd,
            retry_after_seconds: notice.retry_after_seconds,
          }, 'USER_TURN refused: budget exhausted');
          return;
        }

        if (admission?.action === 'crisis_bypass') {
          // Over budget, but this message carries explicit crisis language.
          // Admitting it is the one thing that outranks a cost ceiling.
          req.log.warn({
            event: 'budget_bypass',
            request_id: requestId,
            user_id: uid,
            session_id,
            reason: admission.reason,
            code: admission.budget.code,
          }, 'Turn over budget but crisis language detected — admitting the turn');
        }

        try {
          const activeSession = activeSessions.get(session_id);
          const perceivedIntensity = activeSession?.perceivedIntensity ?? null;
          // E17-S6: every Converse call this turn makes (A1, A9-pre, A2,
          // A9-post) records its own `usage` into this context; the measured
          // total is persisted to the session and day counters afterwards.
          const { result, usage } = await withUsageMetering(
            { userId: uid, sessionId: session_id },
            () => processTurn(uid, session_id, message.trim(), perceivedIntensity),
          );

          if (usage.calls > 0) {
            const { counters, store } = await readBudgetCounters(uid, session_id);
            req.log.info({
              event: 'budget_usage',
              request_id: requestId,
              user_id: uid,
              session_id,
              model_calls: usage.calls,
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              total_tokens: usage.totalTokens,
              turn_cost_usd: Number(usage.costUsd.toFixed(6)),
              session_cost_usd: Number(microUsdToUsd(counters.sessionCostMicroUsd).toFixed(6)),
              session_tokens: counters.sessionTokens,
              day_cost_usd: Number(microUsdToUsd(counters.dayCostMicroUsd).toFixed(6)),
              counter_store: store,
              budget_bypass: admission?.action === 'crisis_bypass' ? admission.reason : null,
            }, 'Measured turn usage');
          }

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
              payload: { session_id, message: result.message },
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
              journal_prompt_suggested: result.journalPromptSuggested,
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
            fallback_source: result.fallbackSource ?? null,
            timing: result.timing,
          }, 'Turn completed');

          setIdleTimer(connId, session_id, socket, uid, req.log);
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

        // Same IDOR concern as USER_TURN — session_id is never taken from
        // the client payload for authorization, only the server-tracked,
        // ownership-verified currentSessionId.
        if (!currentSessionId) {
          send({
            type: 'ERROR',
            payload: { reason: 'INVALID_PAYLOAD' },
          });
          return;
        }

        if (
          pld.tool_type !== 'grounding_5431' ||
          !isValidGroundingResult(pld.result)
        ) {
          send({
            type: 'ERROR',
            payload: { reason: 'INVALID_PAYLOAD' },
          });
          return;
        }

        const sessionId = currentSessionId;
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
