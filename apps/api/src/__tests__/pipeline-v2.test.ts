import { describe, it, expect, vi } from 'vitest';
import { processTurnV2, isAgentPipelineV2Enabled, type TurnV2Deps, type TurnV2Input } from '../pipeline/v2/turn.js';
import { compile } from '../agents/a12/agent.js';
import {
  emptySpecialistOutput,
  type SpecialistOutput,
} from '../agents/shared/specialist.js';
import type { SpecialistPayload } from '../agents/shared/types.js';

const COPY = {
  crisis: 'CRISIS_COPY',
  grounding: 'GROUNDING_COPY',
  governanceBlocked: 'BLOCKED_COPY',
  noIntervention: 'HOLDING_COPY',
};

const COGNITIVE: SpecialistPayload = {
  type: 'cognitive_restructuring',
  thought: 'everyone at work thinks I am useless',
  distortion: 'mind_reading',
  evidence_for: ['I am sure they do'],
  evidence_against: [],
  alternative_thought: 'they may just be busy',
  confidence: 'medium',
};

function payloadFor(id: string): SpecialistOutput<SpecialistPayload> {
  if (id === 'A3') {
    return { agentId: 'A3', payload: COGNITIVE, fallbackUsed: false, failureReason: null, notes: null };
  }
  return emptySpecialistOutput(id, 'not_implemented');
}

function makeDeps(overrides: Partial<TurnV2Deps> = {}): TurnV2Deps {
  return {
    classifySafety: vi.fn(async () => ({ safetyState: 'S1' as const, fallbackUsed: false })),
    classifyGovernance: vi.fn(async () => ({ governanceState: 'Active' as const, fallbackUsed: false })),
    runSpecialist: vi.fn(async (id: string) => payloadFor(id)),
    compile,
    synthesise: vi.fn(async () => ({
      status: 'ready' as const,
      audio: new Uint8Array([1]),
      mimeType: 'audio/mpeg',
      reason: null,
      provider: 'fake',
      characters: 10,
    })),
    speechProvider: null,
    copy: COPY,
    ...overrides,
  };
}

function turn(overrides: Partial<TurnV2Input> = {}): TurnV2Input {
  return { message: 'I always mess up and everyone at work thinks I am useless.', ...overrides };
}

