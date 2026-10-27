import { describe, it, expect } from 'vitest';
import { compile, MAX_COMPILED_CHARS } from '../agents/a12/agent.js';
import { RENDERERS, PAYLOAD_PRIORITY, stripMachineBlocks, DISTORTION_LABELS } from '../agents/a12/prompts.js';
import { findForbiddenAdvice } from '../agents/shared/specialist.js';
import type { A12Input } from '../agents/a12/types.js';
import type { SpecialistPayload } from '../agents/shared/types.js';

const cognitive: SpecialistPayload = {
  type: 'cognitive_restructuring',
  thought: 'everyone at work thinks I am useless',
  distortion: 'mind_reading',
  evidence_for: ['I am sure they do'],
  evidence_against: ['no one has actually said it'],
  alternative_thought: 'they may be busy rather than dismissive',
  confidence: 'medium',
};

const activation: SpecialistPayload = {
  type: 'behavioural_activation',
  action: 'walk to the end of the road and back',
  when: 'after dinner',
  rationale: 'It is the smallest version of leaving the flat.',
  predicted_difficulty: 3,
  confidence: 'medium',
};

const interpersonal: SpecialistPayload = {
  type: 'interpersonal_skills',
  skill: 'boundary_setting',
  situation: 'my manager messages me at 11pm',
  example_words: 'I will pick this up first thing tomorrow.',
  purpose: 'So the evening stays yours.',
  confidence: 'high',
};

const values: SpecialistPayload = {
  type: 'meaning_values',
  value: 'being present for my daughter',
  evidence: 'you said the evenings with her are the only part that feels real',
  next_step: 'one phone-free hour after dinner',
  confidence: 'medium',
};

const maintenance: SpecialistPayload = {
  type: 'maintenance_transition',
  gain: 'you have gone from three panic episodes a week to one',
  anchor: 'writing the worry down before bed',
  plan: 'we would meet fortnightly and keep the written check-in',
  confidence: 'high',
};

function input(overrides: Partial<A12Input> = {}): A12Input {
  return { mode: 'compile', payloads: [cognitive], safetyState: 'S1', ...overrides };
}

