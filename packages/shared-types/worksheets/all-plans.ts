/**
 * ALL — the four extras the owner briefed on 25 November 2026, for every
 * client whatever their care plan.
 *
 * STATUS, 26 November 2026: every row is `draft`. Rule 2 of the standing rules
 * (every new worksheet starts switched off) is honoured: none of these is
 * listable, openable or assignable from the portal until the owner says the
 * wording is approved. Two of them — Unclench and My calm place — are
 * audio-guided in intent, and the owner asked to approve the words and the voice
 * before anything is recorded, so their scripts are here and nothing is recorded.
 *
 * The owner rewrote the copy for all four on 26 November 2026 and approved it on
 * that basis. The ids, access modes, load levels and safety settings are
 * unchanged from the brief; only the names and the wording moved. The owner's
 * brief, one line each, with the approved name:
 *
 *  1 Where do I feel it?     open  tap where you feel something, then the feelings picker for that spot
 *  2 Sleep check             open  bedtime, wake time, how rested, screens before bed, short notes
 *  3 Unclench                open  audio-guided, about 5 minutes (script only, nothing recorded)
 *  4 My calm place           open  audio-guided (script only, nothing recorded)
 *
 * Two of them were already placeholders and keep their ids: Where do I feel it?
 * (`ws_body_map`, born "Body map") and Sleep check (`ws_sleep_diary`, born "Sleep
 * diary"). Their placeholder rows are removed from `placeholders.ts` in the same
 * change, and the generated seed migration that created them stays
 * byte-identical — the drafts migration upgrades those rows in place through ON
 * CONFLICT.
 *
 * The Sleep check carries the deeper safety screen (`sensitive_check: true`),
 * because the owner named it in the standing rules of 24 Nov 2026: skipped
 * meals, restricted food, making yourself sick, punishing exercise, hating your
 * body, days without sleep, wanting not to wake up, wanting to hurt someone,
 * and self-harm. Every other answer on every row still goes through the same
 * safety check the journal uses.
 *
 * No row asks for weight, body measurements, calories, food amounts or
 * medicines — the Sleep check deliberately has no medicine field, which is the
 * most likely place one would have crept in — and none of them adds answers into
 * a total, a level or a label (rules 3 and 5).
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';
import { FEELINGS_EN } from '@okuvu/shared-types/worksheets/feelings';

// ─── 1. Where do I feel it? ───────────────────────────────────────────────

const bodyMap: CatalogueEntry = {
  tool_id: 'ws_body_map',
  label: 'Where do I feel it?',
  label_hi: null,
  summary: 'Feelings often show up in your body first. Find where.',
  summary_hi: null,
  section: 'notice_and_name',
  therapy_modality: 'Interoceptive awareness (body scan, somatic mapping)',
  therapist_note:
    'the client taps the parts of the outline where something is present, up to three, then picks feelings for each tapped part. Per part, never a total — two places can carry different feelings and the exercise is about noticing that. There is no strength rating: the approved copy asks only where and what, so the screen asks only that.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 130,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['all'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'Before you have words for a feeling, your body often already knows. A tight chest. A knot in your stomach. Shoulders up near your ears. Tap where you notice something.',
    fields: [
      {
        id: 'where',
        type: 'body_outline',
        prompt: 'Where do you feel it right now?',
        helper: "Tap up to three spots. If you can't find anything, that's okay too.",
        required: true,
        maxSelections: 3,
        fullMessage: 'You can pick up to three. Tap a spot again to remove it.',
        withFeelings: true,
        feelingsPrompt: "What's the feeling there?",
        feelings: FEELINGS_EN,
        regions: [
          { id: 'head', label: 'Head' },
          { id: 'face', label: 'Face' },
          { id: 'jaw', label: 'Jaw' },
          { id: 'throat', label: 'Throat' },
          { id: 'neck', label: 'Neck' },
          { id: 'shoulders', label: 'Shoulders' },
          { id: 'chest', label: 'Chest' },
          { id: 'heart', label: 'Heart' },
          { id: 'stomach', label: 'Stomach' },
          { id: 'belly', label: 'Belly' },
          { id: 'back', label: 'Back' },
          { id: 'arms', label: 'Arms' },
          { id: 'hands', label: 'Hands' },
          { id: 'hips', label: 'Hips' },
          { id: 'legs', label: 'Legs' },
          { id: 'knees', label: 'Knees' },
          { id: 'feet', label: 'Feet' },
        ],
      },
    ],
    closing: {
      text: 'Now you know where it sits. Next time it turns up, you might notice it sooner.',
    },
  },
  content_hi: null,
};

// ─── 2. Sleep check ───────────────────────────────────────────────────────

const sleepDiary: CatalogueEntry = {
  tool_id: 'ws_sleep_diary',
  label: 'Sleep check',
  label_hi: null,
  summary: 'Two minutes each morning. See how your sleep and your days connect.',
  summary_hi: null,
  section: 'energy_life',
  therapy_modality: 'Sleep hygiene monitoring (self-report diary)',
  therapist_note:
    'bedtime, wake time, restedness, screens before bed and a short note, one entry per night. No medicine field by the owner\'s rule — sleep medication is a prescriber decision and is not asked about here.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 140,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['all'],
  sensitive_check: true,
  content_en: {
    version: 1,
    intro:
      "Bad sleep makes everything feel heavier, and when you're tired it's hard to see why. Jot down last night in under two minutes. A rough night is worth writing down too.",
    fields: [
      {
        id: 'night',
        type: 'datetime',
        prompt: 'Which night are you writing about?',
        helper: 'Usually last night.',
        required: true,
        withDate: true,
        withTime: false,
      },
      {
        id: 'bedtime',
        type: 'datetime',
        prompt: 'When did you get into bed?',
        withDate: false,
        withTime: true,
      },
      {
        id: 'wake_time',
        type: 'datetime',
        prompt: 'When did you actually get up?',
        helper: "Getting up, not waking up. They're often different.",
        withDate: false,
        withTime: true,
      },
      {
        id: 'rested',
        type: 'scale_0_10',
        prompt: 'How rested do you feel?',
        minLabel: 'running on empty',
        maxLabel: 'fully charged',
      },
      {
        id: 'screens',
        type: 'choice',
        prompt: 'Were you on your phone or a screen in the hour before bed?',
        helper: 'No judgement. Most of us were.',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        id: 'notes',
        type: 'short_text',
        prompt: 'Anything about last night worth remembering?',
        helper:
          'Woke up a lot, mind racing, a late-night call, a noisy house. A few words is enough.',
      },
    ],
    closing: {
      text: 'Done for today. Over a few mornings, you may start to see how your nights and days connect.',
    },
  },
  content_hi: null,
};

// ─── 3. Unclench ──────────────────────────────────────────────────────────

const muscleRelaxation: CatalogueEntry = {
  tool_id: 'ws_muscle_relaxation',
  label: 'Unclench',
  label_hi: null,
  summary: "You're probably holding more tension than you think. Five minutes to let it go.",
  summary_hi: null,
  section: 'calm_my_body',
  therapy_modality: 'Progressive muscle relaxation',
  therapist_note:
    'guided tense-and-release through the main muscle groups, about five minutes. Audio-guided once the owner approves the script and the voice; until then the script is read on screen and nothing is recorded. The approved voice brief is warm Indian English, slow, with about five seconds of silence at each "Hold…" and between steps.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 150,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['all'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "Stress hides in your body: a clenched jaw, tight shoulders, fists you didn't know you were making. You'll gently tighten one part at a time, then let it go. Nothing should hurt. Skip any part that's sore or injured.",
    fields: [
      {
        id: 'settle',
        type: 'instruction',
        prompt:
          'Get comfortable, sitting or lying down. Let your hands rest. Breathe out slowly, and let your shoulders drop a little.',
      },
      {
        id: 'hands_arms',
        type: 'instruction',
        prompt:
          'Hands and arms. Make two loose fists and tighten your arms, just a little. Hold… and let go. Notice how your hands feel now.',
      },
      {
        id: 'shoulders_neck',
        type: 'instruction',
        prompt:
          'Shoulders. Lift them up towards your ears. Hold them there… and drop them. Feel how far they fall.',
      },
      {
        id: 'face',
        type: 'instruction',
        prompt:
          'Face. Scrunch it up: eyes, forehead, jaw. Hold… and let go. Let your teeth come slightly apart.',
      },
      {
        id: 'stomach',
        type: 'instruction',
        prompt:
          "Stomach. Tighten it gently, like you're bracing. Hold… and soften. Let your breath reach your belly.",
      },
      {
        id: 'legs_feet',
        type: 'instruction',
        prompt:
          'Legs and feet. Point your toes and tighten your legs. Hold… and release. Let them feel heavy.',
      },
      {
        id: 'whole_body',
        type: 'instruction',
        prompt:
          'Now all of you together, gently. Hold… and let everything go. One long breath out.',
      },
      {
        id: 'after',
        type: 'scale_0_10',
        prompt: 'How does your body feel now?',
        minLabel: 'still tight',
        maxLabel: 'loose and easy',
      },
    ],
    closing: {
      text: "That's it. Check in with your jaw and shoulders again later today.",
    },
  },
  content_hi: null,
};

// ─── 4. My calm place ─────────────────────────────────────────────────────

const safePlace: CatalogueEntry = {
  tool_id: 'ws_safe_place',
  label: 'My calm place',
  label_hi: null,
  summary: 'Build a place in your head you can go to when things get too loud.',
  summary_hi: null,
  section: 'calm_my_body',
  therapy_modality: 'Guided imagery (safe place)',
  therapist_note:
    'guided imagery to a place the client builds themselves. The place is asked for first, before any settling step, so the client names it in their own words before the guided part begins. Audio-guided once the owner approves the script and the voice; until then the script is read on screen and nothing is recorded. The place is the client\'s own — nothing is suggested for them.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 160,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['all'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'Think of a place where you feel calmer. It can be real or made up: your nani\'s kitchen, a quiet beach, your bed on a rainy afternoon. You\'ll spend a few minutes there. If anything feels uncomfortable, open your eyes and stop. You can come back another time.',
    fields: [
      // The question comes first: the client names their place in their own
      // words before the guided part starts, so nothing is typed mid-script.
      {
        id: 'choose',
        type: 'short_text',
        prompt: "Where's your place?",
        helper:
          "A few words is enough. If nowhere real feels calm, make one up. That's completely fine.",
        required: true,
      },
      {
        id: 'settle',
        type: 'instruction',
        prompt:
          'Get comfortable. Close your eyes if that feels okay, or rest your eyes on one spot on the floor. Breathe out slowly.',
      },
      {
        id: 'see',
        type: 'instruction',
        prompt: 'Look around. What do you see? Colours, light, the shape of things.',
      },
      {
        id: 'hear',
        type: 'instruction',
        prompt:
          'Listen. What can you hear? Rain, waves, quiet, someone humming in the next room.',
      },
      {
        id: 'feel',
        type: 'instruction',
        prompt: "Feel it. The air on your skin, what's under you, warm or cool.",
      },
      {
        id: 'stay',
        type: 'instruction',
        prompt:
          "Stay a little longer. Nothing is expected of you here. When you're ready, take one slow breath and open your eyes.",
      },
      {
        id: 'after',
        type: 'scale_0_10',
        prompt: 'How do you feel now?',
        minLabel: 'very unsettled',
        maxLabel: 'very calm',
      },
    ],
    closing: {
      text: 'Your place is yours. You can come back to it any time.',
    },
  },
  content_hi: null,
};

export const allPlansEntries: CatalogueEntry[] = [
  bodyMap,
  sleepDiary,
  muscleRelaxation,
  safePlace,
];

/** The four ids, in the owner's order. Membership is a list, never "whatever is draft". */
export const ALL_PLANS_BATCH_IDS = [
  'ws_body_map',
  'ws_sleep_diary',
  'ws_muscle_relaxation',
  'ws_safe_place',
] as const;
