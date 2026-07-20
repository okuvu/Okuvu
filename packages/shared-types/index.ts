export const VERSION = '1.0.0'

export function getISTDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)

  const year = parts.find(p => p.type === 'year')!.value
  const month = parts.find(p => p.type === 'month')!.value
  const day = parts.find(p => p.type === 'day')!.value

  return `${year}-${month}-${day}`
}

export type SafetyState = 'S0' | 'S1' | 'S2' | 'S3' | 'S4'

export type GovernanceState = 'Active' | 'Restricted' | 'Blocked'

export interface RouterInput {
  safety_state: SafetyState | null | undefined
  governance_state?: GovernanceState | null
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
  payload?: {
    session_id?: string
  }
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

export type ErrorReason = 'INVALID_JSON' | 'UNKNOWN_FRAME_TYPE' | 'INVALID_PAYLOAD' | 'SESSION_CLOSED' | 'TURN_FAILED'

export interface ErrorFrame {
  type: 'ERROR'
  payload: {
    reason: ErrorReason
  }
}

export interface UserTurnFrame {
  type: 'USER_TURN'
  payload: {
    session_id: string
    message: string
  }
}

export interface AgentTurnFrame {
  type: 'AGENT_TURN'
  payload: {
    session_id: string
    message: string
    turn_count: number
    turn_id: string | null
    tts_url: string | null
  }
}

export interface CrisisSignalFrame {
  type: 'CRISIS_SIGNAL'
  payload: {
    session_id: string
  }
}

export type CloseReason = 'TURN_CAP' | 'IDLE_TIMEOUT' | 'USER_REQUESTED'

export interface SessionCloseFrame {
  type: 'SESSION_CLOSE'
  payload: Record<string, never>
}

export interface SessionClosedFrame {
  type: 'SESSION_CLOSED'
  payload: {
    session_id: string
    reason: CloseReason
    session_ended_at: string
  }
}

export type ClientFrame = SessionOpenFrame | UserTurnFrame | SessionCloseFrame
export type ServerFrame = SessionOpenConfirmedFrame | SessionOpenRejectedFrame | ErrorFrame | AgentTurnFrame | CrisisSignalFrame | SessionClosedFrame

// ─── Care Plan Types ─────────────────────────────────────────────

export type CarePlanId = 'CP1' | 'CP2' | 'CP3'
export type AssignmentState = 'provisional' | 'confirmed'

// ─── Consent Types ───────────────────────────────────────────────

export interface UserConsent {
  safety_monitoring: boolean
  mood_inference: boolean
  assessment: boolean
  emergency_contact: boolean
}

// ─── Emergency Contact ───────────────────────────────────────────

export interface EmergencyContactData {
  name: string | null
  phone: string | null
}

export interface SaveEmergencyContactBody {
  name: string
  phone: string
}

export interface ClearEmergencyContactBody {
  clear: true
}

export type PatchEmergencyContactBody = SaveEmergencyContactBody | ClearEmergencyContactBody

// ─── Session Summary ─────────────────────────────────────────────

export interface SessionSummaryView {
  session_id: string
  session_started_at: string
  turn_count: number
  summary: string | null
  session_feedback_score: number | null
}

// ─── Engagement Types ────────────────────────────────────────────

export interface EngagementStats {
  current_streak: number
  longest_streak: number
  voice_mode_enabled: boolean
  consent_1: boolean
  consent_2: boolean
  consent_3: boolean
  consent_4: boolean
}

// ─── Agent Context Bundle ────────────────────────────────────────

export interface AgentContextBundle {
  safety_state: SafetyState | null
  care_plan: {
    id: string
    care_plan_id: CarePlanId
    assignment_state: AssignmentState
  } | null
  recent_history: SessionSummaryView[]
  session_summary: string | null
  engagement: EngagementStats
}

// ─── Therapist Portal (T-01 Dashboard) ─────────────────────────

export type ClientCarePlan = {
  care_plan_id: CarePlanId
  assignment_state: AssignmentState
}

export interface ClientListItem {
  id: string
  phoneNumber: string
  carePlan: ClientCarePlan | null
  lastSessionDate: string | null
  safetyState: SafetyState | null
}
