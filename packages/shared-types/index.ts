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

export const SAFETY_LABELS: Record<SafetyState, string> = {
  S0: 'Stable',
  S1: 'Low',
  S2: 'Elevated',
  S3: 'High',
  S4: 'Critical',
}

export type GovernanceState = 'Active' | 'Restricted' | 'Blocked'

export interface RouterInput {
  safety_state: SafetyState | null | undefined
  governance_state?: GovernanceState | null
  session_count: number | undefined
  turn_count: number | undefined
}

export interface RouterDecision {
  /**
   * 'deterministic-grounding' (OKUVU v2.0) means A1 classified this turn S3
   * (elevated risk) — same tier of determinism as 'crisis' (S4), checked
   * before governance so a policy-level Blocked verdict can never downgrade
   * an elevated-risk user to a static policy-boundary reply. Unlike
   * 'crisis', this still gets a real, persisted, grounding-oriented reply —
   * A2 is simply never called for the turn at all.
   */
  agent: 'crisis' | 'deterministic-grounding' | 'A2'
  /**
   * 'blocked' means A9-pre (governance/policy) rejected the message but A1
   * (clinical safety) did NOT find crisis-level risk (safetyState !== 'S4'
   * and !== 'S3'). This must never be conflated with 'crisis' — crisis is
   * an A1-only decision. A 'blocked' turn still gets a real (static,
   * non-LLM) response and a persisted Turn, unlike the crisis silence path.
   */
  mode?: 'normal' | 'blocked'
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
    tool_card?: ToolCardConfig
  }
}

// ─── Tool Card Types ──────────────────────────────────────────────

export type ToolCardType = 'guided_breathing' | 'box_breathing' | 'grounding_5431'

export interface BreathingConfig {
  inhale_seconds: number
  hold_seconds: number
  exhale_seconds: number
  cycles: number
  label: string
}

export interface ToolCardConfig {
  type: ToolCardType
  breathing_config?: BreathingConfig
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

export interface GroundingResult {
  see: string[]
  touch: string[]
  hear: string[]
  smell: string[]
  taste: string[]
}

export interface ToolResultFrame {
  type: 'TOOL_RESULT'
  payload: {
    session_id: string
    tool_type: 'grounding_5431'
    result: GroundingResult
  }
}

export type ClientFrame = SessionOpenFrame | UserTurnFrame | SessionCloseFrame | ToolResultFrame
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

export interface UserMemoryData {
  life_context: string[]
  current_stressors: string[]
  recurring_themes: string[]
  what_helps: string[]
  what_doesnt_help: string[]
  significant_events: string[]
  emotional_baseline: string | null
  session_count: number
}

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
  user_memory: UserMemoryData | null
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

// ─── Journal Types ──────────────────────────────────────────────

export type JournalEmotion = 'anxious' | 'sad' | 'angry' | 'overwhelmed' | 'numb' | 'calm' | 'hopeful' | 'other'

export interface JournalEntryView {
  id: string
  emotion: JournalEmotion
  intensity: number
  content: string
  created_at: string
}

export interface CreateJournalEntryBody {
  emotion: JournalEmotion
  intensity: number
  content: string
}

// ─── Test Harness Types (TH-S03) ─────────────────────────────────

export type TestEnvironment = 'sandbox' | 'staging' | 'beta'

export type TestRunStatus = 'running' | 'pass' | 'halt' | 'warning' | 'error'

export type CorpusCaseType = 'safety' | 'fidelity' | 'adversarial' | 'persona'

export type TestAgentId =
  | 'A1'
  | 'A2'
  | 'A8'
  | 'A9-pre'
  | 'A9-post'
  | 'A10A'
  | 'A13'
  | 'A15'

export type HarnessRole = 'PI' | 'RATER' | 'ENGINEER'

export interface PipelineSignal {
  boundary: string
  agent: TestAgentId | 'orchestrator'
  payload: unknown
  timestamp: string
}

export interface FrozenTripleMetadata {
  modelVersion: string
  /** LLM provider the pinned modelVersion runs on ('gemini' | 'openrouter'). Optional/omittable for pins captured before providers were tracked — absence means 'gemini', the only provider that existed then. */
  provider?: string
  promptHash: string
  temperature: number
  safetySettings: string
  suiteVersion: string
  inputId: string
  timestamp: string
  rawOutput: string
}

export interface TestResult {
  id: string
  runId: string
  agentId: TestAgentId
  input: unknown
  output: unknown
  latencyMs: number
  signals: PipelineSignal[]
  mockMode: boolean
  status: TestRunStatus
}

export interface AgentDependency {
  agent: string
  requiredBy: string[]
  autoActivated: boolean
  mockMode?: boolean
}

export interface TestRun {
  id: string
  environment: TestEnvironment
  altitude: 1 | 2 | 3
  agent?: TestAgentId
  status: TestRunStatus
  frozenTriple: FrozenTripleMetadata
  results: TestResult[]
  createdAt: string
  completedAt?: string
  activatedAgents: string[]
  manuallySelectedAgents: string[]
  dependencyGraph: AgentDependency[]
}

export interface BlindedReviewItem {
  id: string
  runId: string
  output: string
  rubricScores: Record<string, number>
  raterId?: string
  unblinded?: boolean
}

export type CorpusDataOrigin = 'synthetic' | 'paraphrased' | 'real'

export interface CorpusCase {
  id: string
  type: CorpusCaseType
  version: number
  input: string
  expectedOutput?: string
  tags: string[]
  createdAt: string
  updatedAt: string
  dataOrigin?: CorpusDataOrigin
  /** Null for a golden, hand-authored seed case; set to the seed's id for a case-factory-generated variation. */
  seedId?: string | null
  /** True when a case-factory mutation may have changed what expectedOutput should be — needs human confirmation before it's trusted for grading/gating. */
  adjudicationRequired?: boolean
}
