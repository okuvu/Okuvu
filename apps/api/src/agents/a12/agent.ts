import { findForbiddenAdvice } from '../shared/specialist.js';
import { PAYLOAD_TYPES } from '../shared/types.js';
import type { SpecialistPayload } from '../shared/types.js';
import { RENDERERS, PAYLOAD_PRIORITY, stripMachineBlocks } from './prompts.js';
import type { A12Input, A12Output, CompiledText, ToneProfile } from './types.js';

export const MAX_COMPILED_CHARS = 700;
export const MAX_QUESTIONS = 2;
export const MAX_COMPILE_PAYLOADS = 2;
export const MAX_ASSEMBLE_PAYLOADS = 1;

/** Helplines are single-sourced and unsigned; a rendered number is a defect. */
const PHONE_IN_CALL_TO_ACTION = /\b(call|dial|ring|contact)\b[^.\n]{0,20}\d{3,}/i;

function orderPayloads(payloads: SpecialistPayload[]): SpecialistPayload[] {
  return [...payloads].sort(
    (a, b) => PAYLOAD_PRIORITY.indexOf(a.type) - PAYLOAD_PRIORITY.indexOf(b.type),
  );
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function truncateAtSentence(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (lastStop > limit * 0.5) return window.slice(0, lastStop + 1).trim();
  return `${window.trim()}…`;
}

/**
 * A12 renders only from templates that exist in the copy library, and drops
 * anything it cannot render. That means a new payload type added by a
 * specialist surfaces as a missing intervention rather than as model-written
 * prose slipping past the clinical review that every template must pass.
 */
export function compile(input: A12Input): A12Output {
  const errors: string[] = [];
  const repairs: string[] = [];
  const tone: ToneProfile = input.toneProfile ?? 'warm';

  // S4 has its own single-sourced crisis copy. Rendering an intervention over
  // a crisis turn would be the worst possible use of this agent.
  if (input.safetyState === 'S4') {
    return { ok: false, compiled: null, errors: ['refused_safety_state_S4'] };
  }

  const ordered = orderPayloads(input.payloads ?? []);
  const droppedPayloads: string[] = [];
  const rendered: Array<{ type: string; text: string }> = [];
  const cap = input.mode === 'assemble' ? MAX_ASSEMBLE_PAYLOADS : MAX_COMPILE_PAYLOADS;

  for (const payload of ordered) {
    if (rendered.length >= cap) {
      droppedPayloads.push(payload.type);
      continue;
    }
    if (!PAYLOAD_TYPES.has(payload.type)) {
      droppedPayloads.push(String((payload as { type?: string }).type ?? 'unknown'));
      continue;
    }
    const renderer = RENDERERS[payload.type];
    if (!renderer) {
      droppedPayloads.push(payload.type);
      continue;
    }

    const text = renderer(payload).trim();
    if (text.length === 0) {
      droppedPayloads.push(payload.type);
      continue;
    }

    const violation = findForbiddenAdvice(text);
    if (violation !== null) {
      // The payload passed its own guard but the template plus payload
      // combination produced advice. Drop the block; do not edit the client's
      // own words to make the template safe.
      droppedPayloads.push(payload.type);
      repairs.push(`dropped:${payload.type}:${violation}`);
      continue;
    }

    rendered.push({ type: payload.type, text });
  }

  let text: string;
  if (input.mode === 'assemble') {
    const base = stripMachineBlocks(input.dialogueDraft ?? '').text.trim();
    if (base.length === 0) {
      return { ok: false, compiled: null, errors: ['dialogue_draft_required'] };
    }
    if (stripMachineBlocks(input.dialogueDraft ?? '').stripped) {
      repairs.push('stripped_machine_block');
    }
    text = rendered.length > 0 ? `${base}\n\n${rendered[0].text}` : base;
  } else {
    if (rendered.length === 0) {
      return { ok: false, compiled: null, errors: ['no_renderable_payload'] };
    }
    text = rendered.map((r) => r.text).join('\n\n');
  }

  if (PHONE_IN_CALL_TO_ACTION.test(text)) {
    return { ok: false, compiled: null, errors: ['unsourced_helpline_number'] };
  }

  const finalViolation = findForbiddenAdvice(text);
  if (finalViolation !== null) {
    return { ok: false, compiled: null, errors: [`forbidden_content:${finalViolation}`] };
  }

  if (countQuestions(text) > MAX_QUESTIONS) {
    return { ok: false, compiled: null, errors: ['too_many_questions'] };
  }

  if (text.length > MAX_COMPILED_CHARS) {
    text = truncateAtSentence(text, MAX_COMPILED_CHARS);
    repairs.push('truncated_to_budget');
  }

  const compiled: CompiledText = {
    text,
    mode: input.mode,
    usedPayloads: rendered.map((r) => r.type),
    droppedPayloads,
    repairs,
  };

  if (rendered.length === 0 && input.mode === 'compile') errors.push('no_renderable_payload');

  // `tone` is currently a no-op by design: every template is written once, in
  // one register. A tone that rewrote sentences would be model-authored copy
  // wearing a template's name, so tone variation must come from approved
  // template variants, not from string surgery here.
  void tone;

  return { ok: errors.length === 0, compiled: errors.length === 0 ? compiled : null, errors };
}

export default compile;
