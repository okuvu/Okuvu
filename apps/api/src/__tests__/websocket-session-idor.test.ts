import { describe, it, expect } from 'vitest';
import { isValidGroundingResult, MAX_GROUNDING_ITEMS, MAX_GROUNDING_ITEM_LENGTH } from '../routes/websocket.js';

// Security-audit round, 16 Sep 2026: USER_TURN and TOOL_RESULT in
// websocket.ts previously trusted a client-supplied session_id from the
// frame payload for both handlers, rather than the server-tracked
// currentSessionId (only ever set by handleSessionOpen after it verifies
// the session belongs to the connected uid — see session-handler.ts). Any
// signed-in user who obtained/guessed another user's session UUID could
// inject turns into, and read context from, a session they didn't own.
// Fixed by reading currentSessionId exclusively; the client payload's
// session_id is no longer consulted for authorization in either handler.
//
// A full behavioral regression test for this (two connections, two
// spoofed session_ids, asserting the response/stored data always reflects
// the caller's own session) was attempted via @fastify/websocket's
// injectWS helper, but injectWS/websocketServer are not being decorated
// onto the app instance in this test environment even after app.ready() —
// worth revisiting with a real listening server + `ws` client if this
// logic is touched again. The fix itself is a straightforward
// read-from-closure-variable-instead-of-payload change, verified by
// direct code review of both handlers.

function validGroundingResult() {
  return {
    see: ['a lamp'],
    touch: ['the desk'],
    hear: ['traffic'],
    smell: ['coffee'],
    taste: ['mint'],
  };
}

describe('isValidGroundingResult', () => {
  it('accepts a well-formed grounding result', () => {
    expect(isValidGroundingResult(validGroundingResult())).toBe(true);
  });

  it('rejects a missing field', () => {
    const { taste, ...rest } = validGroundingResult();
    expect(isValidGroundingResult(rest)).toBe(false);
  });

  it('rejects a non-array field', () => {
    expect(isValidGroundingResult({ ...validGroundingResult(), see: 'a lamp' })).toBe(false);
  });

  it('rejects a non-string array item', () => {
    expect(isValidGroundingResult({ ...validGroundingResult(), see: [123] })).toBe(false);
  });

  it('rejects an array exceeding MAX_GROUNDING_ITEMS', () => {
    const tooMany = Array.from({ length: MAX_GROUNDING_ITEMS + 1 }, (_, i) => `item ${i}`);
    expect(isValidGroundingResult({ ...validGroundingResult(), see: tooMany })).toBe(false);
  });

  it('rejects an item exceeding MAX_GROUNDING_ITEM_LENGTH', () => {
    const tooLong = 'x'.repeat(MAX_GROUNDING_ITEM_LENGTH + 1);
    expect(isValidGroundingResult({ ...validGroundingResult(), see: [tooLong] })).toBe(false);
  });

  it('rejects null/non-object input', () => {
    expect(isValidGroundingResult(null)).toBe(false);
    expect(isValidGroundingResult('not an object')).toBe(false);
    expect(isValidGroundingResult(undefined)).toBe(false);
  });
});
