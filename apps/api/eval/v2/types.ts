/** Shared shapes for the E17-S5 v2 eval instrument. */

export type ServedPath = 'crisis' | 'grounding' | 'medical' | 'a2' | 'a2_blocked' | 'fail_closed';

export interface RubricGroup {
  label: string;
  any_of: string[];
  applies_to?: string[];
}

export interface Scenario {
  id: string;
  mode: 'model' | 'failclosed';
  category: string;
  subset: 'holdout' | 'expansion';
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
