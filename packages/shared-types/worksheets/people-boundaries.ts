/**
 * PEOPLE & BOUNDARIES — worksheet 10.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

const hardConversation: CatalogueEntry = {
  tool_id: 'ws_hard_conversation',
  label: 'Plan a hard conversation',
  label_hi: 'Mushkil conversation plan karo',
  summary: 'Plan what you want to say before a difficult conversation.',
  summary_hi: 'Mushkil baat se pehle plan karo ki aap kya kehna chahte ho.',
  section: 'people_boundaries',
  therapy_modality: 'DBT interpersonal effectiveness (DEAR MAN)',
  therapist_note:
    'DBT interpersonal effectiveness (DEAR MAN structure), in plain language. The skill name appears only in a small "Based on" line, so it stays approachable.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 10,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      'Asking for something, or saying no, is hard, especially with family or people you care about. Planning what you want to say can make it feel less overwhelming. You choose whether and when to use it.',
    fields: [
      {
        id: 'who_what',
        type: 'short_text',
        prompt: "Who is this conversation with, and what's it about?",
        required: true,
        example: 'My dad, about taking a gap semester.',
      },
      {
        id: 'outcome',
        type: 'short_text',
        prompt: 'What do you want to come out of it?',
        required: true,
        helper:
          "Be as clear as you can, for example 'I want them to hear my reasons' or 'I want to say no to the trip.'",
      },
      {
        id: 'describe',
        type: 'short_text',
        prompt: "Describe: What's the situation, just the facts?",
        required: true,
      },
      {
        id: 'express',
        type: 'short_text',
        prompt: "Express: How do you feel about it? Try starting with 'I feel…'",
        required: true,
      },
      {
        id: 'ask',
        type: 'short_text',
        prompt: 'Ask: What exactly are you asking for, or saying no to?',
        required: true,
      },
      {
        id: 'reinforce',
        type: 'short_text',
        prompt: 'Reinforce: Why might this be good for them too, or for your relationship?',
      },
      {
        id: 'stay_on_track',
        type: 'short_text',
        prompt:
          "Stay on track: If the conversation drifts or gets heated, what's one line you can come back to?",
        example: "I hear you. I'd still like us to think about this.",
      },
      {
        id: 'stay_steady',
        type: 'checklist',
        prompt: 'Stay steady: How do you want to sound: calm, firm, kind?',
        options: [
          { value: 'calm', label: 'calm' },
          { value: 'firm', label: 'firm' },
          { value: 'kind', label: 'kind' },
        ],
      },
      {
        id: 'be_open',
        type: 'short_text',
        prompt: "Be open: What could you accept if you can't get everything you want?",
      },
      {
        id: 'summary',
        type: 'instruction',
        prompt: "Here's your plan.",
        showAnswers: true,
      },
    ],
    closing: {
      text: "You don't control how they respond. You can control how clearly you show up.",
      buttons: [
        { label: 'Save to my Treasure Box', action: 'treasure_box' },
        { label: 'Done', action: 'done' },
      ],
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Kuch maangna, ya na kehna, mushkil hota hai — khaas kar ghar walon ya apne logon ke saath. Pehle se soch lena ki kya kehna hai, ise thoda aasan bana deta hai. Use karna hai ya nahi, kab karna hai, ye aap decide karte ho.',
    fields: [
      {
        id: 'who_what',
        type: 'short_text',
        prompt: 'Ye baat kisse karni hai, aur kis baare mein?',
        required: true,
        example: 'Papa se, gap semester lene ke baare mein.',
      },
      {
        id: 'outcome',
        type: 'short_text',
        prompt: 'Aap chahte ho iska natija kya ho?',
        required: true,
        helper:
          "Jitna saaf keh sako kaho, jaise 'Main chahta hoon woh mere reasons sunein' ya 'Main trip ke liye na kehna chahta hoon.'",
      },
      {
        id: 'describe',
        type: 'short_text',
        prompt: 'Describe: Situation kya hai, sirf facts?',
        required: true,
      },
      {
        id: 'express',
        type: 'short_text',
        prompt: "Express: Aapko is baare mein kaisa lagta hai? 'I feel…' se shuru karke dekho",
        required: true,
      },
      {
        id: 'ask',
        type: 'short_text',
        prompt: 'Ask: Aap exactly kya maang rahe ho, ya kis baat ko na keh rahe ho?',
        required: true,
      },
      {
        id: 'reinforce',
        type: 'short_text',
        prompt: 'Reinforce: Ye unke liye bhi achha kyun ho sakta hai, ya rishte ke liye?',
      },
      {
        id: 'stay_on_track',
        type: 'short_text',
        prompt:
          'Stay on track: Baat bhatak jaaye ya garam ho jaaye, toh wapas aane ke liye aapki ek line kya hogi?',
        example: 'Main sun raha hoon. Phir bhi chahta hoon ki hum is baare mein sochein.',
      },
      {
        id: 'stay_steady',
        type: 'checklist',
        prompt: 'Stay steady: Aap kaisa sunai dena chahte ho: shaant, pakka, ya narm?',
        options: [
          { value: 'calm', label: 'shaant' },
          { value: 'firm', label: 'pakka' },
          { value: 'kind', label: 'narm' },
        ],
      },
      {
        id: 'be_open',
        type: 'short_text',
        prompt: 'Be open: Poora nahi mila toh aap kya accept kar sakte ho?',
      },
      {
        id: 'summary',
        type: 'instruction',
        prompt: 'Ye aapka plan hai.',
        showAnswers: true,
      },
    ],
    closing: {
      text: 'Unka jawab aapke haath mein nahi hai. Aapke haath mein ye hai ki aap kitni saaf tarah se pesh aate ho.',
      buttons: [
        { label: 'Mere Treasure Box mein save karo', action: 'treasure_box' },
        { label: 'Ho gaya', action: 'done' },
      ],
    },
  },
};

export const peopleBoundariesEntries: CatalogueEntry[] = [hardConversation];
