import { describe, it, expect } from 'vitest';
import {
  cleanSimulatorMessage,
  cannedSimulatorTurn,
  resolveSimulatorModel,
  type SimulatorTurnInput,
} from '../lib/user-simulator';

describe('TH-S33 user-simulator', () => {
  describe('cleanSimulatorMessage', () => {
    it('strips a leading role label the model may add', () => {
      expect(cleanSimulatorMessage('Client: I had a rough day.')).toBe('I had a rough day.');
      expect(cleanSimulatorMessage('USER: hello')).toBe('hello');
      expect(cleanSimulatorMessage('Me: okay then')).toBe('okay then');
    });

    it('strips symmetric wrapping quotes', () => {
      expect(cleanSimulatorMessage('"I have 17 things to do."')).toBe('I have 17 things to do.');
      expect(cleanSimulatorMessage('“nested content”')).toBe('nested content');
    });

    it('keeps only the first paragraph (drops trailing narration)', () => {
      const raw = 'I feel overwhelmed.\n\n(Note: staying in character)';
      expect(cleanSimulatorMessage(raw)).toBe('I feel overwhelmed.');
    });

    it('collapses internal newlines into spaces', () => {
      expect(cleanSimulatorMessage('line one\nline two')).toBe('line one line two');
    });

    it('leaves a clean message untouched', () => {
      expect(cleanSimulatorMessage("I've been dreading this presentation all week.")).toBe(
        "I've been dreading this presentation all week.",
      );
    });
  });

  describe('cannedSimulatorTurn (sandbox deterministic path)', () => {
    const base: SimulatorTurnInput = {
      persona: { personaId: 'P01', trajectory: 'stable' },
      history: [],
      gapBeforeMs: 0,
      sessionIndex: 1,
      seed: 42,
    };

    it('uses a sample starter on the opening turn when available', () => {
      const result = cannedSimulatorTurn({
        ...base,
        persona: { ...base.persona, sampleStarters: ['I have 17 things to do…', 'Work is a lot.'] },
      });
      expect(result).toBe('I have 17 things to do…');
    });

    it('is deterministic for the same seed', () => {
      const a = cannedSimulatorTurn({ ...base, seed: 7 });
      const b = cannedSimulatorTurn({ ...base, seed: 7 });
      expect(a).toBe(b);
    });

    it('reacts differently to a therapist turn vs opening', () => {
      const opening = cannedSimulatorTurn(base);
      const reactive = cannedSimulatorTurn({
        ...base,
        history: [
          { role: 'user', text: 'hi' },
          { role: 'assistant', text: 'Hello, how can I help?' },
        ],
      });
      expect(reactive).not.toBe(opening);
      expect(reactive.length).toBeGreaterThan(0);
    });
  });

  describe('resolveSimulatorModel (no self-play guard)', () => {
    it('resolves to the default when nothing is pinned', () => {
      const prev = process.env.TEST_HARNESS_SIMULATOR_MODEL;
      delete process.env.TEST_HARNESS_SIMULATOR_MODEL;
      delete process.env.OPENROUTER_MODEL;
      try {
        expect(resolveSimulatorModel()).toBe('google/gemini-2.0-flash-001');
      } finally {
        if (prev !== undefined) process.env.TEST_HARNESS_SIMULATOR_MODEL = prev;
      }
    });

    it('refuses a simulator model equal to the A2 model (no self-play)', () => {
      const prevSim = process.env.TEST_HARNESS_SIMULATOR_MODEL;
      const prevA2 = process.env.OPENROUTER_MODEL;
      process.env.TEST_HARNESS_SIMULATOR_MODEL = 'meta-llama/llama-3.1-8b-instruct';
      delete process.env.OPENROUTER_MODEL;
      try {
        expect(() => resolveSimulatorModel()).toThrow(/no self-play/);
      } finally {
        if (prevSim !== undefined) process.env.TEST_HARNESS_SIMULATOR_MODEL = prevSim;
        else delete process.env.TEST_HARNESS_SIMULATOR_MODEL;
        if (prevA2 !== undefined) process.env.OPENROUTER_MODEL = prevA2;
      }
    });

    it('honors an explicit TEST_HARNESS_SIMULATOR_MODEL pin', () => {
      const prevSim = process.env.TEST_HARNESS_SIMULATOR_MODEL;
      const prevA2 = process.env.OPENROUTER_MODEL;
      process.env.TEST_HARNESS_SIMULATOR_MODEL = 'mistralai/mistral-small';
      delete process.env.OPENROUTER_MODEL;
      try {
        expect(resolveSimulatorModel()).toBe('mistralai/mistral-small');
      } finally {
        if (prevSim !== undefined) process.env.TEST_HARNESS_SIMULATOR_MODEL = prevSim;
        else delete process.env.TEST_HARNESS_SIMULATOR_MODEL;
        if (prevA2 !== undefined) process.env.OPENROUTER_MODEL = prevA2;
      }
    });
  });
});
