export type A9PostViolationType =
  | 'helpline_fabrication'
  | 'false_alert_claim'
  | 'diagnosis_explicit'
  | 'diagnosis_covert'
  | 'medication_content'
  | 'impersonation'
  | 'direct_advice'
  | 'outcome_promise'
  | 'cognitive_reframe'
  | 'causal_attribution'
  | 'third_party_clinical'
  | 'safety_state_mismatch'
  | 'prohibited_topic'
  | 'parse_failure';

export interface A9PostResult {
  decision: 'APPROVED' | 'BLOCKED';
  violation_type: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

export interface A9PostInput {
  /** A2's full draft reply — the text under review (text only; machine signal already stripped). */
  draftResponse: string;
  safetyState: string;
  carePlan: string;
  /** Additive, null-safe (OKUVU v2.0): defaults to 'english' until the mirror-mode pipeline lands. */
  languageMode?: 'english' | 'mirror';
  /** Additive, null-safe (OKUVU v2.0): broad care-plan focus text, not yet wired from the orchestrator. */
  carePlanFocus?: string | null;
}
