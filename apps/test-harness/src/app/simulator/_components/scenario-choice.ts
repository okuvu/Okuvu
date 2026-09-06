import { PERSONA_LABELS, type PersonaId } from '@/lib/persona-scripts';

/**
 * A scenario choice is one of the 4 built-in personas, or "custom" — write
 * your own opening message instead of a canned script. "custom" never gets
 * sent to the backend as a personaId (it stays undefined there, same as
 * picking nothing at all) — it only changes what the chat input prefills
 * with client-side.
 */
export type ScenarioChoice = PersonaId | 'custom';

export function choiceLabel(choice: ScenarioChoice): string {
  return choice === 'custom' ? 'Custom scenario' : PERSONA_LABELS[choice];
}
