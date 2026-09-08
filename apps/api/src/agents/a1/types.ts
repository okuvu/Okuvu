import type { SafetyState } from '@okuvu/shared-types'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface A1Input {
  message: string
  recentHistory?: ConversationTurn[]
}

export interface A1Output {
  safetyState: SafetyState
  fallbackUsed: boolean
}
