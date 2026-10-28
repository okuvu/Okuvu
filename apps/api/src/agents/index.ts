export { classifySafety } from './a1/agent.js'
export { routeTurn } from './a8-router.js'
export { classifyGovernance } from './a9/agent.js'
export { a9PostReview } from './a9-post/agent.js'
export { handleTurn } from './a2/agent.js'

// ─── 15-agent expansion (A3–A7, A10–A15) ──────────────────────────────────
// Process specialists: payload only, never client-facing text.
export { restructureThought } from './a3/agent.js'
export { buildActivationPlan } from './a4/agent.js'
export { planInterpersonalSkill } from './a5/agent.js'
export { exploreValues } from './a6/agent.js'
export { prepareTransition } from './a7/agent.js'
// A8 second half: which specialists contribute to this turn (<=2).
export { selectSpecialists } from './a8-selection.js'
// Therapist-facing and internal — never in the client's turn text.
export { generateInsights } from './a10/agent.js'
export { aggregateLearning } from './a11/agent.js'
// Sole writer of client-facing text, and sole writer of audio.
export { compile as compileContent } from './a12/agent.js'
export { synthesise } from './a13/agent.js'
// Deterministic, non-diagnostic measurement and continuity.
export { scoreAssessment } from './a14/scoring.js'
export { assessSubmission } from './a14/agent.js'
export { applyMemoryUpdate, emptyMemoryState } from './a15/memory.js'
export { updateMemory, buildMemoryContext } from './a15/agent.js'
// Roster + authority rules, enforced as data.
export { ROSTER, ROSTER_BY_ID, getAgent, validateRoster, assertValidRoster, MAX_SPECIALISTS_PER_TURN } from './roster.js'
