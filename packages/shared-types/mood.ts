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

// ─── The weekly summary ───────────────────────────────────────────────────

/**
 * One day of the week, in the client's own words.
 *
 * There is no number here on purpose. The summary says what the client chose,
 * never how the week scored: no average, no level, no band, no "you improved".
 */
export interface WeeklyMoodDay {
  /** Calendar date, IST, `YYYY-MM-DD`. */
  date: string
  /** The word under the face they picked, verbatim. */
  moodLabel: string
  /** The chips they chose that day, verbatim. */
  feelingWords: string[]
}

export interface WeeklyMoodSummary {
  /** Days in the window that have a check-in. */
  recordedDays: number
  /** Days in the window, always 7. */
  windowDays: number
  /** The saved days, oldest first. */
  days: WeeklyMoodDay[]
  /**
   * Feeling words the client chose on more than one day, most days first.
   * Ties keep the order they were first chosen in.
   */
  repeatedFeelings: string[]
  /**
   * The summary in plain sentences, ready to show. Written for the client and
   * about their own words — the api composes nothing on top of this.
   */
  sentences: string[]
}

/** The week the summary covers. Fixed, so the copy can name it. */
export const WEEKLY_SUMMARY_DAYS = 7

/**
 * Write the week back in words.
 *
 * Deliberately arithmetic-free beyond counting days: counting how many days have
 * a check-in is a fact the client can see for themselves, while an average mood
 * is a score by another name. Nothing here is ranked, and no feeling word is
 * described as better or worse than another.
 */
export function weeklyMoodSummary(
  entries: readonly MoodEntry[],
  windowDays: number = WEEKLY_SUMMARY_DAYS,
): WeeklyMoodSummary {
  const days: WeeklyMoodDay[] = entries
    // A row with no date or no face cannot be described in the client's own
    // words, and inventing a word for it would be putting words in their mouth.
    // The stored value is constrained 1-5, so this drops only corrupt data.
    .filter((e) => typeof e.date === 'string' && e.date.length > 0 && typeof e.moodLabel === 'string')
    .map((e) => ({
      date: e.date,
      moodLabel: e.moodLabel as string,
      feelingWords: Array.isArray(e.feelingWords) ? [...e.feelingWords] : [],
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const recordedDays = days.length

  // Which feeling words came back, and on how many separate days. A word chosen
  // twice on one day counts as one day: the summary is about days, not chips.
  const dayCounts = new Map<string, number>()
  const firstSeen = new Map<string, number>()
  let order = 0
  for (const day of days) {
    const seenToday = new Set<string>()
    for (const word of day.feelingWords) {
      if (!firstSeen.has(word)) firstSeen.set(word, order++)
      if (seenToday.has(word)) continue
      seenToday.add(word)
      dayCounts.set(word, (dayCounts.get(word) ?? 0) + 1)
    }
  }
  const repeatedFeelings = [...dayCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0))
    .map(([word]) => word)

  const sentences = weeklyMoodSentences(days, repeatedFeelings, windowDays)

  return { recordedDays, windowDays, days, repeatedFeelings, sentences }
}

/** The sentences alone, so a caller that has no entries can still ask for the empty week. */
function weeklyMoodSentences(
  days: readonly WeeklyMoodDay[],
  repeatedFeelings: readonly string[],
  windowDays: number,
): string[] {
  if (days.length === 0) {
    return [
      `No check-ins in the last ${windowDays} days yet. There's no wrong time to start.`,
    ]
  }

  const out: string[] = []

  if (days.length === 1) {
    out.push(`You checked in once in the last ${windowDays} days.`)
  } else {
    out.push(`You checked in on ${days.length} of the last ${windowDays} days.`)
  }

  if (repeatedFeelings.length > 0) {
    out.push(`The word${repeatedFeelings.length > 1 ? 's' : ''} you came back to: ${joinWords(repeatedFeelings)}.`)
  }

  if (days.length === 1) {
    out.push(`That day you picked ${days[0].moodLabel}.`)
  } else {
    const first = days[0]
    const last = days[days.length - 1]
    if (first.moodLabel === last.moodLabel) {
      out.push(`You started and ended the week at ${first.moodLabel}.`)
    } else {
      out.push(`The week opened at ${first.moodLabel} and closed at ${last.moodLabel}.`)
    }
  }

  return out
}

/** "a, b and c" — no Oxford comma, matching the rest of the client copy. */
function joinWords(words: readonly string[]): string {
  if (words.length === 0) return ''
  if (words.length === 1) return words[0]
  if (words.length === 2) return `${words[0]} and ${words[1]}`
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}
