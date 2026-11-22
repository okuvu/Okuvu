/**
 * The mood check-in's vocabulary — faces, feeling words, the strength scale and
 * the gentle card — in one place, because the api, the portal and the app must
 * agree about all four.
 *
 * The owner's instruction (22 Nov 2026) is the approved copy for this surface:
 * five faces with the words Awful / Low / Okay / Good / Great, the four feeling
 * groups, the strength question, and the gentle card's sentence and three
 * buttons. Nothing here is composed; every string is as it was given.
 *
 * The daily value stays 1-5 (`MoodLog.mood_value`), so every check-in written
 * before this change keeps its meaning: 1 = Awful … 5 = Great. The faces are a
 * rendering of that value, not a second scale.
 *
 * Kept as its own declared subpath (`@okuvu/shared-types/mood`) rather than
 * re-exported from `index.ts`: the api and worker load `index.ts` as raw TS at
 * container boot, and a sibling re-export added there resolves to `undefined`
 * or throws ERR_MODULE_NOT_FOUND in the container while passing `tsc` and
 * `vitest` locally.
 */

export const MOOD_MIN = 1
export const MOOD_MAX = 5

export type MoodFaceKey = 'awful' | 'low' | 'okay' | 'good' | 'great'

export interface MoodFace {
  /** The stored daily value. Unchanged since the first check-in. */
  value: 1 | 2 | 3 | 4 | 5
  key: MoodFaceKey
  /** The word under the face. */
  label: string
}

/** Oldest rating to newest: 1 = Awful … 5 = Great. */
export const MOOD_FACES: readonly MoodFace[] = [
  { value: 1, key: 'awful', label: 'Awful' },
  { value: 2, key: 'low', label: 'Low' },
  { value: 3, key: 'okay', label: 'Okay' },
  { value: 4, key: 'good', label: 'Good' },
  { value: 5, key: 'great', label: 'Great' },
] as const

/** The face for a stored value; null for anything outside 1-5. */
export function faceForMoodValue(value: number | null | undefined): MoodFace | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return MOOD_FACES.find((face) => face.value === value) ?? null
}

/** The word under the face, for a label a surface renders. Never composed. */
export function moodLabel(value: number | null | undefined): string | null {
  return faceForMoodValue(value)?.label ?? null
}

/**
 * The feeling words, in the owner's four groups. Group order is his; order
 * inside a group is his.
 */
export const FEELING_GROUPS: readonly { readonly title: string; readonly words: readonly string[] }[] = [
  { title: 'Group 1', words: ['anxious', 'angry', 'overwhelmed', 'restless'] },
  { title: 'Group 2', words: ['sad', 'lonely', 'tired', 'numb', 'hopeless'] },
  { title: 'Group 3', words: ['calm', 'relieved', 'content', 'grateful'] },
  { title: 'Group 4', words: ['happy', 'excited', 'hopeful', 'proud', 'motivated'] },
] as const

/** Every word a chip can send, flattened. 18 in total. */
export const FEELING_WORDS: readonly string[] = FEELING_GROUPS.flatMap((group) => group.words)

export function isFeelingWord(value: unknown): value is string {
  return typeof value === 'string' && FEELING_WORDS.includes(value)
}

/** Up to three, no repeats. */
export const MAX_FEELING_WORDS = 3

/** "Something else" opens a small text box; this is as long as it may be. */
export const FEELING_OTHER_MAX = 120

export const FEELING_QUESTION = 'Any words for this?'
export const FEELING_SKIP_LABEL = 'Skip'
export const FEELING_OTHER_LABEL = 'Something else'

/** The optional strength slider. 1 = a little, 5 = a lot. */
export const STRENGTH_MIN = 1
export const STRENGTH_MAX = 5
export const STRENGTH_QUESTION = 'How strong is this feeling?'
export const STRENGTH_LOW_LABEL = 'a little'
export const STRENGTH_HIGH_LABEL = 'a lot'

/**
 * The two words that, when chosen, show the gentle card after the save.
 *
 * This is a card, not an alert: no safety flag is written and nothing is sent to
 * the therapist because of these two words. The card offers support and the
 * client chooses.
 */
export const HEAVY_FEELING_WORDS: readonly string[] = ['hopeless', 'numb'] as const

export function showsGentleCard(words: readonly string[] | null | undefined): boolean {
  if (!Array.isArray(words)) return false
  return words.some((word) => HEAVY_FEELING_WORDS.includes(word))
}

/** The gentle card, verbatim. One sentence, one line, as given. */
export const GENTLE_CARD_LINE =
  "That sounds really heavy. You don't have to sit with this alone. Would you like some support right now?"

export const GENTLE_CARD_BUTTONS = {
  chat: 'Talk in chat',
  supportLines: 'See support lines',
  notNow: 'Not now',
} as const

/** One saved check-in, as the client's own list and the portal both read it. */
export interface MoodEntry {
  id: string
  /** Calendar date, IST, `YYYY-MM-DD`. */
  date: string
  /** 1-5, unchanged since the first check-in. */
  moodValue: number
  /** The word under the face, resolved server-side. */
  moodLabel: string
  /** The chips the client chose, in the order the api stored them. */
  feelingWords: string[]
  /** The "Something else" text, when the client wrote one. */
  feelingOther: string | null
  /** 1-5 or null; null means the client left the slider alone. */
  strength: number | null
  /** Private by default; only the client's own toggle changes it. */
  shared: boolean
}
