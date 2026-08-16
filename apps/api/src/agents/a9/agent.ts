import { generateContent } from '../../lib/vertex-ai.js';
import { buildGovernancePrompt } from './prompts.js';
import type { GovernanceInput, GovernanceOutput, GovernanceState } from './types.js';

const VALID_STATES: ReadonlySet<string> = new Set(['Active', 'Restricted', 'Blocked']);

const FLASH_LITE_MODEL =
  process.env.GEMINI_FLASH_LITE_MODEL ?? 'gemini-2.5-flash';

export async function classifyGovernance(
  input: GovernanceInput,
): Promise<GovernanceOutput> {
  const systemInstruction = buildGovernancePrompt();

  try {
    const result = await generateContent({
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: input.message }] }],
      model: FLASH_LITE_MODEL,
      generationConfig: {
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
    });

    const parsed: unknown = JSON.parse(result.text);
    const state =
      typeof parsed === 'object' &&
      parsed !== null &&
      'governanceState' in parsed
        ? (parsed as Record<string, unknown>).governanceState
        : undefined;

    if (typeof state !== 'string' || !VALID_STATES.has(state)) {
      console.info(
        { governanceState: state, raw: result.text },
        'A9: invalid governance state, falling back to Restricted',
      );
      return { governanceState: 'Restricted', fallbackUsed: true };
    }

    console.info({ governanceState: state }, 'A9: classification complete');
    return { governanceState: state as GovernanceState, fallbackUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.info({ err: message }, 'A9: error, falling back to Restricted');
    return { governanceState: 'Restricted', fallbackUsed: true };
  }
}
