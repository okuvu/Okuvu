import type { SafetyState } from '@okuvu/shared-types'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface A1Input {
  message: string
  recentHistory?: ConversationTurn[]
}

export type A1Basis = 'literal' | 'contextual' | 'ambiguous'
export type A1SignalStrength = 'high' | 'medium' | 'low'

export interface A1Output {
  safetyState: SafetyState
  fallbackUsed: boolean
  crisis_language_detected: boolean
  basis: A1Basis
  signal_strength: A1SignalStrength
  notes: string | null
}