describe('A12 Content Compiler — sole writer of client-facing text', () => {
  describe('compile mode', () => {
    it('renders a cognitive payload into client text', () => {
      const out = compile(input());
      expect(out.ok).toBe(true);
      expect(out.compiled?.text).toContain('everyone at work thinks I am useless');
      expect(out.compiled?.usedPayloads).toEqual(['cognitive_restructuring']);
    });

    it('renders every supported payload type', () => {
      for (const payload of [cognitive, activation, interpersonal, values, maintenance]) {
        const out = compile(input({ payloads: [payload] }));
        expect(out.ok, payload.type).toBe(true);
        expect(out.compiled?.text.length ?? 0).toBeGreaterThan(20);
      }
    });

    it('never renders more than two payloads', () => {
      const out = compile(input({ payloads: [cognitive, activation, interpersonal] }));
      expect(out.compiled?.usedPayloads).toHaveLength(2);
      expect(out.compiled?.droppedPayloads).toContain('interpersonal_skills');
    });

    it('orders payloads deterministically regardless of input order', () => {
      const a = compile(input({ payloads: [activation, cognitive] }));
      const b = compile(input({ payloads: [cognitive, activation] }));
      expect(a.compiled?.text).toBe(b.compiled?.text);
      expect(a.compiled?.usedPayloads).toEqual(PAYLOAD_PRIORITY.filter((t) => a.compiled?.usedPayloads.includes(t)));
    });

    it('drops an unknown payload type instead of inventing text', () => {
      const bogus = { type: 'astrology', star: 'rising' } as unknown as SpecialistPayload;
      const out = compile(input({ payloads: [bogus, activation] }));
      expect(out.compiled?.droppedPayloads).toContain('astrology');
      expect(out.compiled?.usedPayloads).toEqual(['behavioural_activation']);
    });

    it('fails when nothing is renderable', () => {
      const out = compile(input({ payloads: [] }));
      expect(out.ok).toBe(false);
      expect(out.errors).toContain('no_renderable_payload');
      expect(out.compiled).toBeNull();
    });

    it('refuses at S4 — crisis copy is single-sourced elsewhere', () => {
      const out = compile(input({ safetyState: 'S4' }));
      expect(out.ok).toBe(false);
      expect(out.errors).toContain('refused_safety_state_S4');
    });

    it('refuses to render an unsourced helpline number', () => {
      const out = compile(
        input({
          payloads: [
            {
              ...cognitive,
              alternative_thought: 'you can call 9152987821 tonight',
            } as SpecialistPayload,
          ],
        }),
      );
      expect(out.ok).toBe(false);
      expect(out.errors).toContain('unsourced_helpline_number');
    });

    it('enforces the length budget by truncating at a sentence boundary', () => {
      const long = {
        ...cognitive,
        evidence_for: ['a'.repeat(230), 'b'.repeat(230), 'c'.repeat(230)],
      } as SpecialistPayload;
      const out = compile(input({ payloads: [long] }));
      expect(out.ok).toBe(true);
      expect((out.compiled?.text.length ?? 0)).toBeLessThanOrEqual(MAX_COMPILED_CHARS + 1);
      expect(out.compiled?.repairs).toContain('truncated_to_budget');
    });

    it('rejects text with more than two questions', () => {
      const out = compile(
        input({
          payloads: [
            { ...values, next_step: 'What if? What then? And what about this?' } as SpecialistPayload,
          ],
        }),
      );
      expect(out.ok).toBe(false);
      expect(out.errors).toContain('too_many_questions');
    });
  });

  describe('assemble mode', () => {
    it('keeps A2 prose and appends at most one compiled block', () => {
      const out = compile(
        input({ mode: 'assemble', dialogueDraft: 'That sounds exhausting.', payloads: [cognitive, activation] }),
      );
      expect(out.ok).toBe(true);
      expect(out.compiled?.text.startsWith('That sounds exhausting.')).toBe(true);
      expect(out.compiled?.usedPayloads).toHaveLength(1);
    });

    it('returns only the draft when there are no payloads', () => {
      const out = compile(input({ mode: 'assemble', dialogueDraft: 'I hear you.', payloads: [] }));
      expect(out.ok).toBe(true);
      expect(out.compiled?.text).toBe('I hear you.');
    });

    it('requires a draft in assemble mode', () => {
      const out = compile(input({ mode: 'assemble', dialogueDraft: '   ', payloads: [cognitive] }));
      expect(out.ok).toBe(false);
      expect(out.errors).toContain('dialogue_draft_required');
    });

    it('strips a leaked machine signal block from the draft', () => {
      const draft = 'That sounds hard.\n```json\n{"signal":{"s07":"validation"}}\n```';
      const out = compile(input({ mode: 'assemble', dialogueDraft: draft, payloads: [] }));
      expect(out.compiled?.text).toBe('That sounds hard.');
      expect(out.compiled?.repairs).toContain('stripped_machine_block');
    });

    it('strips a trailing signal object', () => {
      const { text, stripped } = stripMachineBlocks('I hear you. {"signal": "validation"}');
      expect(stripped).toBe(true);
      expect(text).toBe('I hear you.');
    });
  });

  describe('copy library safety', () => {
    it('every distortion label is plain language, none is a diagnosis', () => {
      for (const [key, label] of Object.entries(DISTORTION_LABELS)) {
        expect(label.length, key).toBeGreaterThan(3);
        expect(findForbiddenAdvice(label), key).toBeNull();
      }
    });

    it('every renderer output passes the forbidden-content check', () => {
      for (const payload of [cognitive, activation, interpersonal, values, maintenance]) {
        const text = RENDERERS[payload.type](payload);
        expect(findForbiddenAdvice(text), payload.type).toBeNull();
      }
    });

    it('no template contains a second-person command', () => {
      for (const payload of [cognitive, activation, interpersonal, values, maintenance]) {
        const text = RENDERERS[payload.type](payload).toLowerCase();
        expect(text).not.toMatch(/\byou (must|need to|have to|should)\b/);
      }
    });
  });
});
