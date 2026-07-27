export interface A9PostResult {
  decision: 'APPROVED' | 'BLOCKED';
  violation_type: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface A9PostInput {
  userContent: string;
  safetyState: string;
  carePlan: string;
}
