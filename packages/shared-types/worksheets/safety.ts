/**
 * SAFETY — worksheet 16, the safety plan.
 *
 * Co-created: filled in during a session from the portal, and only the
 * therapist can edit it. It is never something a client opens and fills in
 * themselves, so `access_mode` is `in_session` and the client's Library shows
 * it only once a plan exists, read-only.
 *
 * Each part carries the question the therapist asks in session
 * (`therapistPrompt`). That string is stripped from every client view in
 * `toClientWorksheetView`, so the client never reads therapist framing.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

const safetyPlan: CatalogueEntry = {
  tool_id: 'ws_safety_plan',
  label: 'My plan for hard moments',
  label_hi: 'Mushkil palon ka mera plan',
  summary: 'The plan you made with your therapist for hard moments.',
  summary_hi: 'Mushkil palon ke liye woh plan jo aapne therapist ke saath banaya.',
  section: 'safety',
  therapy_modality: 'Collaborative safety planning',
  therapist_note:
    'follows the standard six-part structure of collaborative safety planning. Written in the client\'s own words during session; only the therapist can edit it. Reachable in one tap from the crisis screen.',
  access_mode: 'in_session',
  load_level: 'light',
  est_minutes: 15,
  sort_order: 10,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      "You made this with your therapist for times when things feel too much. It's here whenever you need it.",
    fields: [
      {
        id: 'signs',
        type: 'row_list',
        prompt: 'Signs a hard moment might be coming',
        therapistPrompt:
          'What thoughts, feelings, situations or behaviours tell you things are getting difficult?',
        columns: [{ id: 'item', label: 'Sign', type: 'text' }],
      },
      {
        id: 'on_my_own',
        type: 'row_list',
        prompt: 'Things I can do on my own to get through it',
        therapistPrompt: "What helps you, even a little, when you're by yourself?",
        columns: [{ id: 'item', label: 'What helps', type: 'text' }],
      },
      {
        id: 'people_places',
        type: 'row_list',
        prompt: 'People and places that help take my mind off it',
        therapistPrompt: 'Who or where can you be around, without having to talk about how you feel?',
        columns: [{ id: 'item', label: 'Who or where', type: 'text' }],
      },
      {
        id: 'ask_for_help',
        type: 'row_list',
        prompt: 'People I can ask for help',
        therapistPrompt: "Who could you tell that you're struggling?",
        columns: [
          { id: 'name', label: 'Name', type: 'text' },
          { id: 'phone', label: 'Phone', type: 'text' },
        ],
      },
      {
        id: 'professional',
        type: 'instruction',
        prompt: 'Professional and crisis support',
      },
      {
        id: 'safer_surroundings',
        type: 'row_list',
        prompt: 'Making my surroundings safer',
        therapistPrompt: 'What can you do to make your space safer during a hard moment?',
        columns: [{ id: 'item', label: 'What makes it safer', type: 'text' }],
      },
      {
        id: 'one_reason',
        type: 'short_text',
        prompt: 'One reason that matters to me',
        therapistPrompt: "What's something worth holding on to?",
      },
    ],
    closing: {
      buttons: [{ label: 'Get help now', action: 'get_help' }],
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Ye aapne apne therapist ke saath un waqton ke liye banaya hai jab sab kuch bahut zyada lagta hai. Jab zaroorat ho, ye yahan hai.',
    fields: [
      {
        id: 'signs',
        type: 'row_list',
        prompt: 'Mushkil waqt aane ke sanket',
        therapistPrompt:
          'Kaunsi soch, feeling, situation ya behaviour batati hai ki cheezein mushkil ho rahi hain?',
        columns: [{ id: 'item', label: 'Sanket', type: 'text' }],
      },
      {
        id: 'on_my_own',
        type: 'row_list',
        prompt: 'Woh cheezein jo main akela kar sakta hoon',
        therapistPrompt: 'Akele hone par kaunsi cheez madad karti hai, thodi si bhi?',
        columns: [{ id: 'item', label: 'Kya madad karta hai', type: 'text' }],
      },
      {
        id: 'people_places',
        type: 'row_list',
        prompt: 'Log aur jagah jo dhyan hataane mein madad karte hain',
        therapistPrompt: 'Kiske saath ya kahan reh sakte ho, bina ye batane ki ki aap kaisa feel kar rahe ho?',
        columns: [{ id: 'item', label: 'Kaun ya kahan', type: 'text' }],
      },
      {
        id: 'ask_for_help',
        type: 'row_list',
        prompt: 'Log jinse main madad maang sakta hoon',
        therapistPrompt: 'Kise bata sakte ho ki aap struggle kar rahe ho?',
        columns: [
          { id: 'name', label: 'Naam', type: 'text' },
          { id: 'phone', label: 'Phone', type: 'text' },
        ],
      },
      {
        id: 'professional',
        type: 'instruction',
        prompt: 'Professional aur crisis support',
      },
      {
        id: 'safer_surroundings',
        type: 'row_list',
        prompt: 'Apne aas-paas ko safe banana',
        therapistPrompt: 'Kya kar sakte ho jisse mushkil waqt mein aapki jagah zyada safe ho?',
        columns: [{ id: 'item', label: 'Kya safe banata hai', type: 'text' }],
      },
      {
        id: 'one_reason',
        type: 'short_text',
        prompt: 'Ek wajah jo mere liye maayne rakhti hai',
        therapistPrompt: 'Kaunsi cheez pakad ke rakhne layak hai?',
      },
    ],
    closing: {
      buttons: [{ label: 'Abhi madad lo', action: 'get_help' }],
    },
  },
};

export const safetyEntries: CatalogueEntry[] = [safetyPlan];
