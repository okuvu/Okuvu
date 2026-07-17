import { WebSocket } from 'k6/experimental/websockets';
import { check } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const LOAD_TEST_KEY = __ENV.LOAD_TEST_KEY;
const WS_URL = __ENV.WS_URL || 'wss://evia-beta-xxxx-uc.a.run.app/ws';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    turn_latency: ['p(50)<3000'],
    ws_errors: ['rate<0.001'],
    session_opens: ['rate>0.99'],
  },
  noVUConnectionReuse: true,
};

export default function () {
  const vuId = __VU;
  let sessionId = null;
  let turnCount = 0;

  const ws = new WebSocket(WS_URL, null, {
    headers: {
      'x-load-test-key': LOAD_TEST_KEY,
      'x-load-test-vu-id': String(vuId),
    },
  });

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'SESSION_OPEN' }));
  };

  ws.onmessage = (raw) => {
    const frame = JSON.parse(raw.data);

    if (frame.type === 'SESSION_OPEN_CONFIRMED') {
      sessionId = frame.payload.session_id;
      turnCount = 0;
      setTimeout(() => sendTurn(ws, sessionId, ++turnCount), 300);
      return;
    }

    if (frame.type === 'SESSION_OPEN_REJECTED') {
      ws.close();
      return;
    }

    if (frame.type === 'AGENT_TURN') {
      check(frame, { 'agent turn received': () => true });
      if (turnCount >= 10) {
        ws.send(JSON.stringify({ type: 'SESSION_CLOSE', payload: {} }));
      } else {
        const delay = randomIntBetween(6000, 10000);
        setTimeout(() => sendTurn(ws, sessionId, ++turnCount), delay);
      }
      return;
    }

    if (frame.type === 'SESSION_CLOSED') {
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'SESSION_OPEN' }));
      }, 2000);
      return;
    }
  };

  ws.onerror = () => {};
  ws.onclose = () => {};
}

function sendTurn(ws, sid, num) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const sentAt = Date.now();
  ws.send(JSON.stringify({
    type: 'USER_TURN',
    payload: {
      session_id: sid,
      message: `Load test turn ${num}.`,
      __sent_at: sentAt,
    },
  }));
}
