export async function enqueueSummaryJob(
  sessionId: string,
  log?: { info: (obj: Record<string, unknown>, msg: string) => void },
): Promise<void> {
  if (log) {
    log.info({ event: 'summary_enqueue', session_id: sessionId }, 'A10A summary job enqueued');
  }
}
