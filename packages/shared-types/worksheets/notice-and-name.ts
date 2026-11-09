/**
 * NOTICE & NAME — worksheets 1 and 2.
 *
 * 1 is not a new worksheet: the existing mood check-in stays exactly as it is
 * and these two screens are added after it (`opens: 'mood_checkin'`).
 * 2 is a new worksheet.
 */
import type { CatalogueEntry } from './types';
import { FEELINGS_EN, FEELINGS_HI } from './feelings';

const moodCheckIn: CatalogueEntry = {
  tool_id: 'mood_checkin',
  label: 'Mood check-in',
  label_hi: 'Mood check-in',
  summary: "Check in with how you're feeling and what set it off.",
  summary_hi: 'Check in karo ki aap kaisa feel kar rahe ho, aur kis baat ne aisa kar diya.',
  section: 'notice_and_name',
  therapy_modality: 'Mood monitoring (behavioural activation / CBT)',
  therapist_note:
    'tracks mood, trigger and intensity over time; its intensity rating also drives the safety gate on demanding worksheets.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 1,
  sort_order: 10,
  status: 'approved',
  opens: 'mood_checkin',
  content_en: {
    version: 1,
    fields: [
      {
        id: 'trigger',
        type: 'short_text',
        prompt: 'What was happening just before you felt this?',
        helper:
          'A place, a person, a thought, a notification, nothing in particular. All of these count.',
        example: 'Got my internal marks back.',
      },
      {
        id: 'intensity',
        type: 'scale_0_10',
        prompt: 'How strong is this feeling right now?',
        minLabel: '0 = barely there',
        maxLabel: "10 = the strongest I've felt.",
      },
    ],
    closing: {
      text: 'Noted. Noticing is a skill, and you just used it.',
    },
  },
  content_hi: {
    version: 1,
    fields: [
      {
        id: 'trigger',
        type: 'short_text',
        prompt: 'Aisa feel karne se thoda pehle kya ho raha tha?',
        helper:
          'Koi jagah, koi insaan, koi soch, koi notification, ya kuch bhi nahi. Sab count hota hai.',
        example: 'Internal marks aa gaye the.',
      },
      {
        id: 'intensity',
        type: 'scale_0_10',
        prompt: 'Abhi ye feeling kitni strong hai?',
        minLabel: '0 = bas thodi si',
        maxLabel: '10 = sabse zyada jo maine kabhi feel kiya.',
      },
    ],
    closing: {
      text: 'Note kar liya. Notice karna ek skill hai, aur aapne abhi use kiya.',
    },
  },
};

const nameTheFeeling: CatalogueEntry = {
  tool_id: 'ws_name_the_feeling',
  label: 'Name the feeling',
  label_hi: 'Feeling ko naam do',
  summary: "Find a more exact word for what you're feeling, and where you feel it.",
  summary_hi: 'Jo aap feel kar rahe ho uske liye zyada sahi shabd dhoondo, aur kahan feel hota hai woh bhi.',
  section: 'notice_and_name',
  therapy_modality: 'Emotion granularity, body awareness (DBT-informed)',
  therapist_note:
    'emotion granularity and body awareness; useful early in therapy and before DBT skills.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 20,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      "Sometimes everything just feels like 'bad' or 'off.' Putting a more exact name on a feeling can make it a little easier to hold.",
    fields: [
      {
        id: 'feelings',
        type: 'feelings_picker',
        prompt: "Pick the feeling closest to what's going on.",
        required: true,
        maxSelections: 3,
        withStrength: true,
        strengthPrompt: 'How strong is each one?',
        // The approved document gives the finer words for "scared" only. The
        // other families stay at family level until she approves finer words
        // for them; inventing them here would be writing clinical copy.
        feelings: FEELINGS_EN,
      },
      {
        id: 'body',
        type: 'checklist',
        prompt: 'Where do you notice it in your body?',
        helper: "There's no wrong answer. Some feelings don't show up in the body at all.",
        options: [
          { value: 'head', label: 'head' },
          { value: 'jaw', label: 'jaw' },
          { value: 'throat', label: 'throat' },
          { value: 'chest', label: 'chest' },
          { value: 'stomach', label: 'stomach' },
          { value: 'shoulders', label: 'shoulders' },
          { value: 'hands', label: 'hands' },
          { value: 'legs', label: 'legs' },
          { value: 'nowhere', label: 'nowhere I can tell' },
        ],
      },
      {
        id: 'one_sentence',
        type: 'short_text',
        prompt: 'If this feeling could say one sentence, what would it say?',
        example: "Don't mess this up.",
      },
    ],
    closing: {
      text: "You gave it a name. That's a step towards understanding it.",
    },
  },
  content_hi: {
    version: 1,
    intro:
      "Kabhi kabhi sab kuch bas 'bura' ya 'theek nahi' lagta hai. Feeling ko zyada sahi naam dene se use sambhalna thoda aasan ho sakta hai.",
    fields: [
      {
        id: 'feelings',
        type: 'feelings_picker',
        prompt: 'Jo abhi ho raha hai, uske sabse kareeb feeling chuno.',
        required: true,
        maxSelections: 3,
        withStrength: true,
        strengthPrompt: 'Har ek kitni strong hai?',
        feelings: FEELINGS_HI,
      },
      {
        id: 'body',
        type: 'checklist',
        prompt: 'Body mein kahan mehsoos hota hai?',
        helper: 'Koi galat jawab nahi hai. Kuch feelings body mein dikhti hi nahi.',
        options: [
          { value: 'head', label: 'sar' },
          { value: 'jaw', label: 'jabda' },
          { value: 'throat', label: 'gala' },
          { value: 'chest', label: 'seene' },
          { value: 'stomach', label: 'pet' },
          { value: 'shoulders', label: 'kandhe' },
          { value: 'hands', label: 'haath' },
          { value: 'legs', label: 'pair' },
          { value: 'nowhere', label: 'kuch bhi mehsoos nahi hota' },
        ],
      },
      {
        id: 'one_sentence',
        type: 'short_text',
        prompt: 'Agar ye feeling ek line bol sakti, toh kya kehti?',
        example: 'Ise bigaadna mat.',
      },
    ],
    closing: {
      text: 'Aapne ise naam de diya. Samajhne ki taraf ye ek kadam hai.',
    },
  },
};

export const noticeAndNameEntries: CatalogueEntry[] = [moodCheckIn, nameTheFeeling];