describe('Turn pipeline v2 — 15-agent flow', () => {
  it('is inert by default and only active with the flag', () => {
    expect(isAgentPipelineV2Enabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isAgentPipelineV2Enabled({ OKUVU_AGENT_PIPELINE_V2: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  describe('safety paths end the turn before any specialist runs', () => {
    it('S4 returns crisis copy and never calls a specialist or the compiler', async () => {
      const deps = makeDeps({ classifySafety: vi.fn(async () => ({ safetyState: 'S4' as const, fallbackUsed: false })) });
      const compileSpy = vi.fn(compile);
      deps.compile = compileSpy;

      const result = await processTurnV2(turn(), deps);

      expect(result.path).toBe('crisis');
      expect(result.text).toBe(COPY.crisis);
      expect(deps.runSpecialist).not.toHaveBeenCalled();
      expect(compileSpy).not.toHaveBeenCalled();
      expect(result.audio).toBeNull();
    });

    it('S4 propagates A1 fallbackUsed — a failed classifier is not a clean turn', async () => {
      const deps = makeDeps({ classifySafety: vi.fn(async () => ({ safetyState: 'S4' as const, fallbackUsed: true })) });
      const result = await processTurnV2(turn(), deps);
      expect(result.fallbackUsed).toBe(true);
    });

    it('S3 returns grounding copy and skips A2/specialists', async () => {
      const deps = makeDeps({ classifySafety: vi.fn(async () => ({ safetyState: 'S3' as const, fallbackUsed: false })) });
      const result = await processTurnV2(turn(), deps);
      expect(result.path).toBe('deterministic-grounding');
      expect(result.text).toBe(COPY.grounding);
      expect(deps.runSpecialist).not.toHaveBeenCalled();
      expect(deps.classifyGovernance).not.toHaveBeenCalled();
    });

    it('Blocked governance returns the static policy reply with no specialists', async () => {
      const deps = makeDeps({ classifyGovernance: vi.fn(async () => ({ governanceState: 'Blocked' as const, fallbackUsed: false })) });
      const result = await processTurnV2(turn(), deps);
      expect(result.path).toBe('governance-blocked');
      expect(result.text).toBe(COPY.governanceBlocked);
      expect(deps.runSpecialist).not.toHaveBeenCalled();
    });
  });

  describe('dialogue path', () => {
    it('selects specialists and compiles their payloads into client text', async () => {
      const result = await processTurnV2(turn(), makeDeps());
      expect(result.path).toBe('dialogue');
      expect(result.specialists).toContain('A3');
      expect(result.usedPayloads).toContain('cognitive_restructuring');
      expect(result.text).toContain('everyone at work thinks I am useless');
      expect(result.fallbackUsed).toBe(false);
    });

    it('assembles A2 prose with at most one specialist block', async () => {
      const result = await processTurnV2(turn({ dialogueDraft: 'That sounds exhausting to carry.' }), makeDeps());
      expect(result.text.startsWith('That sounds exhausting to carry.')).toBe(true);
      expect(result.usedPayloads).toHaveLength(1);
    });

    it('completes with the draft when every specialist fails', async () => {
      const deps = makeDeps({
        runSpecialist: vi.fn(async (id: string) => emptySpecialistOutput(id, 'llm_timeout')),
      });
      const result = await processTurnV2(turn({ dialogueDraft: 'I hear you.' }), deps);
      expect(result.text).toBe('I hear you.');
      expect(result.fallbackUsed).toBe(true);
      expect(result.stages.join(' ')).toContain('specialists_failed');
    });

    it('survives a specialist that throws', async () => {
      const deps = makeDeps({
        runSpecialist: vi.fn(async (id: string) => {
          // A3 is the specialist this message selects — throwing there proves
          // one bad agent does not abort the turn.
          if (id === 'A3') throw new Error('boom');
          return payloadFor(id);
        }),
      });
      const result = await processTurnV2(turn(), deps);
      expect(result.path).toBe('dialogue');
      expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to holding copy when there is no draft and nothing compiled', async () => {
      const deps = makeDeps({
        runSpecialist: vi.fn(async (id: string) => emptySpecialistOutput(id, 'schema_invalid')),
      });
      const result = await processTurnV2(turn(), deps);
      expect(result.text).toBe(COPY.noIntervention);
      expect(result.usedPayloads).toEqual([]);
      expect(result.fallbackUsed).toBe(true);
    });

    it('never emits a specialist payload as prose — only A12-rendered text', async () => {
      const result = await processTurnV2(turn(), makeDeps());
      // The payload's raw JSON must not appear in the reply.
      expect(result.text).not.toContain('"distortion"');
      expect(result.text).not.toContain('cognitive_restructuring');
    });
  });

  describe('voice', () => {
    it('speaks A12 text through A13 when voice is requested', async () => {
      const result = await processTurnV2(turn({ requestVoice: true }), makeDeps());
      expect(result.audio?.status).toBe('ready');
      expect(result.stages).toContain('A13');
    });

    it('returns text with audio unavailable when no provider is configured', async () => {
      const deps = makeDeps({
        synthesise: vi.fn(async () => ({
          status: 'unavailable' as const,
          audio: null,
          mimeType: null,
          reason: 'no_speech_provider_configured',
          provider: null,
          characters: 10,
        })),
      });
      const result = await processTurnV2(turn({ requestVoice: true }), deps);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.audio?.status).toBe('unavailable');
      expect(result.audio?.audio).toBeNull();
    });

    it('does not synthesise when voice is not requested', async () => {
      const deps = makeDeps();
      await processTurnV2(turn(), deps);
      expect(deps.synthesise).not.toHaveBeenCalled();
    });
  });

  it('records the stages it passed through, for audit', async () => {
    const result = await processTurnV2(turn(), makeDeps());
    expect(result.stages[0]).toBe('A1');
    expect(result.stages).toContain('A9-pre');
    expect(result.stages.some((s) => s.startsWith('A8:'))).toBe(true);
    expect(result.stages).toContain('A12');
  });
});
