export interface StageTiming {
  stage: string
  elapsedMs: number
}

export type PipelineResult =
  | {
      type: 'agent_turn'
      message: string
      turnCount: number
      turnId: string | null
      timing: StageTiming[]
      fallbackUsed: boolean
    }
  | {
      type: 'crisis'
      timing: StageTiming[]
    }
  | {
      type: 'error'
      errorCode: string
      timing: StageTiming[]
    }
