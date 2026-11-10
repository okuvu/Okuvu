/**
 * UNTANGLE MY THOUGHTS — worksheets 5, 6 and 7.
 *
 * All three are assigned-only and demanding. The "above 5 out of 10" gate is
 * NOT here: it lives at the point that decides whether a demanding worksheet
 * may open (the safety step), not in the worksheet's own definition.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';
import { FEELINGS_EN, FEELINGS_HI } from '@okuvu/shared-types/worksheets/feelings';

const thoughtRecord: CatalogueEntry = {
  tool_id: 'ws_thought_record',
  label: 'Thought record',
  label_hi: 'Thought record',
  summary: 'Slow down one thought and look at it from a few sides.',
  summary_hi: 'Ek soch ko dheema karo aur use kai taraf se dekho.',
  section: 'untangle_thoughts',
  therapy_modality: 'CBT thought record',
  therapist_note:
    'classic CBT thought record. The other way of seeing it is written by the client only; OKUVU never suggests one.',
  access_mode: 'assigned',
  load_level: 'demanding',
  est_minutes: 10,
  sort_order: 10,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      'Thoughts can feel like facts, especially when they show up fast. This is a way to slow one down and look at it from a few sides. Pick one moment from today or this week.',
    fields: [
      {
        id: 'what_happened',
        type: 'short_text',
        prompt: 'What happened?',
        required: true,
        helper: 'Just the facts, like a camera would see it: where, when, who.',
        example: "My friend saw my message and didn't reply for five hours.",
      },
      {
        id: 'feelings',
        type: 'feelings_picker',
        prompt: 'What did you feel, and how strongly?',
        required: true,
        maxSelections: 3,
        withStrength: true,
        strengthPrompt: 'How strong is each one?',
        feelings: FEELINGS_EN,
      },
      {
        id: 'thought',
        type: 'long_text',
        prompt: 'What went through your mind?',
        required: true,
        helper: 'Write the thought the way it sounded in your head, even if it seems extreme.',
        example: "She's annoyed with me. I always say the wrong thing.",
      },
      {
        id: 'strongest_thought',
        type: 'short_text',
        prompt: 'Which thought feels the strongest?',
        required: true,
      },
      {
        id: 'belief_before',
        type: 'scale_0_100',
        prompt: 'How much do you believe it right now?',
        required: true,
      },
      {
        id: 'evidence_for',
        type: 'row_list',
        prompt: 'What makes this thought feel true?',
        helper: 'Things that actually happened, not guesses.',
        columns: [{ id: 'item', label: 'What makes it feel true', type: 'text' }],
      },
      {
        id: 'evidence_against',
        type: 'row_list',
        prompt: "What doesn't quite fit with this thought?",
        helper:
          "Anything that suggests it might not be the whole story. If you can't find anything yet, that's okay. Leave it and come back.",
        columns: [{ id: 'item', label: "What doesn't quite fit", type: 'text' }],
      },
      {
        id: 'another_view',
        type: 'long_text',
        prompt: 'Looking at both lists, is there another way to see this?',
        helper: "This doesn't have to be positive. It just has to be fair to all of what you wrote.",
      },
      {
        id: 'belief_after',
        type: 'scale_0_100',
        prompt: 'Now, how much do you believe the original thought?',
      },
      {
        id: 'feeling_after',
        type: 'scale_0_10',
        prompt: 'And how strong is the feeling now?',
      },
    ],
    closing: {
      text: "Whatever you found, you looked at your own mind with care. That's the practice.",
      buttons: [
        { label: 'Save to my Treasure Box', action: 'treasure_box' },
        { label: 'Done', action: 'done' },
      ],
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Soch kabhi sach jaisi lagti hai, khaas kar jab woh tezi se aati hai. Ye tareeka ek soch ko dheema karke use kai taraf se dekhne ka hai. Aaj ya is hafte ka ek pal chuno.',
    fields: [
      {
        id: 'what_happened',
        type: 'short_text',
        prompt: 'Kya hua tha?',
        required: true,
        helper: 'Bas facts, jaise camera dekhta hai: kahan, kab, kaun.',
        example: 'Mere dost ne message dekha aur paanch ghante reply nahi kiya.',
      },
      {
        id: 'feelings',
        type: 'feelings_picker',
        prompt: 'Aapko kya feel hua, aur kitna strong?',
        required: true,
        maxSelections: 3,
        withStrength: true,
        strengthPrompt: 'Har ek kitni strong hai?',
        feelings: FEELINGS_HI,
      },
      {
        id: 'thought',
        type: 'long_text',
        prompt: 'Dimaag mein kya chala?',
        required: true,
        helper: 'Soch ko waise likho jaise dimaag mein suni thi, chahe woh extreme lage.',
        example: 'Woh mujhse chidh gayi hai. Main hamesha galat bolta hoon.',
      },
      {
        id: 'strongest_thought',
        type: 'short_text',
        prompt: 'Kaunsi soch sabse strong lagti hai?',
        required: true,
      },
      {
        id: 'belief_before',
        type: 'scale_0_100',
        prompt: 'Abhi aap ise kitna sach maante ho?',
        required: true,
      },
      {
        id: 'evidence_for',
        type: 'row_list',
        prompt: 'Kya cheez is soch ko sach jaisa banati hai?',
        helper: 'Woh cheezein jo sach mein hui, andaze nahi.',
        columns: [{ id: 'item', label: 'Ise sach jaisa kya banata hai', type: 'text' }],
      },
      {
        id: 'evidence_against',
        type: 'row_list',
        prompt: 'Kya cheez is soch se poori tarah match nahi karti?',
        helper:
          'Kuch bhi jo bataye ki ye poori kahani nahi ho sakti. Agar abhi kuch na mile, koi baat nahi. Chhod do aur baad mein aao.',
        columns: [{ id: 'item', label: 'Jo poori tarah match nahi karta', type: 'text' }],
      },
      {
        id: 'another_view',
        type: 'long_text',
        prompt: 'Dono list dekhkar, kya ise dekhne ka koi aur tareeka hai?',
        helper: 'Ise positive hona zaroori nahi. Bas jo aapne likha, uske saath insaaf karna hai.',
      },
      {
        id: 'belief_after',
        type: 'scale_0_100',
        prompt: 'Ab original soch ko kitna sach maante ho?',
      },
      {
        id: 'feeling_after',
        type: 'scale_0_10',
        prompt: 'Aur ab feeling kitni strong hai?',
      },
    ],
    closing: {
      text: 'Jo bhi mila, aapne apne dimaag ko pyaar se dekha. Yahi practice hai.',
      buttons: [
        { label: 'Mere Treasure Box mein save karo', action: 'treasure_box' },
        { label: 'Ho gaya', action: 'done' },
      ],
    },
  },
};

const thinkingTrap: CatalogueEntry = {
  tool_id: 'ws_thinking_trap',
  label: 'Spot the thinking trap',
  label_hi: 'Thinking trap pehchano',
  summary: 'Notice when a thought is taking a mental shortcut.',
  summary_hi: 'Dhyan do jab koi soch dimaag ka shortcut le rahi ho.',
  section: 'untangle_thoughts',
  therapy_modality: 'CBT cognitive distortions',
  therapist_note:
    'names common thinking errors in plain language. Use after explaining thinking errors in session.',
  access_mode: 'assigned',
  load_level: 'demanding',
  est_minutes: 5,
  sort_order: 20,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      "Our minds have shortcuts. They're quick, but sometimes they take us somewhere unfair. See if any of these sound familiar.",
    fields: [
      {
        id: 'thought',
        type: 'short_text',
        prompt: "Write down a thought that's been bothering you.",
        required: true,
      },
      {
        id: 'patterns',
        type: 'checklist',
        prompt: 'Does it fit any of these patterns?',
        required: true,
        options: [
          {
            value: 'mind_reading',
            label: 'Mind reading',
            description: 'guessing what others think without checking.',
          },
          {
            value: 'fortune_telling',
            label: 'Fortune telling',
            description: 'being sure something will go badly.',
          },
          {
            value: 'all_or_nothing',
            label: 'All-or-nothing',
            description: "if it's not perfect, it's a failure.",
          },
          {
            value: 'catastrophising',
            label: 'Catastrophising',
            description: 'jumping to the worst possible outcome.',
          },
          {
            value: 'should_statements',
            label: 'Should statements',
            description: 'strict rules about how I or others must be.',
          },
          {
            value: 'labelling',
            label: 'Labelling',
            description: 'calling myself a name instead of describing what happened.',
          },
          {
            value: 'discounting_the_good',
            label: 'Discounting the good',
            description: "deciding positives don't count.",
          },
          {
            value: 'emotional_reasoning',
            label: 'Emotional reasoning',
            description: 'I feel it, so it must be true.',
          },
          {
            value: 'none',
            label: 'None of these fit.',
          },
        ],
      },
      {
        id: 'noticing',
        type: 'long_text',
        prompt: "What do you notice now that you've named it?",
      },
    ],
    closing: {
      text: "Spotting a pattern doesn't make the feeling wrong. It just gives you a little more room.",
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Dimaag ke paas shortcuts hote hain. Woh tez hote hain, par kabhi kabhi galat jagah le jaate hain. Dekho kya inme se kuch jaana-pehchana lagta hai.',
    fields: [
      {
        id: 'thought',
        prompt: 'Ek soch likho jo pareshan kar rahi hai.',
        type: 'short_text',
        required: true,
      },
      {
        id: 'patterns',
        type: 'checklist',
        prompt: 'Kya ye in patterns mein se kisi se match karti hai?',
        required: true,
        options: [
          {
            value: 'mind_reading',
            label: 'Mind reading',
            description: 'bina poochhe maan lena ki doosre kya soch rahe hain.',
          },
          {
            value: 'fortune_telling',
            label: 'Fortune telling',
            description: 'pakka maan lena ki kuch bura hi hoga.',
          },
          {
            value: 'all_or_nothing',
            label: 'All-or-nothing',
            description: 'perfect nahi toh fail.',
          },
          {
            value: 'catastrophising',
            label: 'Catastrophising',
            description: 'seedha sabse bura anjaam soch lena.',
          },
          {
            value: 'should_statements',
            label: 'Should statements',
            description: 'sakht niyam ki mujhe ya doosron ko aisa hi hona chahiye.',
          },
          {
            value: 'labelling',
            label: 'Labelling',
            description: 'kya hua ye batane ke bajaye khud ko ek naam de dena.',
          },
          {
            value: 'discounting_the_good',
            label: 'Discounting the good',
            description: 'achhi cheezein ginne layak nahi maanna.',
          },
          {
            value: 'emotional_reasoning',
            label: 'Emotional reasoning',
            description: 'mujhe aisa lagta hai, isliye sach hoga.',
          },
          {
            value: 'none',
            label: 'Inme se kuch bhi match nahi karta.',
          },
        ],
      },
      {
        id: 'noticing',
        type: 'long_text',
        prompt: 'Naam dene ke baad ab kya notice karte ho?',
      },
    ],
    closing: {
      text: 'Pattern pehchanne se feeling galat nahi ho jaati. Bas thodi si jagah ban jaati hai.',
    },
  },
};

const worryTree: CatalogueEntry = {
  tool_id: 'ws_worry_tree',
  label: 'Worry tree',
  label_hi: 'Worry tree',
  summary: 'Sort the worries you can act on from the ones that just keep circling.',
  summary_hi: 'Jo worries aap solve kar sakte ho unhe unse alag karo jo bas ghoomti rehti hain.',
  section: 'untangle_thoughts',
  therapy_modality: 'CBT worry postponement',
  therapist_note:
    'separates worries that need action from "what if" worries, then contains the rest with a set worry time.',
  access_mode: 'assigned',
  load_level: 'demanding',
  est_minutes: 5,
  sort_order: 30,
  status: 'approved',
  opens: 'worksheet',
  content_en: {
    version: 1,
    intro:
      'Some worries need action. Others just keep circling. This helps you sort which is which.',
    fields: [
      {
        id: 'worry',
        type: 'short_text',
        prompt: "What's the worry?",
        required: true,
        example: "What if I don't get placed this year?",
      },
      {
        id: 'when',
        type: 'choice',
        prompt: "Is this about something happening now, or a 'what if' about later?",
        required: true,
        options: [
          { value: 'now', label: 'Something happening now' },
          { value: 'what_if', label: "A 'what if'" },
        ],
      },
      {
        id: 'can_act',
        type: 'choice',
        prompt: 'Is there anything you can do about it?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'not_now', label: 'Not right now' },
        ],
      },
      {
        id: 'small_step',
        type: 'short_text',
        prompt: "What's one small step, and when could you do it?",
        visibleWhen: { field: 'can_act', in: ['yes'] },
      },
      {
        id: 'step_when',
        type: 'datetime',
        prompt: 'When could you do it?',
        withDate: true,
        withTime: true,
        visibleWhen: { field: 'can_act', in: ['yes'] },
      },
      {
        id: 'worry_slot',
        type: 'datetime',
        prompt: 'Park it for worry time.',
        helper:
          "When the worry shows up before then, remind yourself: 'I've got a time for this.' Then bring your attention back to what you're doing.",
        withDate: true,
        withTime: true,
        visibleWhen: { field: 'can_act', in: ['not_now'] },
      },
      {
        id: 'worry_time_review',
        type: 'long_text',
        prompt: 'Look back at what you parked. Does it still feel as urgent? Is there anything you can do about it now?',
        visibleWhen: { field: 'can_act', in: ['not_now'] },
      },
    ],
    closing: {
      text: "You don't have to solve everything at once.",
    },
  },
  content_hi: {
    version: 1,
    intro:
      'Kuch worries ke liye kuch karna padta hai. Kuch bas ghoomti rehti hain. Ye unhe alag karne mein madad karta hai.',
    fields: [
      {
        id: 'worry',
        type: 'short_text',
        prompt: 'Worry kya hai?',
        required: true,
        example: 'Agar is saal placement nahi mili toh?',
      },
      {
        id: 'when',
        type: 'choice',
        prompt: 'Ye ab ho rahi kisi cheez ke baare mein hai, ya aage ke "kya hoga" ke baare mein?',
        required: true,
        options: [
          { value: 'now', label: 'Ab ho rahi koi cheez' },
          { value: 'what_if', label: 'Aage ka "kya hoga"' },
        ],
      },
      {
        id: 'can_act',
        type: 'choice',
        prompt: 'Kya aap iske baare mein kuch kar sakte ho?',
        required: true,
        options: [
          { value: 'yes', label: 'Haan' },
          { value: 'not_now', label: 'Abhi nahi' },
        ],
      },
      {
        id: 'small_step',
        type: 'short_text',
        prompt: 'Ek chhota kadam kya ho sakta hai, aur kab kar sakte ho?',
        visibleWhen: { field: 'can_act', in: ['yes'] },
      },
      {
        id: 'step_when',
        type: 'datetime',
        prompt: 'Kab kar sakte ho?',
        withDate: true,
        withTime: true,
        visibleWhen: { field: 'can_act', in: ['yes'] },
      },
      {
        id: 'worry_slot',
        type: 'datetime',
        prompt: 'Ise worry time ke liye park kar do.',
        helper:
          "Jab us time se pehle worry aaye, khud ko yaad dilao: 'Iske liye mere paas time hai.' Phir apna dhyan wapas us kaam par lao jo kar rahe ho.",
        withDate: true,
        withTime: true,
        visibleWhen: { field: 'can_act', in: ['not_now'] },
      },
      {
        id: 'worry_time_review',
        type: 'long_text',
        prompt: 'Jo park kiya tha use dobara dekho. Kya ab bhi utna urgent lagta hai? Ab iske baare mein kuch kar sakte ho?',
        visibleWhen: { field: 'can_act', in: ['not_now'] },
      },
    ],
    closing: {
      text: 'Sab kuch ek saath solve karna zaroori nahi.',
    },
  },
};

export const untangleThoughtsEntries: CatalogueEntry[] = [
  thoughtRecord,
  thinkingTrap,
  worryTree,
];
