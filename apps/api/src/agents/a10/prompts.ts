import type { A10Input } from './types.js';

export const A10_PROMPT_VERSION = 'a10-insight-v1.0';

/** Bounds on what the model is shown. Keeps a long history inside one call. */
export const MAX_SUMMARIES_IN_PROMPT = 40;
export const MAX_SUMMARY_CHARS_IN_PROMPT = 1200;
export const MAX_INSIGHTS = 5;
export const MAX_EVIDENCE_ITEMS = 4;
export const MAX_EVIDENCE_CHARS = 240;
export const MAX_THEME_CHARS = 120;
export const MAX_SESSION_REFS = 6;
export const MAX_ID_CHARS = 128;

export interface UsableSession {
  sessionId: string;
  date: string;
  summary: string;
}

/**
 * The sessions A10 is allowed to reason about: entries with a real id and a
 * non-empty summary, oldest first so the model reads a chronology rather than
 * whatever order the caller's query returned.
 */
export function usableSessions(input: A10Input): UsableSession[] {
  const seen = new Set<string>();
  const usable: UsableSession[] = [];

  for (const entry of input.sessionSummaries ?? []) {
    if (entry === null || typeof entry !== 'object') continue;
    if (typeof entry.sessionId !== 'string' || entry.sessionId.trim() === '') continue;
    if (typeof entry.summary !== 'string' || entry.summary.trim() === '') continue;
    // A duplicated id would let one session masquerade as two independent
    // supports for a theme, so the first copy wins.
    if (seen.has(entry.sessionId)) continue;
    seen.add(entry.sessionId);
    usable.push({
      sessionId: entry.sessionId,
      date: typeof entry.date === 'string' ? entry.date : '',
      summary: entry.summary.trim(),
    });
  }

  usable.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return usable.slice(0, MAX_SUMMARIES_IN_PROMPT);
}

export function renderMoodSeries(input: A10Input): string {
  const series = (input.moodSeries ?? []).filter(
    (point) => point && typeof point.date === 'string' && typeof point.score === 'number' && Number.isFinite(point.score),
  );
  if (series.length === 0) return 'No mood-check-in series is available for this client.';
  return series.map((point) => `${point.date}: ${point.score}/10`).join('\n');
}

/** The session corpus, sent as the user turn. Never used for grounding. */
export function buildInsightUserMessage(input: A10Input, sessions?: UsableSession[]): string {
  const list = sessions ?? usableSessions(input);
  const blocks = list.map((session) => {
    const body = session.summary.slice(0, MAX_SUMMARY_CHARS_IN_PROMPT);
    return `--- session_id: ${session.sessionId} | date: ${session.date}\n${body}`;
  });

  return [
    `Client reference (internal only): ${input.clientId}`,
    `Session summaries supplied: ${list.length}`,
    '',
    blocks.join('\n\n'),
    '',
    'Mood-check-in series (context only — never quote these as evidence):',
    renderMoodSeries(input),
  ].join('\n');
}

/**
 * A10 writes for a clinician, so it may use clinical *description*
 * ("avoidance around performance reviews") but never a diagnosis, never
 * advice, and never a claim the summaries do not contain. The prompt states
 * the grounding rule twice — once as a rule, once as the reason for it —
 * because it is the one contract violation that survives review silently.
 */
export function buildInsightPrompt(input: A10Input): string {
  return [
    'You are A10, the Insight Generator inside Okuvu, a mental-health support product.',
    'You read already-written session summaries and describe recurring patterns for the treating therapist.',
    'Your output is read by a clinician in their workspace. It is never shown to the client, and it never becomes a message.',
    '',
    'Hard rules — violating any one of them makes the offending insight unusable:',
    '1. Describe, do not prescribe. Never tell the therapist or the client what to do, never suggest a technique, never recommend a plan.',
    '2. Every string in `evidence` MUST be a verbatim substring of one of the supplied session summaries. Do not paraphrase, tidy, merge, or translate. If you cannot quote it, you cannot claim it.',
    '3. Never diagnose. No diagnostic labels, no disorder names, no medication, no severity ratings presented as clinical scores.',
    '4. `source_session_ids` must contain only session_id values from the list below, and must include the session each evidence string was quoted from.',
    '5. At most 5 insights. Fewer is better: two well-evidenced patterns beat five thin ones.',
    '6. `confidence` is high only when at least two separate sessions support the theme; medium for one clear session plus supporting mood data; low for a single ambiguous observation.',
    '7. Mood scores may inform confidence. They are never evidence — only summary text is evidence.',
    '8. If the summaries do not support a pattern, return {"insights": []}. An empty list is a valid and useful answer.',
    '',
    `Sessions required before this agent runs: ${input.minSessions ?? 3}. You are only called when that is met.`,
    '',
    'Return ONLY this JSON object, with no prose before or after:',
    '{',
    '  "insights": [',
    '    {',
    '      "id": string,',
    '      "theme": string,',
    '      "evidence": string[],',
    `      "confidence": "high" | "medium" | "low",`,
    '      "source_session_ids": string[]',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

/**
 * Sandbox/canned mode. Every evidence string is lifted from the summary it
 * cites, so the canned path exercises the grounding guard instead of
 * bypassing it: a canned answer that only passes because it skipped the
 * parser would hide exactly the bug the guard exists to catch.
 */
export function buildCannedA10Json(input: A10Input, sessions?: UsableSession[]): string {
  const list = (sessions ?? usableSessions(input)).slice(0, 3);

  const insights = list.map((session, index) => {
    const lower = session.summary.toLowerCase();
    const theme = /sleep|insomnia|tired|exhaust/.test(lower)
      ? 'persistent sleep disruption'
      : /work|job|manager|deadline|office/.test(lower)
        ? 'work-related strain recurring'
        : /family|partner|mother|father|sibling/.test(lower)
          ? 'relational strain recurring'
          : 'recurring theme across sessions';

    const firstSentence = session.summary.split(/(?<=[.!?])\s/)[0]?.trim() ?? session.summary;
    const evidence = firstSentence.length > 0 ? firstSentence.slice(0, MAX_EVIDENCE_CHARS) : '';

    return {
      id: `canned_${index + 1}`,
      theme,
      evidence: evidence.length > 0 ? [evidence] : [],
      confidence: 'medium',
      source_session_ids: [session.sessionId],
    };
  });

  return JSON.stringify({ insights: insights.filter((insight) => insight.evidence.length > 0) });
}
