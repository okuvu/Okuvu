/**
 * DO WHAT MATTERS — worksheets 8 and 9.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

const smallThings: CatalogueEntry = {
  tool_id: 'ws_small_things',
  label: 'Small things planner',
  label_hi: 'Chhoti cheezein planner',
  summary: 'Plan a few small things for the coming days. Tiny is fine.',
  summary_hi: 'Aane wale dino ke liye kuch chhoti cheezein plan karo. Chhoti bhi theek hai.',
  section: 'do_what_matters',
  therapy_modality: 'Behavioural activation',
  therapist_note:
    'behavioural activation with achievement and enjoyment ratings. Light so it stays open on low-mood days, when it matters most.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 10,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      "When you're low, waiting to feel like doing something can take forever. Sometimes doing a small thing comes first, and the feeling follows a little. Plan a few small things. Tiny is fine.",
    fields: [
      {
        id: 'plan',
        type: 'row_list',
        prompt: 'Plan up to three small things for the next few days.',
        helper:
          'Mix it up if you can: one thing you enjoy, one thing that gets something done, one thing that connects you with someone.',
        example: 'Walk to the chai stall · Reply to one pending email · Send a meme to my cousin.',
        maxRows: 3,
        columns: [
          { id: 'what', label: 'What', type: 'text' },
          { id: 'when', label: 'When', type: 'datetime' },
        ],
      },
      {
        id: 'did_it',
        type: 'choice',
        prompt: 'Did you do it?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'partly', label: 'Partly' },
          { value: 'no', label: 'Not this time' },
        ],
      },
      {
        id: 'achievement',
        type: 'scale_0_10',
        prompt: 'How much did it feel like an achievement?',
        visibleWhen: { field: 'did_it', in: ['yes', 'partly'] },
      },
      {
        id: 'enjoyment',
        type: 'scale_0_10',
        prompt: 'How much did you enjoy it?',
        visibleWhen: { field: 'did_it', in: ['yes', 'partly'] },
      },
      {
        id: 'what_got_in_the_way',
        type: 'short_text',
        prompt: 'What got in the way?',
        helper: 'No judgement. This helps you and your therapist plan better.',
        visibleWhen: { field: 'did_it', in: ['no'] },
      },
    ],
    closing: {
      text: "Every small thing counts, including the ones that didn't happen. You're learning what works for you.",
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Jab mood low hota hai, "man kare tab karunga" ka intezaar bahut lamba ho jaata hai. Kabhi kabhi chhota kaam pehle karna padta hai, aur feeling thodi si peeche aati hai. Kuch chhote kaam plan karo. Bahut chhote bhi chalenge.',
    fields: [
      {
        id: 'plan',
        type: 'row_list',
        prompt: 'Aane wale kuch dino ke liye teen tak chhote kaam plan karo.',
        helper:
          'Ho sake toh mix karo: ek cheez jo aapko pasand hai, ek jo kaam nikal de, ek jo kisi se judne mein madad kare.',
        example: 'Chai ki thela tak paidal jana · Ek pending email ka jawab · Cousin ko meme bhejna.',
        maxRows: 3,
        columns: [
          { id: 'what', label: 'Kya', type: 'text' },
          { id: 'when', label: 'Kab', type: 'datetime' },
        ],
      },
      {
        id: 'did_it',
        type: 'choice',
        prompt: 'Kya aapne kiya?',
        options: [
          { value: 'yes', label: 'Haan' },
          { value: 'partly', label: 'Thoda sa' },
          { value: 'no', label: 'Is baar nahi' },
        ],
      },
      {
        id: 'achievement',
        type: 'scale_0_10',
        prompt: 'Kitna achievement jaisa laga?',
        visibleWhen: { field: 'did_it', in: ['yes', 'partly'] },
      },
      {
        id: 'enjoyment',
        type: 'scale_0_10',
        prompt: 'Kitna maza aaya?',
        visibleWhen: { field: 'did_it', in: ['yes', 'partly'] },
      },
      {
        id: 'what_got_in_the_way',
        type: 'short_text',
        prompt: 'Beech mein kya aaya?',
        helper:
          'Koi judgement nahi. Isse aapko aur aapke therapist ko behtar plan banane mein madad milti hai.',
        visibleWhen: { field: 'did_it', in: ['no'] },
      },
    ],
    closing: {
      text: 'Har chhoti cheez count hoti hai, woh bhi jo nahi hui. Aap seekh rahe ho ki aapke liye kya kaam karta hai.',
    },
  },
};

const valuesCompass: CatalogueEntry = {
  tool_id: 'ws_values_compass',
  label: 'Values compass',
  label_hi: 'Values compass',
  summary: 'Notice what matters to you, and take one small step towards it.',
  summary_hi: 'Dekho aapke liye kya maayne rakhta hai, aur us taraf ek chhota kadam lo.',
  section: 'do_what_matters',
  therapy_modality: 'ACT values work',
  therapist_note: 'ACT values work across life areas, ending in one small committed step.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 20,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      'Goals are things you finish. Values are directions you keep walking in, like being a caring friend or someone who keeps learning. This helps you notice what matters to you.',
    fields: [
      {
        id: 'areas',
        type: 'checklist',
        prompt: 'Which areas of life matter most to you right now?',
        required: true,
        maxSelections: 3,
        options: [
          { value: 'family', label: 'family' },
          { value: 'friendships', label: 'friendships' },
          { value: 'love', label: 'love and relationships' },
          { value: 'studies_work', label: 'studies or work' },
          { value: 'health', label: 'health and body' },
          { value: 'fun_rest', label: 'fun and rest' },
          { value: 'community', label: 'community and giving back' },
          { value: 'growth', label: 'growth and learning' },
          { value: 'faith', label: 'faith or spirituality' },
        ],
      },
      {
        id: 'who_there',
        type: 'row_list',
        prompt: 'For each area: what kind of person do you want to be there?',
        helper: 'Describe how you want to act, not what you want to get.',
        example: 'For friendships: "Someone who shows up, even when it\u2019s inconvenient."',
        maxRows: 3,
        columns: [
          { id: 'area', label: 'Area', type: 'text' },
          { id: 'person', label: 'What kind of person', type: 'text' },
        ],
      },
      {
        id: 'how_close',
        type: 'row_list',
        prompt: 'How close are you living to that right now?',
        helper: "This isn't a score of how good you are. It just shows where you'd like to move.",
        maxRows: 3,
        columns: [
          { id: 'area', label: 'Area', type: 'text' },
          { id: 'closeness', label: 'How close', type: 'scale_0_10' },
        ],
      },
      {
        id: 'one_step',
        type: 'short_text',
        prompt:
          "Pick one area. What's one small thing you could do this week that points in that direction?",
      },
      {
        id: 'step_date',
        type: 'datetime',
        prompt: 'When could you do it?',
        withDate: true,
      },
    ],
    closing: {
      text: "You don't need to feel ready to take a step in a direction you care about.",
      buttons: [
        { label: 'Save to my Treasure Box', action: 'treasure_box' },
        { label: 'Done', action: 'done' },
      ],
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Goals woh cheezein hain jo poori ho jaati hain. Values woh disha hain jinme aap chalte rehte ho, jaise ek samajhdaar dost hona ya seekhte rehna. Ye aapko dekhne mein madad karta hai ki aapke liye kya maayne rakhta hai.',
    fields: [
      {
        id: 'areas',
        type: 'checklist',
        prompt: 'Abhi zindagi ke kaunse hisse aapke liye sabse zyada maayne rakhte hain?',
        required: true,
        maxSelections: 3,
        options: [
          { value: 'family', label: 'parivaar' },
          { value: 'friendships', label: 'dost' },
          { value: 'love', label: 'pyaar aur rishtey' },
          { value: 'studies_work', label: 'padhai ya kaam' },
          { value: 'health', label: 'sehat aur body' },
          { value: 'fun_rest', label: 'masti aur aaram' },
          { value: 'community', label: 'samaaj aur doosron ki madad' },
          { value: 'growth', label: 'seekhna aur aage badhna' },
          { value: 'faith', label: 'vishwas ya aadhyatm' },
        ],
      },
      {
        id: 'who_there',
        type: 'row_list',
        prompt: 'Har hisse ke liye: wahan aap kaise insaan banna chahte ho?',
        helper: 'Bataye ki aap kaise pesh aana chahte ho, ye nahi ki kya paana chahte ho.',
        example: 'Dosti ke liye: "Woh insaan jo mushkil ho tab bhi saath khada ho."',
        maxRows: 3,
        columns: [
          { id: 'area', label: 'Hissa', type: 'text' },
          { id: 'person', label: 'Kaise insaan', type: 'text' },
        ],
      },
      {
        id: 'how_close',
        type: 'row_list',
        prompt: 'Abhi aap us hisse mein kitna karib jee rahe ho?',
        helper:
          'Ye aapke achhe hone ka score nahi hai. Bas batata hai ki aap kahan jaana chahte ho.',
        maxRows: 3,
        columns: [
          { id: 'area', label: 'Hissa', type: 'text' },
          { id: 'closeness', label: 'Kitna karib', type: 'scale_0_10' },
        ],
      },
      {
        id: 'one_step',
        type: 'short_text',
        prompt: 'Ek hissa chuno. Is hafte ek chhoti cheez kya ho sakti hai jo us disha mein le jaaye?',
      },
      {
        id: 'step_date',
        type: 'datetime',
        prompt: 'Kab kar sakte ho?',
        withDate: true,
      },
    ],
    closing: {
      text: 'Jis disha ki aapko parwah hai, us taraf kadam ke liye taiyaar mehsoos karna zaroori nahi.',
      buttons: [
        { label: 'Mere Treasure Box mein save karo', action: 'treasure_box' },
        { label: 'Ho gaya', action: 'done' },
      ],
    },
  },
};

export const doWhatMattersEntries: CatalogueEntry[] = [smallThings, valuesCompass];
