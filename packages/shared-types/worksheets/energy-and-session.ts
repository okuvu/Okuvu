/**
 * ENERGY & LIFE (13) and BEFORE & AFTER SESSION (14, 15).
 *
 * Three short self-serve sheets. They share a file because each is small and
 * they are read together in the Library's order; the section key on each row is
 * what places it, not the file it lives in.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

const energyAudit: CatalogueEntry = {
  tool_id: 'ws_energy_audit',
  label: 'Energy audit',
  label_hi: 'Energy audit',
  summary: 'See what drains your energy and what fills it back up.',
  summary_hi: 'Dekho aapki energy kya kha raha hai aur kya wapas bhar raha hai.',
  section: 'energy_life',
  therapy_modality: 'Burnout self-monitoring',
  therapist_note:
    'burnout self-monitoring of what drains and what restores energy, ending in one small adjustment.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 10,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      "Some things take more out of you than they give back. Others quietly fill you up. Let's look at your week.",
    fields: [
      {
        id: 'drains',
        type: 'row_list',
        prompt: "What's been draining your energy this week?",
        example: 'Back-to-back classes · Family WhatsApp group · Scrolling till 2 am.',
        columns: [
          { id: 'item', label: 'Draining', type: 'text' },
          { id: 'how_much', label: 'How much?', type: 'scale_0_10' },
        ],
      },
      {
        id: 'gives',
        type: 'row_list',
        prompt: "What's been giving you energy, even a little?",
        example: 'Evening walk · Cooking with my roommate · Cricket on Sunday.',
        columns: [
          { id: 'item', label: 'Giving energy', type: 'text' },
          { id: 'how_much', label: 'How much?', type: 'scale_0_10' },
        ],
      },
      {
        id: 'noticing',
        type: 'long_text',
        prompt: 'Looking at both lists, what do you notice?',
      },
      {
        id: 'one_change',
        type: 'short_text',
        prompt:
          'Is there one drain you could shrink a little, or one source you could add a bit more of this week?',
        helper: "Tiny changes count. If nothing feels possible right now, that's useful to know too.",
      },
    ],
    closing: {
      text: 'Knowing where your energy goes is the first step to protecting it.',
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Kuch cheezein utna deti nahi jitna le leti hain. Kuch chup-chaap aapko bhar deti hain. Chalo aapka hafta dekhein.',
    fields: [
      {
        id: 'drains',
        type: 'row_list',
        prompt: 'Is hafte aapki energy kaunsi cheezein kha rahi hain?',
        example: 'Lagaatar classes · Family WhatsApp group · Raat 2 baje tak scrolling.',
        columns: [
          { id: 'item', label: 'Energy khaane wali', type: 'text' },
          { id: 'how_much', label: 'Kitna?', type: 'scale_0_10' },
        ],
      },
      {
        id: 'gives',
        type: 'row_list',
        prompt: 'Kaunsi cheezein aapko energy de rahi hain, thodi si bhi?',
        example: 'Shaam ki walk · Roommate ke saath khana banana · Sunday ka cricket.',
        columns: [
          { id: 'item', label: 'Energy dene wali', type: 'text' },
          { id: 'how_much', label: 'Kitna?', type: 'scale_0_10' },
        ],
      },
      {
        id: 'noticing',
        type: 'long_text',
        prompt: 'Dono list dekhkar kya notice karte ho?',
      },
      {
        id: 'one_change',
        type: 'short_text',
        prompt:
          'Koi ek cheez jo energy kha rahi hai, use thoda kam kar sakte ho? Ya koi ek cheez jo energy deti hai, is hafte thodi zyada kar sakte ho?',
        helper: 'Chhote badlav bhi count hote hain. Agar abhi kuch bhi possible na lage, toh woh bhi jaanna kaam ka hai.',
      },
    ],
    closing: {
      text: 'Aapki energy kahan jaati hai, ye jaanna use bachane ka pehla kadam hai.',
    },
  },
};

const bringToSession: CatalogueEntry = {
  tool_id: 'ws_bring_to_session',
  label: 'What I want to bring to session',
  label_hi: 'Session mein kya le jaana chahta hoon',
  summary: "Jot down what you'd like to talk about next session.",
  summary_hi: 'Agle session mein kya baat karni hai, likh lo.',
  section: 'before_after',
  therapy_modality: 'Client-led agenda setting',
  therapist_note:
    'client-led agenda setting. If shared, it appears in session preparation.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 10,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      "Sessions can go by fast, and things slip your mind. Jot down what you'd like to talk about, so it's ready when you need it.",
    fields: [
      {
        id: 'on_mind',
        type: 'long_text',
        prompt: "What's been on your mind since last session?",
        required: true,
      },
      {
        id: 'hard_to_say',
        type: 'long_text',
        prompt: "Is there anything you've been finding hard to say out loud?",
        helper: 'You can write it here first. You decide whether to share it.',
      },
      {
        id: 'one_thing',
        type: 'short_text',
        prompt: 'If you could leave next session with one thing, what would it be?',
        example: 'A plan for exam week · Just feeling heard.',
      },
      {
        id: 'share_now',
        type: 'choice',
        prompt: 'Share with your therapist before the session?',
        options: [
          { value: 'share', label: 'Share' },
          { value: 'private', label: 'Keep private' },
        ],
      },
    ],
    closing: {
      text: 'Ready when you are.',
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Session jaldi nikal jaate hain, aur bahut baatein dimaag se nikal jaati hain. Jo kehna chahte ho woh likh lo, taaki waqt par taiyaar ho.',
    fields: [
      {
        id: 'on_mind',
        type: 'long_text',
        prompt: 'Pichhle session se ab tak kya cheez dimaag mein rahi?',
        required: true,
      },
      {
        id: 'hard_to_say',
        type: 'long_text',
        prompt: 'Koi aisi baat hai jo bolne mein mushkil lag rahi hai?',
        helper: 'Pehle yahan likh sakte ho. Share karna hai ya nahi, ye aap decide karte ho.',
      },
      {
        id: 'one_thing',
        type: 'short_text',
        prompt: 'Agar agle session se ek cheez lekar jaana ho, woh kya hogi?',
        example: 'Exam week ka plan · Bas suna hua mehsoos karna.',
      },
      {
        id: 'share_now',
        type: 'choice',
        prompt: 'Session se pehle therapist ke saath share karna hai?',
        options: [
          { value: 'share', label: 'Share karo' },
          { value: 'private', label: 'Private rakho' },
        ],
      },
    ],
    closing: {
      text: 'Jab aap taiyaar ho.',
    },
  },
};

const postSession: CatalogueEntry = {
  tool_id: 'ws_post_session',
  label: 'Post-session takeaway',
  label_hi: 'Session ke baad takeaway',
  summary: "Catch what stood out from today's session before it slips away.",
  summary_hi: 'Aaj ke session ki sabse badi baat sambhal lo, isse pehle ki woh bhool jaaye.',
  section: 'before_after',
  therapy_modality: 'Between-session consolidation',
  therapist_note:
    'holds on to learning between sessions; the main way insights from therapy reach the Treasure Box.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 20,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      'Right after a session is a good time to catch what stood out, before the day carries on.',
    fields: [
      {
        id: 'remember',
        type: 'long_text',
        prompt: "What's one thing you want to remember from today?",
        required: true,
        example: "Feeling anxious doesn't mean something bad is about to happen.",
      },
      {
        id: 'want_to_try',
        type: 'short_text',
        prompt: "Was there anything you'd like to try before next time?",
      },
      {
        id: 'didnt_sit_right',
        type: 'short_text',
        prompt: "Anything that didn't sit right, or that you'd like to come back to?",
        helper: "It's okay to disagree with something from session. That's worth bringing up next time.",
      },
      {
        id: 'save_it',
        type: 'choice',
        prompt: 'Save the first answer to your Treasure Box?',
        options: [
          { value: 'save', label: 'Save it' },
          { value: 'not_now', label: 'Not now' },
        ],
      },
    ],
    closing: {
      text: 'Kept safe for whenever you need it.',
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Session ke turant baad accha waqt hota hai ye dekhne ka ki kya baat alag laghi, isse pehle ki din aage badh jaaye.',
    fields: [
      {
        id: 'remember',
        type: 'long_text',
        prompt: 'Aaj se ek cheez kya yaad rakhna chahte ho?',
        required: true,
        example: 'Anxious lagne ka matlab ye nahi ki kuch bura hone wala hai.',
      },
      {
        id: 'want_to_try',
        type: 'short_text',
        prompt: 'Koi cheez hai jo agle session se pehle try karna chahte ho?',
      },
      {
        id: 'didnt_sit_right',
        type: 'short_text',
        prompt: 'Koi baat jo theek nahi lagi, ya jispe wapas aana chahte ho?',
        helper: 'Session ki kisi baat se sehmat na hona theek hai. Woh agli baar uthane layak hai.',
      },
      {
        id: 'save_it',
        type: 'choice',
        prompt: 'Pehla jawab apne Treasure Box mein save karein?',
        options: [
          { value: 'save', label: 'Save karo' },
          { value: 'not_now', label: 'Abhi nahi' },
        ],
      },
    ],
    closing: {
      text: 'Jab bhi zaroorat ho, sambhal ke rakha hai.',
    },
  },
};

export const energyLifeEntries: CatalogueEntry[] = [energyAudit];
export const beforeAfterEntries: CatalogueEntry[] = [bringToSession, postSession];
