/**
 * BE KINDER TO ME — worksheets 11 and 12.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

const kindFriend: CatalogueEntry = {
  tool_id: 'ws_kind_friend_letter',
  label: 'A letter from a kind friend',
  label_hi: 'Ek pyaar karne wale dost ka khat',
  summary: 'Write to yourself the way a caring friend would.',
  summary_hi: 'Khud ko waise likho jaise ek samajhdaar dost likhta.',
  section: 'be_kinder',
  therapy_modality: 'Compassion-focused therapy (letter writing)',
  therapist_note:
    'compassion-focused letter writing. Marked demanding because it can stir up strong shame or grief, so it is better done when the client is steadier.',
  access_mode: 'assigned',
  load_level: 'demanding',
  est_minutes: 10,
  sort_order: 10,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      "Most of us talk to ourselves in ways we'd never talk to a friend. This is a chance to try a different voice.",
    fields: [
      {
        id: 'hard_on_yourself',
        type: 'long_text',
        prompt: "What's something you've been hard on yourself about lately?",
        required: true,
        helper: 'Write it the way your inner critic says it.',
      },
      {
        id: 'who',
        type: 'short_text',
        prompt:
          "Picture someone who cares about you without conditions. It can be a real person, someone you've imagined, or a wiser, kinder version of you. Who are you picturing?",
      },
      {
        id: 'letter',
        type: 'long_text',
        prompt: 'Write to yourself as they would.',
        required: true,
        helper:
          'What would they understand about why this is hard?, What would they want you to know?, What would they hope for you?',
      },
      {
        id: 'reading_it',
        type: 'short_text',
        prompt: 'Read your letter back. How does it feel to read it?',
        helper:
          "If it feels awkward or untrue, that's very common. Kindness towards yourself can take practice.",
      },
    ],
    closing: {
      text: 'You can come back to this letter whenever you need it.',
      buttons: [
        { label: 'Save to my Treasure Box', action: 'treasure_box' },
        { label: 'Done', action: 'done' },
      ],
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Hum sab apne aap se waise baat nahi karte jaise dost se karte hain. Ye ek alag awaaz aazmane ka mauka hai.',
    fields: [
      {
        id: 'hard_on_yourself',
        type: 'long_text',
        prompt: 'Haal hi mein aap kis baat par khud ko kaafi kathor rahe ho?',
        required: true,
        helper: 'Ise waise likho jaise aapka andar ka critic kehta hai.',
      },
      {
        id: 'who',
        type: 'short_text',
        prompt:
          'Kisi aise insaan ko yaad karo jo bina shart aapki parwah karta hai. Woh koi asli insaan ho sakta hai, koi jo aapne socha ho, ya aapka khud ka ek zyada samajhdaar, narm version. Aap kisko yaad kar rahe ho?',
      },
      {
        id: 'letter',
        type: 'long_text',
        prompt: 'Khud ko waise likho jaise woh likhte.',
        required: true,
        helper:
          'Woh kya samajhte honge ki ye mushkil kyun hai? Woh aapko kya batana chahte honge? Woh aapke liye kya ummeed rakhte honge?',
      },
      {
        id: 'reading_it',
        type: 'short_text',
        prompt: 'Apna khat dobara padho. Padhkar kaisa lagta hai?',
        helper:
          'Agar ajeeb ya jhoota lage, toh ye bahut aam hai. Khud par narmi practice se aati hai.',
      },
    ],
    closing: {
      text: 'Jab zaroorat ho, aap is khat par wapas aa sakte ho.',
      buttons: [
        { label: 'Mere Treasure Box mein save karo', action: 'treasure_box' },
        { label: 'Ho gaya', action: 'done' },
      ],
    },
  },
};

const threeGoodThings: CatalogueEntry = {
  tool_id: 'ws_three_good_things',
  label: 'Three good things',
  label_hi: 'Teen achhi cheezein',
  summary: 'Notice three things that went okay today.',
  summary_hi: 'Aaj teen cheezein dekho jo theek se hui hain.',
  section: 'be_kinder',
  therapy_modality: 'Positive psychology (savouring)',
  therapist_note:
    'positive psychology practice of savouring; low effort and suitable for any day.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 20,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      'Our brains are good at remembering what went wrong. This is practice in noticing what went okay. Small and ordinary is perfect.',
    fields: [
      {
        id: 'one',
        type: 'short_text',
        prompt: "What's one thing that went okay today?",
        required: true,
        example: "The auto driver didn't argue about the fare.",
      },
      {
        id: 'two',
        type: 'short_text',
        prompt: 'And another?',
        required: true,
      },
      {
        id: 'three',
        type: 'short_text',
        prompt: 'And one more?',
        required: true,
      },
      {
        id: 'my_part',
        type: 'short_text',
        prompt: 'Pick one. What part did you play in it, even a small one?',
      },
    ],
    closing: {
      text: 'Noticed and kept.',
      buttons: [{ label: 'Save to my Treasure Box', action: 'treasure_box' }],
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Dimaag ko yaad rehta hai ki kya galat hua. Ye practice hai dekhne ki kya theek hua. Chhoti aur aam cheezein bhi perfect hain.',
    fields: [
      {
        id: 'one',
        type: 'short_text',
        prompt: 'Aaj ek cheez kya theek hui?',
        required: true,
        example: 'Auto wale ne kiraye par baat nahi ki.',
      },
      {
        id: 'two',
        type: 'short_text',
        prompt: 'Aur ek?',
        required: true,
      },
      {
        id: 'three',
        type: 'short_text',
        prompt: 'Aur ek?',
        required: true,
      },
      {
        id: 'my_part',
        type: 'short_text',
        prompt: 'Ek chuno. Isme aapka kya hissa tha, thoda sa bhi?',
      },
    ],
    closing: {
      text: 'Dekha aur sambhal ke rakha.',
      buttons: [{ label: 'Mere Treasure Box mein save karo', action: 'treasure_box' }],
    },
  },
};

export const beKinderEntries: CatalogueEntry[] = [kindFriend, threeGoodThings];
