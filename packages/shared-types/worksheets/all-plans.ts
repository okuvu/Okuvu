/**
 * ALL — the four extras the owner briefed on 25 November 2026, for every
 * client whatever their care plan.
 *
 * STATUS, 25 November 2026: every row is `draft`. Rule 2 of the standing rules
 * (every new worksheet starts switched off) is honoured: none of these is
 * listable, openable or assignable from the portal until the owner says the
 * wording is approved. Two of them — Muscle relaxation and Safe place — are
 * audio-guided, and the owner asked to approve the words and the voice before
 * anything is recorded, so their scripts are here and nothing is recorded.
 *
 * The owner's brief, one line each:
 *
 *  1 Body map                open  tap where you feel something, then the feelings picker for that spot
 *  2 Sleep diary             open  bedtime, wake time, how rested, screens before bed, short notes
 *  3 Muscle relaxation       open  audio-guided (script only, nothing recorded)
 *  4 Safe place              open  audio-guided (script only, nothing recorded)
 *
 * Two of them were already placeholders and keep their ids: Body map
 * (`ws_body_map`) and Sleep diary (`ws_sleep_diary`). Their placeholder rows are
 * removed from `placeholders.ts` in the same change, and the generated seed
 * migration that created them stays byte-identical — the drafts migration
 * upgrades those rows in place through ON CONFLICT.
 *
 * The Sleep diary carries the deeper safety screen (`sensitive_check: true`),
 * because the owner named it in the standing rules of 24 Nov 2026: skipped
 * meals, restricted food, making yourself sick, punishing exercise, hating your
 * body, days without sleep, wanting not to wake up, wanting to hurt someone,
 * and self-harm. Every other answer on every row still goes through the same
 * safety check the journal uses.
 *
 * No row asks for weight, body measurements, calories, food amounts or
 * medicines — the Sleep diary deliberately has no medicine field, which is the
 * most likely place one would have crept in — and none of them adds answers into
 * a total, a level or a label (rules 3 and 5).
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';
import { FEELINGS_EN } from '@okuvu/shared-types/worksheets/feelings';

// ─── 1. Body map ──────────────────────────────────────────────────────────

const bodyMap: CatalogueEntry = {
  tool_id: 'ws_body_map',
  label: 'Body map',
  label_hi: null,
  summary: 'Mark where in the body a feeling shows up, and how strong it is there.',
  summary_hi: null,
  section: 'notice_and_name',
  therapy_modality: 'Interoceptive awareness (body scan, somatic mapping)',
  therapist_note:
    'the client taps the parts of the outline where something is present, then picks feelings for each tapped part and rates how strong it is there. Per part, never a total — two places can carry different feelings and the exercise is about noticing that.',
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
      "Feelings show up in the body before we have words for them — a tight chest, a heavy stomach, shoulders up by the ears. Tap wherever you notice something today. There's no right place to find.",
    fields: [
      {
        id: 'where',
        type: 'body_outline',
        prompt: 'Where do you notice something right now?',
        helper: 'Tap as many places as fit, up to three. Nothing has to be there.',
        required: true,
        maxSelections: 3,
        withStrength: true,
        strengthPrompt: 'How strong is it there?',
        withFeelings: true,
        feelingsPrompt: 'What does it feel like there?',
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
      text: 'You noticed where it lives. That is often the first step to it easing.',
    },
  },
  content_hi: null,
};

// ─── 2. Sleep diary ───────────────────────────────────────────────────────

const sleepDiary: CatalogueEntry = {
  tool_id: 'ws_sleep_diary',
  label: 'Sleep diary',
  label_hi: null,
  summary: 'Record sleep and wake times and how the day felt, to spot a pattern.',
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
      "Sleep and mood pull on each other, and it's hard to see the pattern from inside a tired week. A short note each morning is enough — this isn't a test, and a bad night is still useful information.",
    fields: [
      {
        id: 'night',
        type: 'datetime',
        prompt: 'Which night is this?',
        helper: 'The night you are writing about.',
        required: true,
        withDate: true,
        withTime: false,
      },
      {
        id: 'bedtime',
        type: 'datetime',
        prompt: 'What time did you get into bed?',
        withDate: false,
        withTime: true,
      },
      {
        id: 'wake_time',
        type: 'datetime',
        prompt: 'What time did you get up?',
        helper: 'Getting up, not waking — they are often different.',
        withDate: false,
        withTime: true,
      },
      {
        id: 'rested',
        type: 'scale_0_10',
        prompt: 'How rested do you feel today?',
        minLabel: 'not at all rested',
        maxLabel: 'very rested',
      },
      {
        id: 'screens',
        type: 'choice',
        prompt: 'Were you on a screen in the hour before bed?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        id: 'notes',
        type: 'short_text',
        prompt: 'Anything worth noting about last night?',
        helper: 'Waking in the night, a racing mind, a late message, something on your mind. A few words is enough.',
      },
    ],
    closing: {
      text: 'One night is a data point, not a verdict. The pattern is what helps.',
    },
  },
  content_hi: null,
};

// ─── 3. Muscle relaxation ─────────────────────────────────────────────────

const muscleRelaxation: CatalogueEntry = {
  tool_id: 'ws_muscle_relaxation',
  label: 'Muscle relaxation',
  label_hi: null,
  summary: 'Tense and release each part of the body in turn, guided step by step.',
  summary_hi: null,
  section: 'calm_my_body',
  therapy_modality: 'Progressive muscle relaxation',
  therapist_note:
    'guided tense-and-release through the main muscle groups. Audio-guided once the owner approves the script and the voice; until then the script is read on screen and nothing is recorded.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 150,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['all'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "When the body holds tension for a long time, it stops noticing it. This is a few minutes of tensing each part gently, then letting it go — so the difference becomes something you can feel again. Nothing here should hurt. If a part is injured, skip it.",
    fields: [
      {
        id: 'settle',
        type: 'instruction',
        prompt:
          'Sit or lie somewhere comfortable. Let your hands rest. Take one slow breath out, and let your shoulders drop.',
      },
      {
        id: 'hands_arms',
        type: 'instruction',
        prompt:
          'Make a loose fist with both hands and gently tighten your arms. Hold for a moment — not hard, just enough to feel it. Now let go completely. Notice the difference for a few seconds.',
      },
      {
        id: 'shoulders_neck',
        type: 'instruction',
        prompt:
          'Lift your shoulders towards your ears and hold them there. Then let them fall. Feel how far down they go when you stop holding them.',
      },
      {
        id: 'face',
        type: 'instruction',
        prompt:
          'Scrunch your face gently — eyes, jaw, forehead. Hold, then release. Let your jaw come slightly apart.',
      },
      {
        id: 'stomach',
        type: 'instruction',
        prompt:
          'Tighten your stomach muscles gently, as if bracing. Hold, then let them soften. Let your breath go low into your belly.',
      },
      {
        id: 'legs_feet',
        type: 'instruction',
        prompt:
          'Point your toes away and tighten your legs. Hold, then release. Let your legs feel heavy where they are.',
      },
      {
        id: 'whole_body',
        type: 'instruction',
        prompt:
          'Now the whole body at once, gently. Hold for a moment, then let everything go and breathe out slowly.',
      },
      {
        id: 'after',
        type: 'scale_0_10',
        prompt: 'How does your body feel now?',
        minLabel: 'still tense',
        maxLabel: 'much softer',
      },
    ],
    closing: {
      text: "You don't have to carry it all in your muscles. Come back to this whenever the tension builds.",
    },
  },
  content_hi: null,
};

// ─── 4. Safe place ────────────────────────────────────────────────────────

const safePlace: CatalogueEntry = {
  tool_id: 'ws_safe_place',
  label: 'Safe place',
  label_hi: null,
  summary: 'Build a calm place in your mind, guided, to return to when things feel too much.',
  summary_hi: null,
  section: 'calm_my_body',
  therapy_modality: 'Guided imagery (safe place)',
  therapist_note:
    'guided imagery to a place the client builds themselves. Audio-guided once the owner approves the script and the voice; until then the script is read on screen and nothing is recorded. The place is the client\'s own — nothing is suggested for them.',
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
      "Somewhere in your mind there is a place that feels calmer than here. It can be real or made up, somewhere you have been or somewhere you would like to be. We're going to spend a few minutes there.",
    fields: [
      {
        id: 'settle',
        type: 'instruction',
        prompt:
          'Sit or lie somewhere comfortable. Let your eyes close if that feels alright, or soften your gaze. Take one slow breath out.',
      },
      {
        id: 'choose',
        type: 'short_text',
        prompt: 'Where is your place?',
        helper: 'A room, a beach, a hill, a corner of someone\'s house, somewhere you invent. A few words is enough.',
        required: true,
      },
      {
        id: 'see',
        type: 'instruction',
        prompt:
          'Picture it now. What can you see there — colours, light, the shape of things? Take a moment to look around it slowly.',
      },
      {
        id: 'hear',
        type: 'instruction',
        prompt:
          'What can you hear in this place? Maybe it is quiet. Let the sounds be there without needing to change them.',
      },
      {
        id: 'feel',
        type: 'instruction',
        prompt:
          'What does it feel like on your skin — the air, the ground under you, the temperature? Let yourself settle into that.',
      },
      {
        id: 'stay',
        type: 'instruction',
        prompt:
          'Stay here a little longer. Nothing is needed from you in this place. When you are ready, take one slow breath and come back.',
      },
      {
        id: 'after',
        type: 'scale_0_10',
        prompt: 'How do you feel now?',
        minLabel: 'still unsettled',
        maxLabel: 'calmer',
      },
    ],
    closing: {
      text: 'This place is yours. You can come back to it whenever you need somewhere to put yourself down.',
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
