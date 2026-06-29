import type { CarePlan, OnboardingInferenceOutput } from '../agents/a2/types.js';

export type AssignmentState = 'provisional' | 'confirmed';

export interface ScoredTurn extends OnboardingInferenceOutput {}

export interface AssignmentResult {
  care_plan_id: CarePlan;
  assignment_state: AssignmentState;
  confidence_at_last_eval: number;
  turns_evaluated: number;
  reasoning_note: string;
}

const CONFIRMATION_CONFIDENCE_THRESHOLD = 0.70;
const MIN_CONFIRMATION_TURNS = 3;
const TIEBREAK_EPSILON = 0.05;
const MINIMAL_SCORE_FLOOR = 0.3;

const DOMAIN_TO_CARE_PLAN: Record<string, CarePlan> = {
  anxiety: 'CP1',
  depression: 'CP2',
  stress: 'CP3',
};

const DOMAIN_FIELDS: ReadonlyArray<keyof OnboardingInferenceOutput> = [
  'anxiety_score',
  'depression_score',
  'stress_score',
] as const;

function getDomainScores(
  turn: OnboardingInferenceOutput,
): Array<{ domain: string; score: number }> {
  return DOMAIN_FIELDS.map((field) => ({
    domain: field.replace('_score', ''),
    score: turn[field] as number,
  }));
}

function domainScoreSum(
  turns: OnboardingInferenceOutput[],
  domain: string,
): number {
  const field = `${domain}_score` as keyof OnboardingInferenceOutput;
  return turns.reduce((sum, t) => sum + (t[field] as number), 0);
}

function allBelowFloor(turns: ScoredTurn[]): boolean {
  return turns.every((t) =>
    DOMAIN_FIELDS.every((field) => (t[field] as number) < MINIMAL_SCORE_FLOOR),
  );
}

function selectCarePlan(turns: ScoredTurn[]): CarePlan {
  const last = turns[turns.length - 1];
  const scores = getDomainScores(last);

  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0].score;
  const tied = scores.filter((s) => topScore - s.score < TIEBREAK_EPSILON);

  if (tied.length > 1) {
    tied.sort((a, b) => {
      const cumA = domainScoreSum(turns, a.domain);
      const cumB = domainScoreSum(turns, b.domain);
      return cumB - cumA;
    });

    const best = tied[0];
    const runnerUp = tied[1];
    const cumBest = domainScoreSum(turns, best.domain);
    const cumRunnerUp = domainScoreSum(turns, runnerUp.domain);

    if (Math.abs(cumBest - cumRunnerUp) < TIEBREAK_EPSILON) {
      return 'CP1';
    }

    return DOMAIN_TO_CARE_PLAN[best.domain] ?? 'CP1';
  }

  return DOMAIN_TO_CARE_PLAN[scores[0].domain] ?? 'CP1';
}

function buildReasoningNote(turns: ScoredTurn[]): string {
  return turns
    .map((t, i) => `Turn ${i + 1}: ${t.reasoning_note}`)
    .join(' | ');
}

export function decideAssignment(turns: ScoredTurn[]): AssignmentResult {
  const turns_evaluated = turns.length;

  if (turns_evaluated === 0) {
    return {
      care_plan_id: 'CP1',
      assignment_state: 'provisional',
      confidence_at_last_eval: 0,
      turns_evaluated: 0,
      reasoning_note: 'No scoring turns available — defaulting to CP1 provisional',
    };
  }

  const last = turns[turns_evaluated - 1];
  const confidence_at_last_eval = last.confidence;

  if (allBelowFloor(turns)) {
    return {
      care_plan_id: 'CP1',
      assignment_state: 'provisional',
      confidence_at_last_eval,
      turns_evaluated,
      reasoning_note: `All domain scores remained below minimal floor (${MINIMAL_SCORE_FLOOR}) across all turns — defaulting to CP1 provisional. Per-turn notes: ${buildReasoningNote(turns)}`,
    };
  }

  const care_plan_id = selectCarePlan(turns);

  const assignment_state: AssignmentState =
    confidence_at_last_eval >= CONFIRMATION_CONFIDENCE_THRESHOLD &&
    turns_evaluated >= MIN_CONFIRMATION_TURNS
      ? 'confirmed'
      : 'provisional';

  return {
    care_plan_id,
    assignment_state,
    confidence_at_last_eval,
    turns_evaluated,
    reasoning_note: buildReasoningNote(turns),
  };
}
