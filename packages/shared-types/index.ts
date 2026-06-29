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

// ─── WebSocket Frame Types ───────────────────────────────────────

export interface SessionOpenFrame {
  type: 'SESSION_OPEN'
  payload: Record<string, never>
}

export type SessionOpenRejectionReason =
  | 'DAILY_LIMIT_EXCEEDED'
  | 'USER_NOT_FOUND'
  | 'INTERNAL_ERROR'

export interface SessionOpenConfirmedFrame {
  type: 'SESSION_OPEN_CONFIRMED'
  payload: {
    session_id: string
    session_started_at: string
    crisis_bypass: boolean
  }
}

export interface SessionOpenRejectedFrame {
  type: 'SESSION_OPEN_REJECTED'
  payload: {
    reason: SessionOpenRejectionReason
    retry_after?: string
  }
}

export interface ErrorFrame {
  type: 'ERROR'
  payload: {
    reason: 'INVALID_JSON' | 'UNKNOWN_FRAME_TYPE'
  }
}

export type ClientFrame = SessionOpenFrame
export type ServerFrame = SessionOpenConfirmedFrame | SessionOpenRejectedFrame | ErrorFrame

// ─── Agent Context Bundle ────────────────────────────────────────

export interface AgentContextBundle {
  safety_state: SafetyState | null
  care_plan: {
    care_plan_id: 'CP1' | 'CP2' | 'CP3'
    assignment_state: 'provisional' | 'confirmed'
  } | null
  recent_history: Array<{
    session_id: string
    session_started_at: string
    turn_count: number
    session_feedback_score: number | null
    summary: string | null
  }>
  session_summary: string | null
  engagement: {
    streak: number
    voice_enabled: boolean
  }
}
