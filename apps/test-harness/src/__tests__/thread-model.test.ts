import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Vitest (unlike the Next.js dev server this app normally runs under) does
// not auto-load .env, so DATABASE_URL is otherwise unset here even in a
// local dev environment that has one configured. Minimal, dependency-free
// load — only DATABASE_URL, only if not already set (never overrides a
// real CI-provided value) — scoped to this one file rather than changing
// vitest.config.ts for every test in the suite.
if (!process.env.DATABASE_URL) {
  try {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.resolve(dirname, '../../.env');
    const envFile = readFileSync(envPath, 'utf-8');
    const match = envFile.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
    if (match) process.env.DATABASE_URL = match[1];
  } catch {
    // No .env file (e.g. CI) — prisma stays null, tests below self-skip.
  }
}

// okuvu-remaining-changes.md §E.1/§E.4 — real regression coverage for the
// "thread concept (new/continuing thread, no caps, taper)" the tracker
// doc asked for, replacing an SD1/TL2 rate-limit assert that (per this
// session's research) never actually existed as harness code.
//
// Unlike every other test in this suite, this file deliberately does NOT
// mock `processTurn`/`prisma` — mocking the orchestrator boundary would
// mean testing nothing real (the retired cap logic and the taper_state DB
// write both live *inside* processTurn, so a mocked processTurn can never
// prove either is actually gone/working). This calls the real
// setupSyntheticSession/runFullPipeline against a real database, the same
// way an actual corpus/conversation run does — sandbox mode keeps LLM
// calls canned (shouldUseCanned('sandbox') === true), so this is free and
// deterministic, not a real-model integration test.
//
// Self-skips when no DATABASE_URL is configured (prisma.ts's
// prismaClientSingleton returns null), so this doesn't fail in an
// environment without DB access — same null-safety convention corpus.ts's
// routers already use.
const { prisma } = await import('@/lib/prisma');
const { setupSyntheticSession, runFullPipeline } = await import('@/lib/pipeline-runner');
const { withCannedMode } = await import('@/lib/canned-mode');

// Canned mode, same as corpus.ts/conversation.ts wrap every real run with
// for sandbox — keeps this free and deterministic (no real LLM calls),
// consistent with TH-S17's "sandbox runs should be free/deterministic by
// default" rationale (canned-mode.ts).
function runTurn(params: Parameters<typeof runFullPipeline>[0]) {
  return withCannedMode(true, () => runFullPipeline(params));
}

describe.skipIf(!prisma)('thread model — real pipeline, real DB (okuvu-remaining-changes.md §E.1)', () => {
  it('never rejects across many turns on the same thread (no-cap regression)', async () => {
    const { uid, sessionId } = await setupSyntheticSession();

    const TURN_COUNT = 15; // past the old, retired CAP_TURN_LIMIT=10
    for (let i = 1; i <= TURN_COUNT; i++) {
      const { result } = await runTurn({
        uid,
        sessionId,
        message: `This is turn number ${i} of a continuing thread.`,
      });

      expect(result.type).toBe('agent_turn');
      if (result.type === 'agent_turn') {
        expect(result.turnCount).toBe(i);
      }
    }
  }, 30_000);

  it('two fresh sessions are independent threads with independent turn counts', async () => {
    const threadA = await setupSyntheticSession();
    const threadB = await setupSyntheticSession();

    expect(threadA.sessionId).not.toBe(threadB.sessionId);

    const { result: resultA } = await runTurn({
      uid: threadA.uid,
      sessionId: threadA.sessionId,
      message: 'First message on thread A.',
    });
    const { result: resultB } = await runTurn({
      uid: threadB.uid,
      sessionId: threadB.sessionId,
      message: 'First message on thread B.',
    });

    expect(resultA.type).toBe('agent_turn');
    expect(resultB.type).toBe('agent_turn');
    if (resultA.type === 'agent_turn' && resultB.type === 'agent_turn') {
      // Both are each thread's first turn — starting a new thread never
      // inherits or is capped by another thread's turn count.
      expect(resultA.turnCount).toBe(1);
      expect(resultB.turnCount).toBe(1);
    }
  }, 30_000);

  it('persists taper_state/closure_offered from a forced A2 signal (full harness -> processTurn -> DB round trip)', async () => {
    const { uid, sessionId } = await setupSyntheticSession();

    const { result } = await runTurn({
      uid,
      sessionId,
      message: 'That actually helped a lot, thank you.',
      testMode: {
        signalOverride: {
          boundary: 'a2_result',
          payload: {
            signal: {
              signal: 'S-07',
              agent: 'A2',
              technique_used: null,
              tool_launched: null,
              taper_state: 'solution_reached',
              closure_offered: true,
              frustration_event: false,
              homework_referenced: false,
              therapist_referral: false,
              intensity: 2,
              mood_inference: { primary_emotion: 'relief', confidence: 'medium' },
            },
          },
        },
      },
    });

    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn' || !result.turnId) {
      throw new Error('expected an agent_turn result with a turnId to verify persistence against');
    }

    const persisted = await prisma!.turn.findUnique({
      where: { id: result.turnId },
      select: { taper_state: true, closure_offered: true },
    });

    expect(persisted).toEqual({ taper_state: 'solution_reached', closure_offered: true });
  }, 30_000);
});
