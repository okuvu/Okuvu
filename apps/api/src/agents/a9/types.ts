export type GovernanceState = 'Active' | 'Restricted' | 'Blocked';

export interface GovernanceInput {
  userId: string;
  message: string;
}

export interface GovernanceOutput {
  governanceState: GovernanceState;
  fallbackUsed: boolean;
}
