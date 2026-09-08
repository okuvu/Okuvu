import type { GroundingResult } from '@okuvu/shared-types';

interface StoredToolResult {
  tool_type: string;
  result: GroundingResult;
  turn_number?: number;
}

const store = new Map<string, StoredToolResult>();

export function setToolResult(sessionId: string, data: StoredToolResult): void {
  store.set(sessionId, data);
}

export function getToolResult(sessionId: string): StoredToolResult | undefined {
  return store.get(sessionId);
}

export function clearToolResult(sessionId: string): void {
  store.delete(sessionId);
}
