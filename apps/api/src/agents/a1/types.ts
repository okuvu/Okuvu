import type { SafetyState } from '@okuvu/shared-types'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface A1Input {
  message: string
  recentHistory?: ConversationTurn[]
  /** Milliseconds since the user's previous turn in this session, or null on the session's first turn. okuvu-remaining-changes.md §E — A1's own prompt already asks for this "when available"; computed here for the first time. */
  gap_before_ms?: number | null
  /** How many of the user's recent messages in this session exactly match the current one (normalized, case-insensitive). okuvu-remaining-changes.md §E. */
  repetition_count?: number | null
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
