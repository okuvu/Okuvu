import { describe, expect, it } from 'vitest';
import {
  JUDGE_CALL_USD,
  PIPELINE_TURN_USD,
  SIMULATOR_TURN_USD,
  campaignBlockers,
  canStart,
  estimateCampaign,
  gapPlanFor,
} from '../lib/campaign-plan';
import { turnsForSession } from '../lib/conversation-runner';

const DAY = 24 * 3_600_000;

const baseInput = {
  personaCount: 2,
  sessions: 3,
  turnsMin: 6,
  turnsMax: 6,
  seed: 42,
  judgeEnabled: true,
  costCeilingUsd: 25,
};

const baseBlockers = {
  environment: 'staging' as const,
  target: 'in-process',
  personaCount: 2,
  rubricMissing: 0,
  workerConfigured: true,
  cannedAmbient: false,
  simulatorModelError: null,
};

describe('estimateCampaign', () => {
  it('counts planned turns from the same deterministic draw the runner uses', () => {
    const estimate = estimateCampaign(baseInput);
    const perPersona = [1, 2, 3]
      .map((session) => turnsForSession(baseInput.seed, session, 6, 6))
      .reduce((total, turns) => total + turns, 0);

    expect(estimate.plannedTurns).toBe(perPersona * 2);
    expect(estimate.pipelineUsd).toBeCloseTo(estimate.plannedTurns * PIPELINE_TURN_USD, 4);
    expect(estimate.simulatorUsd).toBeCloseTo(estimate.plannedTurns * SIMULATOR_TURN_USD, 4);
  });

  it('prices tokens instead of applying the old flat $0.01 per turn', () => {
    const estimate = estimateCampaign(baseInput);
    // The flat rate still over-estimates by ~2.3x once all four live Converse
    // calls are counted (it was ~3.5x when A9-pre/A9-post were missed). A
    // regression to the flat rate must fail.
    expect(estimate.totalUsd).toBeLessThan(estimate.plannedTurns * 0.01);
    expect(estimate.totalUsd).toBeGreaterThan(0);
  });

  it('lands the 6 x 3 x 6-12 campaign near three-quarters of a dollar, not $1.80', () => {
    const estimate = estimateCampaign({
      personaCount: 6,
      sessions: 3,
      turnsMin: 6,
      turnsMax: 12,
      seed: 42,
      judgeEnabled: true,
      costCeilingUsd: 25,
    });
    // Seeded draw: 28 turns per persona over 3 sessions × 6 personas.
    const perPersona = [1, 2, 3]
      .map((session) => turnsForSession(42, session, 6, 12))
      .reduce((total, turns) => total + turns, 0);
    expect(estimate.plannedTurns).toBe(perPersona * 6);
    // Per turn: $0.00442 pipeline + $0.000196 simulator, 168 turns, plus 18 judge calls.
    expect(estimate.totalUsd).toBeGreaterThan(0.7);
    expect(estimate.totalUsd).toBeLessThan(0.85);
  });

  it('prices one pipeline turn from the four system prompts that actually ship', () => {
    // A1 3,122 + A9-pre 3,201 + A2 13,110 + A9-post 2,576 + ~1,400 history at
    // $0.18/1M input, 290 output at $0.71/1M. If a prompt grows (v2.4 was
    // +7,223 tokens over v2.1) this figure moves and so must the constant.
    expect(PIPELINE_TURN_USD).toBeGreaterThan(0.0042);
    expect(PIPELINE_TURN_USD).toBeLessThan(0.0047);
  });

  it('charges the judge per conversation at sub-cent rates', () => {
    const estimate = estimateCampaign(baseInput);
    const conversations = baseInput.personaCount * baseInput.sessions;
    expect(estimate.judgeUsd).toBeCloseTo(conversations * JUDGE_CALL_USD, 4);
    expect(JUDGE_CALL_USD).toBeLessThan(0.001);
  });

  it('adds a judge allowance only when the judge is on', () => {
    const on = estimateCampaign(baseInput);
    const off = estimateCampaign({ ...baseInput, judgeEnabled: false });
    expect(on.judgeUsd).toBeGreaterThan(0);
    expect(off.judgeUsd).toBe(0);
    expect(on.totalUsd).toBeGreaterThan(off.totalUsd);
  });

  it('flags an estimate above the ceiling', () => {
    const estimate = estimateCampaign({ ...baseInput, costCeilingUsd: 0.01 });
    expect(estimate.overCeiling).toBe(true);
  });
});

