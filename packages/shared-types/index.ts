export const VERSION = '1.0.0'

export type SafetyState = 'S0' | 'S1' | 'S2' | 'S3' | 'S4'

export interface RouterInput {
  safety_state: SafetyState | null | undefined
  session_count: number | undefined
  turn_count: number | undefined
}

export interface RouterDecision {
  agent: 'crisis' | 'A2'
  mode?: 'normal' | 'grounding-only' | 'alliance-building'
}
