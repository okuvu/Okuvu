export type GovernanceState = 'Active' | 'Restricted' | 'Blocked';

export type GovernanceReasonCode =
  | 'diagnosis_request'
  | 'medication_request'
  | 'injection_attempt'
  | 'roleplay_bypass'
  | 'third_party_harm'
  | 'boundary_repeat'
  | 'safety_relevant_defer'
  | 'venting_anger';

export type GovernanceConfidence = 'high' | 'medium' | 'low';

export interface GovernanceInput {
  userId: string;
  message: string;
}

export interface GovernanceOutput {
  governanceState: GovernanceState;
  fallbackUsed: boolean;
  reasonCode: GovernanceReasonCode | null;
  confidence: GovernanceConfidence;
  notes: string | null;
}