describe('gapPlanFor', () => {
  it('builds story-time gaps for the first N sessions', () => {
    expect(gapPlanFor(1, 'day3-day7')).toEqual([0]);
    expect(gapPlanFor(2, 'day3-day7')).toEqual([0, 3 * DAY]);
    expect(gapPlanFor(3, 'day3-day7')).toEqual([0, 3 * DAY, 7 * DAY]);
  });

  it('repeats the last gap when more sessions than the pattern are planned', () => {
    expect(gapPlanFor(5, 'day3-day7')).toEqual([0, 3 * DAY, 7 * DAY, 7 * DAY, 7 * DAY]);
  });
});

describe('campaignBlockers', () => {
  const estimate = estimateCampaign(baseInput);

  it('allows a well-formed in-process campaign', () => {
    const blockers = campaignBlockers({ ...baseBlockers, estimate });
    expect(blockers).toEqual([]);
    expect(canStart(blockers)).toBe(true);
  });

  it('blocks when no persona is selected', () => {
    const blockers = campaignBlockers({ ...baseBlockers, personaCount: 0, estimate });
    expect(blockers.find((blocker) => blocker.code === 'no_personas')?.severity).toBe('block');
  });

  it('blocks the live target — the driver does not exist yet', () => {
    const blockers = campaignBlockers({ ...baseBlockers, target: 'live-websocket', estimate });
    expect(canStart(blockers)).toBe(false);
    expect(blockers.map((blocker) => blocker.code)).toContain('live_target_not_built');
  });

  it('blocks beta — the runner refuses it', () => {
    const blockers = campaignBlockers({ ...baseBlockers, environment: 'beta', estimate });
    expect(blockers.map((blocker) => blocker.code)).toContain('runner_rails');
  });

  it('blocks when the worker is unreachable, because every session would close incomplete', () => {
    const blockers = campaignBlockers({ ...baseBlockers, workerConfigured: false, estimate });
    expect(blockers.map((blocker) => blocker.code)).toContain('worker_unconfigured');
    expect(canStart(blockers)).toBe(false);
  });

  it('blocks an estimate above the ceiling instead of letting the ceiling stop it mid-run', () => {
    const blockers = campaignBlockers({
      ...baseBlockers,
      estimate: estimateCampaign({ ...baseInput, costCeilingUsd: 0.01 }),
    });
    expect(blockers.map((blocker) => blocker.code)).toContain('over_ceiling');
  });

  it('warns, but does not block, on a missing rubric', () => {
    const blockers = campaignBlockers({ ...baseBlockers, rubricMissing: 1, estimate });
    expect(blockers.find((blocker) => blocker.code === 'missing_rubric')?.severity).toBe('warn');
    expect(canStart(blockers)).toBe(true);
  });

  it('blocks a simulator that would be self-play', () => {
    const blockers = campaignBlockers({
      ...baseBlockers,
      simulatorModelError: 'Simulator model is the same as A2',
      estimate,
    });
    expect(canStart(blockers)).toBe(false);
  });

  it('blocks a canned run outside sandbox', () => {
    const blockers = campaignBlockers({ ...baseBlockers, cannedAmbient: true, estimate });
    expect(blockers.map((blocker) => blocker.code)).toContain('canned_leak');
  });

  it('allows canned mode in sandbox', () => {
    const blockers = campaignBlockers({
      ...baseBlockers,
      environment: 'sandbox',
      cannedAmbient: true,
      estimate,
    });
    expect(blockers.map((blocker) => blocker.code)).not.toContain('canned_leak');
  });
});
