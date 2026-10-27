/**
 * The payload contract shared by every process specialist.
 *
 * A payload is structured intent — what the specialist wants to happen — not
 * prose. A12 renders it. Keeping this discriminated union in one file means
 * A12 can never silently accept a shape it does not know how to render, and
 * A8's selection output is typed against the same vocabulary.
 */

export type SpecialistPayloadType =
  | 'cognitive_restructuring'
  | 'behavioural_activation'
  | 'interpersonal_skills'
  | 'meaning_values'
  | 'maintenance_transition';

export interface CognitiveRestructuringPayload {
  type: 'cognitive_restructuring';
  /** The client's own words, verbatim from their message. Never paraphrased. */
  thought: string;
  distortion: DistortionType;
  evidence_for: string[];
  evidence_against: string[];
  /** Offered as a question or possibility, never asserted as the truth. */
  alternative_thought: string;
  confidence: 'high' | 'medium' | 'low';
}

export type DistortionType =
  | 'all_or_nothing'
  | 'catastrophising'
  | 'mind_reading'
  | 'should_statements'
  | 'labelling'
  | 'discounting_positive'
  | 'emotional_reasoning'
  | 'overgeneralising'
  | 'personalisation'
  | 'none_identified';

export interface BehaviouralActivationPayload {
  type: 'behavioural_activation';
  /** One concrete action, small enough to start today. */
  action: string;
  /** When the client intends to do it, in their own framing ('after dinner'). */
  when: string | null;
  /** Why this action connects to what they said, in one clause. */
  rationale: string;
  /** 0–10 predicted difficulty, self-rated framing, never a clinical score. */
  predicted_difficulty: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface InterpersonalSkillsPayload {
  type: 'interpersonal_skills';
  skill: InterpersonalSkill;
  /** The relationship or situation named by the client. */
  situation: string;
  /** A short, literal example of what they could say. */
  example_words: string;
  /** What the skill is for, tied to the client's stated goal. */
  purpose: string;
  confidence: 'high' | 'medium' | 'low';
}

export type InterpersonalSkill =
  | 'boundary_setting'
  | 'repair'
  | 'asking_for_help'
  | 'refusing'
  | 'asserting_a_need';

export interface MeaningValuesPayload {
  type: 'meaning_values';
  /** The value the client's own words point at. */
  value: string;
  /** Where it showed up in what they said. */
  evidence: string;
  /** One small step in that direction — not a life plan. */
  next_step: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface MaintenanceTransitionPayload {
  type: 'maintenance_transition';
  /** What has actually changed, anchored to something the client described. */
  gain: string;
  /** The client's own strategy worth keeping. */
  anchor: string;
  /** Preparation for less frequent contact. */
  plan: string;
  confidence: 'high' | 'medium' | 'low';
}

export type SpecialistPayload =
  | CognitiveRestructuringPayload
  | BehaviouralActivationPayload
  | InterpersonalSkillsPayload
  | MeaningValuesPayload
  | MaintenanceTransitionPayload;

export const PAYLOAD_TYPES: ReadonlySet<string> = new Set<SpecialistPayloadType>([
  'cognitive_restructuring',
  'behavioural_activation',
  'interpersonal_skills',
  'meaning_values',
  'maintenance_transition',
]);
