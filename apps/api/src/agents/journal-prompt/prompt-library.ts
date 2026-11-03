/**
 * The journal prompt library — the single source of journaling prompts the
 * app offers when the user taps "Get a prompt".
 *
 * Why a library rather than generated text: every sentence a client-facing
 * surface shows has to be reviewable before it reaches a person in distress,
 * and a model's output cannot be read in advance. These sentences are fixed,
 * to be read and signed off by the clinical lead (see
 * JOURNAL_PROMPT_CLINICAL_REVIEW), and the app now serves them verbatim.
 *
 * Rules every entry has to hold (enforced by validatePromptLibrary, and run
 * against this exact list in __tests__/journal-prompt-library.test.ts):
 *   - one sentence, phrased as a question or a gentle instruction
 *   - plain, warm, non-clinical language; no therapy jargon
 *   - nothing about diagnoses, medication, or crisis/self-harm
 *   - "body" is allowed only as a noticing instruction, never as a symptom
 *
 * Grouping is by the feeling the user picked on the journal screen, plus
 * 'any' for entries with no mood selected (which the app treats as the
 * default pool). Selection prefers the matching group and mixes in the
 * general pool, so a mood-less entry still gets a real prompt.
 */

export type PromptGroup =
  | 'anxious'
  | 'sad'
  | 'angry'
  | 'overwhelmed'
  | 'numb'
  | 'calm'
  | 'hopeful'
  | 'other'
  | 'any';

export interface LibraryPrompt {
  /** Stable id — the key clinical sign-off and telemetry refer to. */
  id: string;
  group: PromptGroup;
  text: string;
}

/**
 * Bumped when any entry is added, edited or removed, so a sign-off names an
 * exact version of the list rather than "the prompts".
 */
export const JOURNAL_PROMPT_LIBRARY_VERSION = '1.0.0';

/**
 * The clinical gate. `status` stays 'pending' until the clinical lead returns
 * the reviewed list; the release that ships these to clients is gated on it.
 */
export const JOURNAL_PROMPT_CLINICAL_REVIEW = {
  status: 'pending' as 'pending' | 'approved' | 'amended',
  reviewer: 'Dr Shubhangi Goswami',
  requestedOn: '2026-11-03',
  approvedOn: null as string | null,
  approvedVersion: null as string | null,
};

