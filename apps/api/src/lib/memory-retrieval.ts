import { prisma } from './prisma.js';
import { generateEmbedding } from './embedding.js';

const SIMILARITY_THRESHOLD = 0.55;
const MIN_SESSION_COUNT = 5;
const MAX_RESULTS = 3;

export interface RetrievedSession {
  session_id: string;
  summary: string;
  session_started_at: Date;
  similarity: number;
}

export async function retrieveRelevantSessions(
  userId: string,
  currentMessage: string,
  currentSessionId: string,
  limit = MAX_RESULTS,
): Promise<RetrievedSession[]> {
  const [countResult] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "SessionLog"
    WHERE user_id = ${userId}
      AND id != ${currentSessionId}
      AND summary_embedding IS NOT NULL
  `;

  const sessionCount = Number(countResult.count);
  if (sessionCount < MIN_SESSION_COUNT) return [];

  const queryEmbedding = await generateEmbedding(currentMessage);

  const queryVector = `[${queryEmbedding.join(',')}]`;

  const results = await prisma.$queryRaw<RetrievedSession[]>`
    SELECT
      sl.id AS session_id,
      ss.summary_text AS summary,
      sl.session_started_at,
      1 - (sl.summary_embedding <=> ${queryVector}::vector) AS similarity
    FROM "SessionLog" sl
    INNER JOIN "SessionSummary" ss
      ON ss.session_id = sl.id
      AND ss.user_id = sl.user_id
      AND ss.status = 'COMPLETED'
    WHERE
      sl.user_id = ${userId}
      AND sl.id != ${currentSessionId}
      AND sl.summary_embedding IS NOT NULL
      AND ss.summary_text IS NOT NULL
    ORDER BY sl.summary_embedding <=> ${queryVector}::vector
    LIMIT ${limit}
  `;

  return results.filter((r) => r.similarity > SIMILARITY_THRESHOLD);
}

function extractNarrative(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.narrative_summary === 'string' && parsed.narrative_summary.trim().length > 0) {
      return parsed.narrative_summary;
    }
  } catch {
  }
  return raw;
}

export function formatRetrievedContext(sessions: RetrievedSession[]): string {
  if (sessions.length === 0) return 'null';

  return sessions
    .map((s) => {
      const daysAgo = Math.floor(
        (Date.now() - new Date(s.session_started_at).getTime())
        / (1000 * 60 * 60 * 24),
      );
      const timeLabel = daysAgo < 7
        ? `${daysAgo} days ago`
        : daysAgo < 30
          ? `${Math.floor(daysAgo / 7)} weeks ago`
          : `${Math.floor(daysAgo / 30)} months ago`;

      return `[Relevant past session — ${timeLabel}]: ${extractNarrative(s.summary)}`;
    })
    .join('\n\n');
}
