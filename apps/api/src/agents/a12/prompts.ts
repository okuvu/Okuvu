import type { SpecialistPayload } from '../shared/types.js';
import type { ToneProfile } from './types.js';

/**
 * The approved copy library.
 *
 * Every string here is the *entire* vocabulary A12 has. It cannot paraphrase a
 * payload, add encouragement, or produce a sentence no template covers — which
 * is what makes "A12 is the sole writer of client-facing text" checkable rather
 * than aspirational.
 *
 * The copy is deliberately plain, non-directive, and free of: diagnoses,
 * medication, outcome promises, helpline numbers (those are single-sourced and
 * still awaiting clinical sign-off — see docs/clinical), and second-person
 * commands. `findForbiddenAdvice()` is run over the assembled result anyway;
 * the tests assert the templates themselves pass.
 *
 * THIS FILE REQUIRES CLINICAL SIGN-OFF before it is used with real clients.
 * Wording changes are a clinical change, not a copy tweak.
 */

export const DISTORTION_LABELS: Record<string, string> = {
  all_or_nothing: 'an all-or-nothing framing',
  catastrophising: 'a jump to the worst case',
  mind_reading: 'an assumption about what others are thinking',
  should_statements: 'a rule about how things should be',
  labelling: 'a label rather than a description',
  discounting_positive: 'setting aside the parts that went okay',
  emotional_reasoning: 'treating a feeling as a fact',
  overgeneralising: 'a word like "always" or "never"',
  personalisation: 'taking responsibility for something outside your control',
  none_identified: 'something worth looking at together',
};

export const SKILL_LABELS: Record<string, string> = {
  boundary_setting: 'saying where a limit is',
  repair: 'naming what happened and checking how it landed',
  asking_for_help: 'asking for something specific',
  refusing: 'saying no without a long explanation',
  asserting_a_need: 'saying plainly what you need',
};

export const OPENERS: Record<ToneProfile, (first: string) => string> = {
  warm: (first) => `${first}`,
  neutral: (first) => `${first}`,
  direct: (first) => `${first}`,
};

/** Rendered in this order regardless of selection order — keeps output stable. */
export const PAYLOAD_PRIORITY: readonly string[] = [
  'cognitive_restructuring',
  'behavioural_activation',
  'interpersonal_skills',
  'meaning_values',
  'maintenance_transition',
];

function listPhrase(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]}`;
}

type Renderer = (payload: SpecialistPayload) => string;

/**
 * Each renderer may only use fields the payload actually carries. No renderer
 * appends advice, a suggestion to seek help, or a question beyond the one it
 * declares in its template.
 */
export const RENDERERS: Record<string, Renderer> = {
  cognitive_restructuring: (payload) => {
    if (payload.type !== 'cognitive_restructuring') return '';
    const label = DISTORTION_LABELS[payload.distortion] ?? DISTORTION_LABELS.none_identified;
    const forSide = listPhrase(payload.evidence_for);
    const againstSide = listPhrase(payload.evidence_against);

    const parts = [`You said: "${payload.thought}".`];
    if (payload.distortion !== 'none_identified') {
      parts.push(`One way to read that is as ${label}, rather than as a fact.`);
    }
    if (forSide) parts.push(`On the side that supports it: ${forSide}.`);
    if (againstSide) parts.push(`On the other side: ${againstSide}.`);
    if (payload.alternative_thought) {
      parts.push(`A different reading might be: ${payload.alternative_thought}`);
    }
    parts.push('Does that fit, or does it miss something?');
    return parts.join(' ');
  },

  behavioural_activation: (payload) => {
    if (payload.type !== 'behavioural_activation') return '';
    const when = payload.when ? ` ${payload.when}` : '';
    return [
      `One small thing that might be worth trying${when}: ${payload.action}.`,
      payload.rationale,
      'It does not have to work — it only has to be small enough to start.',
    ].join(' ');
  },

  interpersonal_skills: (payload) => {
    if (payload.type !== 'interpersonal_skills') return '';
    const label = SKILL_LABELS[payload.skill] ?? 'naming what you need';
    return [
      `The situation you described: ${payload.situation}.`,
      `One option is ${label}.`,
      `As an example of the shape, not a script to follow: "${payload.example_words}"`,
      payload.purpose,
    ].join(' ');
  },

  meaning_values: (payload) => {
    if (payload.type !== 'meaning_values') return '';
    return [
      `What comes through is that ${payload.value} matters to you.`,
      `You put it this way: ${payload.evidence}`,
      `What would one small step in that direction look like? ${payload.next_step}`,
    ].join(' ');
  },

  maintenance_transition: (payload) => {
    if (payload.type !== 'maintenance_transition') return '';
    return [
      `Looking back, ${payload.gain}.`,
      `The part that seems to be yours is ${payload.anchor}.`,
      `As contact becomes less frequent: ${payload.plan}`,
    ].join(' ');
  },
};

/**
 * A2 (and any future dialogue model) can leak its machine-readable signal block
 * into the visible reply. A12 is the last gate before the client sees text, so
 * it strips fenced JSON and a trailing signal object.
 */
export function stripMachineBlocks(text: string): { text: string; stripped: boolean } {
  let out = text;
  let stripped = false;

  const fenced = /```(?:json)?\s*\{[\s\S]*?\}\s*```/gi;
  if (fenced.test(out)) {
    out = out.replace(fenced, '');
    stripped = true;
  }

  const trailingSignal = /\s*\{\s*"?(signal|safety_state|safetyState)"?\s*:[\s\S]*\}\s*$/i;
  if (trailingSignal.test(out)) {
    out = out.replace(trailingSignal, '');
    stripped = true;
  }

  if (stripped) out = out.replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, stripped };
}