export const JOURNAL_PROMPT_LIBRARY: readonly LibraryPrompt[] = [
  // ── anxious ────────────────────────────────────────────────────────────
  {
    id: 'anx-01',
    group: 'anxious',
    text: "What's the worry that keeps coming back today — and what does it seem to want from you?",
  },
  {
    id: 'anx-02',
    group: 'anxious',
    text: 'Name one thing you can see, one you can hear, and one you can feel right now. What changed as you did that?',
  },
  {
    id: 'anx-03',
    group: 'anxious',
    text: "If the anxious part of you could speak in its own words, what would it say it's trying to protect you from?",
  },
  {
    id: 'anx-04',
    group: 'anxious',
    text: "What's something you've been putting off because it feels too big, and what would the smallest first step look like?",
  },
  {
    id: 'anx-05',
    group: 'anxious',
    text: "Write down what you know for certain about today, and what you're only afraid might happen.",
  },

  // ── sad ────────────────────────────────────────────────────────────────
  {
    id: 'sad-01',
    group: 'sad',
    text: 'What would you want someone to say to you right now, if they really understood?',
  },
  {
    id: 'sad-02',
    group: 'sad',
    text: "What's the thing you miss most this week, and what did it give you?",
  },
  {
    id: 'sad-03',
    group: 'sad',
    text: 'Write about a small moment today that felt gentle, even for a second.',
  },
  {
    id: 'sad-04',
    group: 'sad',
    text: 'If your sadness could set one thing down for a while, what would it put down first?',
  },
  {
    id: 'sad-05',
    group: 'sad',
    text: "What do you wish people could see about how you're feeling?",
  },

  // ── angry ──────────────────────────────────────────────────────────────
  {
    id: 'ang-01',
    group: 'angry',
    text: "What happened today that felt unfair, and what would fair have looked like instead?",
  },
  {
    id: 'ang-02',
    group: 'angry',
    text: 'What boundary do you wish you could draw, and who would need to hear about it?',
  },
  {
    id: 'ang-03',
    group: 'angry',
    text: 'Underneath the anger, what else is there — hurt, tiredness, fear?',
  },
  {
    id: 'ang-04',
    group: 'angry',
    text: 'If you could say one thing without softening it at all, what would it be?',
  },
  {
    id: 'ang-05',
    group: 'angry',
    text: "What would help you feel heard right now — from yourself, or from someone else?",
  },

  // ── overwhelmed ────────────────────────────────────────────────────────
  {
    id: 'ovw-01',
    group: 'overwhelmed',
    text: 'List everything on your mind right now. Then mark the one thing that actually has to happen today.',
  },
  {
    id: 'ovw-02',
    group: 'overwhelmed',
    text: "What could you take off your plate this week, even just for a while?",
  },
  {
    id: 'ovw-03',
    group: 'overwhelmed',
    text: "What's the next single action — not the whole task — that would move one thing forward?",
  },
  {
    id: 'ovw-04',
    group: 'overwhelmed',
    text: 'Where are you holding the pressure in your body right now?',
  },
  {
    id: 'ovw-05',
    group: 'overwhelmed',
    text: "What would enough look like today, instead of everything?",
  },

  // ── numb ───────────────────────────────────────────────────────────────
  {
    id: 'nmb-01',
    group: 'numb',
    text: "What's one small thing you can touch, taste or smell right now — and what did you notice about it?",
  },
  {
    id: 'nmb-02',
    group: 'numb',
    text: 'When did you last feel something clearly? Write about that moment.',
  },
  {
    id: 'nmb-03',
    group: 'numb',
    text: 'If the numbness is a pause rather than a problem, what might it be making space for?',
  },
  {
    id: 'nmb-04',
    group: 'numb',
    text: 'Write one sentence about today, even if it feels flat. Flat counts.',
  },
  {
    id: 'nmb-05',
    group: 'numb',
    text: "What's something you used to care about that you'd like to come back to?",
  },

  // ── calm ───────────────────────────────────────────────────────────────
  {
    id: 'clm-01',
    group: 'calm',
    text: 'What helped you get here today? Write it down so you can find it again.',
  },
  {
    id: 'clm-02',
    group: 'calm',
    text: 'What do you want to remember about this calmer moment?',
  },
  {
    id: 'clm-03',
    group: 'calm',
    text: "What's one thing from today you'd like to carry forward?",
  },
  {
    id: 'clm-04',
    group: 'calm',
    text: 'Who or what made today easier, and do they know it?',
  },
  {
    id: 'clm-05',
    group: 'calm',
    text: 'If you could keep one detail of how this calm feels, what would it be?',
  },

  // ── hopeful ────────────────────────────────────────────────────────────
  {
    id: 'hpf-01',
    group: 'hopeful',
    text: "What are you looking forward to, even if it's small?",
  },
  {
    id: 'hpf-02',
    group: 'hopeful',
    text: "What's changed lately that you'd want your past self to know about?",
  },
  {
    id: 'hpf-03',
    group: 'hopeful',
    text: 'What would you like the next month to hold?',
  },
  {
    id: 'hpf-04',
    group: 'hopeful',
    text: "What's one thing you did recently that you're quietly proud of?",
  },
  {
    id: 'hpf-05',
    group: 'hopeful',
    text: "Whose encouragement has stayed with you, and what did they say?",
  },

  // ── other ──────────────────────────────────────────────────────────────
  {
    id: 'oth-01',
    group: 'other',
    text: "What's the headline of today, in one sentence?",
  },
  {
    id: 'oth-02',
    group: 'other',
    text: "What's been on your mind most this week?",
  },
  {
    id: 'oth-03',
    group: 'other',
    text: 'If today were a chapter title, what would it be?',
  },
  {
    id: 'oth-04',
    group: 'other',
    text: "What do you want to say that you haven't found the words for yet?",
  },
  {
    id: 'oth-05',
    group: 'other',
    text: "What's one thing you'd tell a friend who had your day?",
  },

  // ── any (no mood selected — the default pool) ──────────────────────────
  {
    id: 'any-01',
    group: 'any',
    text: "What's one thing that stood out to you today, good or bad?",
  },
  {
    id: 'any-02',
    group: 'any',
    text: 'Write about a moment today when you felt most like yourself.',
  },
  {
    id: 'any-03',
    group: 'any',
    text: "What's something you're carrying right now that you haven't said out loud?",
  },
  {
    id: 'any-04',
    group: 'any',
    text: 'Describe how your body feels right now, without judging it.',
  },
  {
    id: 'any-05',
    group: 'any',
    text: "What's one small thing that helped, even a little, this week?",
  },
  {
    id: 'any-06',
    group: 'any',
    text: 'If today had a colour, what would it be — and why?',
  },
  {
    id: 'any-07',
    group: 'any',
    text: "What's something you needed to hear today?",
  },
  {
    id: 'any-08',
    group: 'any',
    text: 'Write a few lines to your future self about how today went.',
  },
  {
    id: 'any-09',
    group: 'any',
    text: "What did you notice today that you'd normally walk past?",
  },
  {
    id: 'any-10',
    group: 'any',
    text: "What's one thing you'd like to let go of before you sleep?",
  },
  {
    id: 'any-11',
    group: 'any',
    text: 'Who did you think about today, and what were you thinking?',
  },
  {
    id: 'any-12',
    group: 'any',
    text: "What's something ordinary that felt good today?",
  },
];

