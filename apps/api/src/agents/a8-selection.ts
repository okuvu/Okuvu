import type { GovernanceState, SafetyState } from '@okuvu/shared-types';
import { MAX_SPECIALISTS_PER_TURN } from './roster.js';

/**
 * A8, part two: choosing the specialists. `routeTurn()` in a8-router.ts already
 * decides the *path* (crisis / grounding / A2). This decides *which* process
 * specialists contribute payloads to that path.
 *
 * Deliberately deterministic and cue-based, not a model call:
 *
 *  - selection is the one decision a client can be steered by, and a
 *    temperature-0 model still varies across provider or prompt-version
 *    changes. Selection has to be reproducible to be regression-testable.
 *  - at S3/S4 and under a Blocked verdict it returns nothing. A8 does not get
 *    to decide that a guided technique is still appropriate because the cue
 *    matched; the router's safety gates already decided otherwise.
 *  - the cap is two. Three techniques in one reply is a leaflet, and the
 *    client is already carrying more than they can hold.
 */

export interface SpecialistSelectionInput {
  message: string;
  safetyState: SafetyState;
  governanceState?: GovernanceState | null;
  sessionCount?: number;
}

export interface SpecialistSelection {
  specialists: string[];
  rationale: string;
  blocked: boolean;
}

interface Cue {
  id: string;
  patterns: RegExp[];
  /** Higher wins when more than two cues fire. Ties break by this order. */
  weight: number;
  minSessions?: number;
}

// Weights encode clinical ordering, not frequency: a thought that is driving
// the distress goes before a values exploration, which is a longer arc.
const CUES: readonly Cue[] = [
  {
    id: 'A3',
    weight: 50,
    patterns: [
      /\b(always|never|everyone|no one|nobody|everybody)\b/i,
      /\b(useless|worthless|failure|stupid|idiot|pathetic|hopeless)\b/i,
      /\bi (should|must|ought to)\b/i,
      /\b(they think|he thinks|she thinks|they all)\b/i,
      /\b(means|proves|obviously) (that )?i\b/i,
      /\b(ruin|disaster|worst|catastroph)/i,
    ],
  },
  {
    id: 'A4',
    weight: 40,
    patterns: [
      /\b(can'?t|don'?t want to|cannot) (get out of bed|do anything|move|face)\b/i,
      /\b(no energy|exhausted|drained|numb|nothing feels)\b/i,
      /\b(stopped going|withdrawn|isolat|avoiding everything)\b/i,
      /\b(sitting|lying) (in bed|on the sofa) all day\b/i,
    ],
  },
  {
    id: 'A5',
    weight: 35,
    patterns: [
      /\b(mother|father|mum|mom|dad|parents|husband|wife|partner|girlfriend|boyfriend|friend|boss|colleague|manager|sister|brother)\b/i,
      /\b(boundary|boundaries|said no|couldn'?t say no|argument|fight|confront|apologis|apologiz)\b/i,
      /\b(they keep asking|keeps asking me|pressure[d]? me)\b/i,
    ],
  },
  {
    id: 'A6',
    weight: 25,
    patterns: [
      /\b(point of|meaning|meaningless|why bother|what'?s the use|matters to me|values)\b/i,
      /\b(future|direction|purpose|lost myself|who i am)\b/i,
    ],
  },
  {
    id: 'A7',
    weight: 20,
    minSessions: 8,
    patterns: [
      /\b(better than|improving|getting better|less often|ending|last few sessions|on my own soon)\b/i,
      /\b(do i still need|reduce|fewer sessions|stop coming)\b/i,
    ],
  },
];

export function selectSpecialists(input: SpecialistSelectionInput): SpecialistSelection {
  if (!input || typeof input.message !== 'string') {
    return { specialists: [], rationale: 'invalid_input', blocked: true };
  }

  if (input.safetyState === 'S3' || input.safetyState === 'S4') {
    return { specialists: [], rationale: `safety_gated_${input.safetyState}`, blocked: true };
  }

  if (input.governanceState === 'Blocked') {
    return { specialists: [], rationale: 'governance_blocked', blocked: true };
  }

  const sessionCount = typeof input.sessionCount === 'number' && Number.isFinite(input.sessionCount)
    ? input.sessionCount
    : 0;

  const scored = CUES
    .filter((cue) => (cue.minSessions === undefined ? true : sessionCount >= cue.minSessions))
    .map((cue) => ({
      id: cue.id,
      weight: cue.weight,
      hits: cue.patterns.filter((p) => p.test(input.message)).length,
    }))
    .filter((cue) => cue.hits > 0)
    .sort((a, b) => (b.hits !== a.hits ? b.hits - a.hits : b.weight - a.weight));

  if (scored.length === 0) {
    // A2 is the emotion-regulation base: name it, validate it, settle it. It is
    // the correct default when nothing more specific is indicated.
    return { specialists: ['A2'], rationale: 'default_emotion_regulation', blocked: false };
  }

  const chosen = scored.slice(0, MAX_SPECIALISTS_PER_TURN).map((cue) => cue.id);
  return {
    specialists: chosen,
    rationale: `cues:${scored.map((c) => `${c.id}=${c.hits}`).join(',')}`,
    blocked: false,
  };
}
