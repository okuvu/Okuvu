/**
 * TH-S38 smoke script — exercises the /campaign path end to end against a real
 * Postgres database, in sandbox mode (canned responses, no model spend).
 *
 * What it proves, and what it does not:
 *   PROVES  the migration applies, the persona import writes rows, a Campaign
 *           and one ConversationRun group per persona are created, the
 *           resumable advance loop runs real pipeline turns and session
 *           closes, verdicts fold from persisted evidence, and the results
 *           read back with one row per conversation.
 *   DOES NOT PROVE  model quality, judge behaviour, or the worker stage — the
 *           worker here is a stub that answers /health and /tasks/summary
 *           without extracting anything, and sandbox replies are canned
 *           template text. The script asserts the run does NOT come back PASS:
 *           that refusal is the point.
 *
 * Run (with a local Postgres and a lane for the stub worker):
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55432/okuvu \
 *     npx tsx scripts/campaign-smoke.ts
 */

import http from 'node:http';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/okuvu';
process.env.WORKER_URL = process.env.WORKER_URL ?? 'http://127.0.0.1:8799';
process.env.USE_CANNED_LLM_RESPONSE = 'true';

const WORKER_PORT = Number(new URL(process.env.WORKER_URL).port || 8799);

function startWorkerStub(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ db: 'ok' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/tasks/summary') {
      // Deliberately writes nothing: C1 must fail, so the run cannot be PASS.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ processed: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => server.listen(WORKER_PORT, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const worker = await startWorkerStub();

  const { initTRPC } = await import('@trpc/server');
  const { prisma } = await import('../src/lib/prisma');
  const { campaignRouter } = await import('../src/server/routers/campaign');

  if (!prisma) throw new Error('DATABASE_URL is not set — nothing to test against.');

  const createCaller = initTRPC.context<any>().create().createCallerFactory(campaignRouter);
  const caller: any = createCaller({
    session: {
      user: {
        id: 'smoke-user',
        email: 'smoke@evia.local',
        name: 'Smoke',
        role: 'PI',
        environments: ['sandbox', 'staging'],
      },
    },
    prisma,
  });

  const stamp = Date.now();
  const rows = [
    {
      personaId: `smoke-grief-${stamp}`,
      personaVersion: '1',
      expectedBehavior: 'reflect_and_explore, avoid_directive_advice',
      demographics: '34 F Pune designer',
      profile: 'Lost her job in September; sleeps badly and is not eating.',
      trajectory: 'de-escalating' as const,
      goals: ['make sense of the last two months'],
      secrets: ['was let go for raising a safety issue'],
      openerStyle: 'one line, apologetic',
      sampleStarters: ['i lost my job in september and i cannot sleep'],
      continuityCues: { stable: ['lost job in september'], temporary: ['exams this week'] },
      determinismRules: ['lower case, no punctuation'],
      tags: ['smoke', 'grief'],
    },
    {
      personaId: `smoke-no-rubric-${stamp}`,
      personaVersion: '1',
      expectedBehavior: null,
      demographics: '41 M Chennai teacher',
      profile: 'Quiet for weeks, drinking more than he wants to admit.',
      trajectory: 'stable' as const,
      goals: ['sleep better'],
      secrets: [],
      openerStyle: 'guarded',
      sampleStarters: ['i do not know if this will help'],
      continuityCues: null,
      determinismRules: [],
      tags: ['smoke'],
    },
  ];

  const imported = await caller.importPersonas({ rows, tags: ['smoke'] });
  console.log('imported:', imported.created.length, 'rejected:', imported.rejected.length);
  if (imported.created.length !== 2) throw new Error(`expected 2 personas imported, got ${imported.created.length}`);

  // Re-importing the same personaId at the same version must be refused: the
  // bank is versioned, so a silent second row would duplicate every picker.
  const reimported = await caller.importPersonas({ rows: [rows[0]], tags: ['smoke'] });
  console.log('re-import rejected:', reimported.rejected[0]?.reason ?? '(none — WRONG)');
  if (reimported.created.length !== 0 || !reimported.rejected[0]?.reason.includes('already in the bank')) {
    throw new Error('re-importing an identical persona was not rejected — the bank would duplicate');
  }

  const personaIds = imported.created.map((row: { caseId: string }) => row.caseId);

  const plan = await caller.estimate({
    environment: 'sandbox',
    target: 'in-process',
    sessions: 2,
    turnsMin: 2,
    turnsMax: 2,
    gapPreset: 'day3-day7',
    seed: 7,
    judgeEnabled: true,
    costCeilingUsd: 5,
    personaIds,
  });
  console.log('plan:', {
    canStart: plan.canStart,
    plannedTurns: plan.estimate.plannedTurns,
    estimateUsd: plan.estimate.totalUsd,
    blockers: plan.blockers.map((blocker) => `${blocker.severity}:${blocker.code}`),
    simulator: plan.simulatorModel,
  });
  if (!plan.canStart) throw new Error('plan is blocked — the smoke run cannot start');

  const started = await caller.start({
    environment: 'sandbox',
    target: 'in-process',
    sessions: 2,
    turnsMin: 2,
    turnsMax: 2,
    gapPreset: 'day3-day7',
    seed: 7,
    judgeEnabled: true,
    costCeilingUsd: 5,
    personaIds,
    label: `smoke campaign ${stamp}`,
  });
  console.log('campaign:', started.campaignId, 'planned turns:', started.plannedTurns);

  let ticks = 0;
  for (;;) {
    const result = await caller.advance({ campaignId: started.campaignId, steps: 3 });
    ticks += 1;
    if (result.done) {
      console.log('advance ticks:', ticks, 'final campaign status:', result.status);
      break;
    }
    if (ticks > 40) throw new Error('campaign did not finish in 40 advance calls');
  }

  const read = await caller.get({ campaignId: started.campaignId });
  console.log('counts:', read.counts);
  for (const row of read.results) {
    console.log('row:', {
      persona: row.personaId,
      verdict: row.verdict,
      code: row.code,
      turns: row.turnsCompleted,
      sessions: row.sessionsCompleted,
      continuity: row.checks.continuityFailures,
      judged: row.checks.judgedSessions,
      reason: row.reason.slice(0, 120),
    });
  }

  const first = read.results[0];
  const transcript = await caller.transcript({ groupId: first.groupId });
  console.log('transcript turns:', transcript.turns.length);
  for (const turn of transcript.turns) {
    console.log(`  [s${turn.sessionIndex} t${turn.turnNumber}] client: ${turn.message.slice(0, 60)}`);
    console.log(`                 agent:  ${(turn.response ?? `<none:${turn.resultType}>`).slice(0, 60)}`);
    if (turn.findings.length > 0) {
      console.log(`                 findings: ${turn.findings.map((finding) => finding.rule).join(', ')}`);
    }
  }

  const campaignRow = await prisma.campaign.findUnique({ where: { id: started.campaignId } });
  const groups = await prisma.conversationRun.findMany({ where: { campaign_id: started.campaignId } });
  const runs = await prisma.testRun.count({
    where: { persona_id: { in: read.results.map((row: { personaId: string }) => row.personaId) } },
  });

  console.log('db check:', {
    campaignStatus: campaignRow?.status,
    groups: groups.length,
    groupStatuses: groups.map((group) => group.status),
    storedTestRuns: runs,
    judgeVerdictCounts: groups.map((group) => (group.judge_verdicts as unknown as unknown[]).length),
  });

  if (!campaignRow) throw new Error('campaign row missing after run');
  if (groups.length !== 2) throw new Error(`expected 2 groups, got ${groups.length}`);
  if (runs === 0) throw new Error('no TestRun rows were persisted — the run did not execute');
  if (read.results.some((row: { turnsCompleted: number }) => row.turnsCompleted === 0)) throw new Error('a conversation produced no turns');
  if (read.results.some((row: { verdict: string }) => row.verdict === 'PASS')) {
    throw new Error('a sandbox (canned) run came back PASS — the verdict is lying');
  }

  console.log('SMOKE OK — campaign ran, evidence persisted, and the verdict refused to overstate it.');

  worker.close();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('SMOKE FAILED:', err);
  process.exitCode = 1;
});