const VALID_GROUPS: readonly PromptGroup[] = [
  'anxious',
  'sad',
  'angry',
  'overwhelmed',
  'numb',
  'calm',
  'hopeful',
  'other',
  'any',
];

/**
 * Words that must not appear in a client-facing prompt. Kept deliberately
 * short and concrete: this is a tripwire for the obvious mistake (a prompt
 * that names a diagnosis or a crisis topic), not a classifier.
 */
const BANNED_TERMS: readonly string[] = [
  'depress',
  'anxiety disorder',
  'diagnos',
  'medicat',
  'suicid',
  'self-harm',
  'self harm',
  'kill yourself',
  'therap',
  'symptom',
  'trauma',
];

/**
 * Fail-closed check over a prompt list. Returns a list of violation codes;
 * an empty list means the library may be served. The route refuses to serve
 * a library that fails this, so a bad edit is a 503 rather than a sentence
 * nobody reviewed reaching a client.
 */
export function validatePromptLibrary(
  library: readonly LibraryPrompt[] = JOURNAL_PROMPT_LIBRARY,
): string[] {
  const violations: string[] = [];
  const ids = new Set<string>();
  const texts = new Set<string>();

  if (library.length === 0) violations.push('empty_library');

  for (const entry of library) {
    if (!entry.id || entry.id.trim().length === 0) {
      violations.push('missing_id');
    } else if (ids.has(entry.id)) {
      violations.push(`duplicate_id:${entry.id}`);
    } else {
      ids.add(entry.id);
    }

    const text = entry.text?.trim() ?? '';
    if (text.length === 0) {
      violations.push(`empty_text:${entry.id}`);
      continue;
    }
    if (text.length > 200) {
      violations.push(`too_long:${entry.id}`);
    }
    // Two sentences at most. A prompt like "Name one thing you can see ...
    // What changed as you did that?" is a natural shape; a paragraph is not.
    const sentenceBreaks = (text.match(/[.!?]\s+[A-Z]/g) ?? []).length;
    if (sentenceBreaks > 1) {
      violations.push(`multiple_sentences:${entry.id}`);
    }
    if (texts.has(text.toLowerCase())) {
      violations.push(`duplicate_text:${entry.id}`);
    } else {
      texts.add(text.toLowerCase());
    }

    if (!VALID_GROUPS.includes(entry.group)) {
      violations.push(`bad_group:${entry.id}`);
    }

    const lowered = text.toLowerCase();
    for (const term of BANNED_TERMS) {
      if (lowered.includes(term)) {
        violations.push(`banned_term:${entry.id}:${term}`);
      }
    }
  }

  for (const group of VALID_GROUPS) {
    if (!library.some((entry) => entry.group === group)) {
      violations.push(`empty_group:${group}`);
    }
  }

  return violations;
}

export interface PromptSelectionOptions {
  /** The mood the user picked, if any. Unknown values fall back to 'any'. */
  emotion?: string | null;
  /** Injectable for tests: chooses which general prompt is mixed in. */
  seed?: number;
}

/**
 * The prompts offered for one tap: every entry in the chosen group plus the
 * general pool, so the app can cycle through a real variety without asking
 * the server again. Order is stable for a given seed, which keeps a test
 * deterministic and still varies between users.
 */
export function promptsForEmotion(
  library: readonly LibraryPrompt[] = JOURNAL_PROMPT_LIBRARY,
  options: PromptSelectionOptions = {},
): LibraryPrompt[] {
  const group: PromptGroup = VALID_GROUPS.includes(options.emotion as PromptGroup)
    ? (options.emotion as PromptGroup)
    : 'any';

  const primary = library.filter((entry) => entry.group === group);
  const general = library.filter((entry) => entry.group === 'any');

  // With no mood picked, the general pool IS the answer — don't duplicate it.
  if (group === 'any') return [...general];

  const seed = options.seed ?? 0;
  const ordered = [...general];
  if (ordered.length > 0 && seed > 0) {
    const shift = seed % ordered.length;
    ordered.push(...ordered.splice(0, shift));
  }

  return [...primary, ...ordered];
}
