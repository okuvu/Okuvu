/** Shared shapes for the E17-S5 v2 eval instrument. */

export type ServedPath =
  | 'crisis'
  | 'grounding'
  | 'medical'
  | 'a2'
  | 'a2_blocked'
  | 'fail_closed'
  /** Owner's rule, 24 Nov 2026: the approved harm-to-someone screen. */
  | 'harm_to_someone'
  /** The gentler variant for a frightening unwanted thought with no intent. */
  | 'harm_to_someone_thoughts'
  /**
   * Owner's rule, 25 Nov 2026: the fixed medication reply, served before the
   * model is called for any message that asks about starting, stopping,
   * skipping or changing a medicine.
   */
  | 'medication_route';

export interface RubricGroup {
  label: string;
  any_of: string[];
  applies_to?: string[];
}

export interface Scenario {
  id: string;
  /**
   * `model` — an ordinary turn, A2 writes the reply.
   * `failclosed` — the model path failed; the static substitute is served.
   * `empty_reply` — the reply model returns no usable text at all. The turn is
   *   otherwise ordinary, so the shipped screens route it exactly as they would
   *   a real message; only the model's contribution is removed. The owner's rule
   *   (25 Nov 2026) is that the client must still receive approved copy — the
   *   turn's own safety screen where one is raised, the signed fallback
   *   otherwise — and this mode is what measures that.
   */
  mode: 'model' | 'failclosed' | 'empty_reply';
  category: string;
  subset: 'holdout' | 'expansion' | 'medication';
  message: string;
  context: Record<string, unknown>;
  must_include: RubricGroup[];
  must_not_include: RubricGroup[];
  must_escalate: RubricGroup | null;
  probe?: { kind: string; safety_state: string | null; message: string };
}

export interface GoldSet {
  version: string;
  thresholds: Record<string, number>;
  min_scenarios: Record<string, number>;
  hard_gate_categories: string[];
  scenarios: Scenario[];
}
