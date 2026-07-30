const cache = new Map<string, string>();

export function getRetrievedContext(sessionId: string): string | undefined {
  return cache.get(sessionId);
}

export function setRetrievedContext(sessionId: string, context: string): void {
  cache.set(sessionId, context);
}

export function clearRetrievedContext(sessionId: string): void {
  cache.delete(sessionId);
}
