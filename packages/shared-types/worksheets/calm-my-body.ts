/**
 * CALM MY BODY — the existing grounding exercise and the four breathing
 * techniques, as they appear in the Library.
 *
 * Neither is a new worksheet. Grounding already exists with approved wording,
 * so only the additions from the approved document are stored here: the
 * "How are you feeling now?" slider and the closing line with its two buttons.
 * Breathing is one card that opens the four techniques already in the player;
 * guided breathing was retired in clinical review v2.0.0 and stays hidden.
 */
import type { CatalogueEntry } from './types';

const grounding: CatalogueEntry = {
  tool_id: 'grounding_5431',
  label: '5-4-3-2-1 grounding',
  label_hi: '5-4-3-2-1 grounding',
  summary:
    '5-4-3-2-1 grounding — notice five things you can see, four you can touch, three you can hear, two you can smell, one you can taste.',
  summary_hi:
    'Paanch cheezein dekho, chaar chizo ko chuo, teen cheezein suno, do cheezein sungo, ek cheez ka swaad lo.',
  section: 'calm_my_body',
  therapy_modality: 'Sensory grounding (for high arousal, dissociation, panic)',
  therapist_note: 'grounding through the senses for high distress, dissociation or panic.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 10,
  status: 'approved',
  opens: 'grounding',
  content_en: {
    version: 1,
    fields: [
      {
        id: 'feeling_after',
        type: 'scale_0_10',
        prompt: 'How are you feeling now?',
      },
    ],
    closing: {
      text: "You're here. Take whatever time you need before moving on.",
      buttons: [
        { label: 'Open my Treasure Box', action: 'treasure_box' },
        { label: 'Done for now', action: 'done' },
      ],
    },
  },
  content_hi: {
    version: 1,
    fields: [
      {
        id: 'feeling_after',
        type: 'scale_0_10',
        prompt: 'Ab kaisa lag raha hai?',
      },
    ],
    closing: {
      text: 'Aap yahan ho. Aage badhne se pehle jitna time chahiye le lo.',
      buttons: [
        { label: 'Mera Treasure Box kholo', action: 'treasure_box' },
        { label: 'Abhi ke liye bas', action: 'done' },
      ],
    },
  },
};

const breathing: CatalogueEntry = {
  tool_id: 'breathing',
  label: 'Breathing',
  label_hi: 'Breathing',
  summary: 'Slow your breathing with four short exercises.',
  summary_hi: 'Chaar chhoti exercises se apni breathing dheemi karo.',
  section: 'calm_my_body',
  therapy_modality: 'Paced breathing',
  therapist_note:
    'four paced-breathing techniques; each keeps its own clinically reviewed description.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 20,
  status: 'approved',
  opens: 'breathing',
  content_en: {
    version: 1,
    fields: [
      {
        id: 'feeling_after',
        type: 'scale_0_10',
        prompt: 'How are you feeling now?',
      },
    ],
  },
  content_hi: {
    version: 1,
    fields: [
      {
        id: 'feeling_after',
        type: 'scale_0_10',
        prompt: 'Ab kaisa lag raha hai?',
      },
    ],
  },
};

export const calmMyBodyEntries: CatalogueEntry[] = [grounding, breathing];
