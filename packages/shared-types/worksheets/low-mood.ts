/**
 * LOW MOOD — the nine worksheets the owner briefed on 24 November 2026.
 *
 * STATUS, 24 November 2026: every row is `approved`. The owner read the draft
 * wording and approved all nine — five as written, four after the revisions he
 * asked for (Things I might enjoy: "Sitting outside at sunset"; Reconnect
 * planner: "Who would you like to be back in touch with?"; The morning after a
 * miracle: "This is a question therapists often ask"; Strengths spotting: a
 * "Something of my own" option with its own short answer). The approval lives in
 * its own generated migration, and this file is the copy that migration writes.
 *
 * Rule 2 of the standing rules (every new worksheet starts switched off) was
 * honoured: all nine were `draft` — unlistable, unopenable, unassignable — from
 * the moment they were built until the owner said the wording was approved.
 *
 * The owner's brief, one line each:
 *
 *  1 One small thing        open      six tiny actions or your own, then did it / not this time
 *  2 Mood and activity log  open      time, what I was doing, feelings; a week read back in words
 *  3 Strengths spotting     open      a checklist of strengths, and one recent time you used one
 *  4 Things I might enjoy   open      everyday ideas, and the picked ones carried to the planner
 *  5 Tiny steps ladder      assigned  the problem, steps smallest first, a date for the first
 *  6 Meet the inner critic  assigned  name it, what it says, when it is loudest, what you'd say back
 *  7 Reconnect planner      assigned  people you miss, how to reach out, a date, then did it / not yet
 *  8 Comparison check       assigned  where, feelings, what you compared to, what it doesn't show
 *  9 The morning after a miracle  assigned  what you'd notice first, where you are, one step up
 *
 * Five of them were already sitting in the catalogue as placeholders and keep
 * their existing ids: Strengths spotting (filed as "Strengths"), Tiny steps
 * ladder ("Tiny steps"), Meet the inner critic, Comparison check, and The
 * morning after a miracle ("The miracle question"). The placeholder rows are
 * removed from `placeholders.ts` in the same change, and the generated seed
 * migration that created them stays byte-identical — the drafts migration
 * upgrades those rows in place through ON CONFLICT.
 *
 * Two of them carry the deeper safety screen (`sensitive_check: true`), because
 * the owner named them in the standing rules of 24 Nov 2026 as worksheets that
 * must also watch for skipped meals, restricted food, making yourself sick,
 * punishing exercise, hating your body, days without sleep, wanting not to wake
 * up, wanting to hurt someone, and self-harm: Meet the inner critic and the
 * Comparison check. Every other answer on every row still goes through the same
 * safety check the journal uses.
 *
 * None of them asks for weight, body measurements, calories, food amounts or
 * medicines, and none of them adds answers into a total, a level or a label
 * (rules 3 and 5). The one log — Mood and activity log — reads back in words
 * only, with no score and no average.
 *
 * This is the approved copy. If any of it changes, it changes as a revision the
 * owner reads first, and the change carries its own migration.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';
import { FEELINGS_EN } from '@okuvu/shared-types/worksheets/feelings';

const oneSmallThing: CatalogueEntry = {
  tool_id: 'ws_one_small_thing',
  label: 'One small thing',
  label_hi: null,
  summary: 'One tiny thing for a heavy day. Tiny is the point.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Behavioural activation (single-step)',
  therapist_note:
    'one action from six, or their own, then whether it happened. Deliberately single-step and tiny, so it stays possible on the heaviest days.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 60,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "On a heavy day, the list of everything you should be doing can be the heaviest thing of all. Let's shrink it to one small thing — something so small it almost feels too easy.",
    fields: [
      {
        id: 'pick',
        type: 'choice',
        prompt: "What's one small thing you could do right now?",
        helper: 'Pick whatever feels possible today. Nothing here is too small.',
        required: true,
        options: [
          { value: 'drink_water', label: 'Drink a glass of water' },
          { value: 'open_window', label: 'Open a window' },
          { value: 'wash_face', label: 'Wash my face' },
          { value: 'step_outside', label: 'Step outside for two minutes' },
          { value: 'message_someone', label: 'Message one person' },
          { value: 'one_song', label: 'Put on one song' },
          { value: 'something_else', label: 'Something of my own' },
        ],
      },
      {
        id: 'own_thing',
        type: 'short_text',
        prompt: "What's your small thing?",
        helper: 'Anything at all. It only has to be doable today.',
        required: true,
        visibleWhen: { field: 'pick', in: ['something_else'] },
      },
      {
        id: 'did_it',
        type: 'choice',
        prompt: 'Did it happen?',
        helper: 'Both answers are fine.',
        options: [
          { value: 'yes', label: 'Did it' },
          { value: 'no', label: 'Not this time' },
        ],
      },
    ],
    closing: {
      text: "Either way, you showed up on a heavy day. That isn't nothing.",
    },
  },
  content_hi: null,
};

const moodActivityLog: CatalogueEntry = {
  tool_id: 'ws_mood_activity_log',
  label: 'Mood and activity log',
  label_hi: null,
  summary: 'Note what you were doing and how it felt, then read the week in your own words.',
  summary_hi: null,
  section: 'energy_life',
  therapy_modality: 'Behavioural activation (activity and mood monitoring)',
  therapist_note:
    'activity and mood monitored together, one entry per save. The week reads back grouped by the activity words the client used, with the feelings they picked — no score, no average, no ranking of feelings.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 60,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "How you feel and what you're doing are more connected than they look. Log a few moments across the week, and you can read back which things tended to come with which feelings.",
    fields: [
      {
        id: 'when',
        type: 'datetime',
        prompt: 'When was this?',
        withDate: true,
        withTime: true,
        required: true,
      },
      {
        id: 'doing',
        type: 'short_text',
        prompt: 'What were you doing?',
        helper:
          "A few words is plenty — \"chai with a friend\", \"walk after dinner\", \"scrolling in bed\".",
        required: true,
      },
      {
        id: 'feelings',
        type: 'feelings_picker',
        prompt: 'How did you feel?',
        helper: 'Pick up to three.',
        required: true,
        feelings: FEELINGS_EN,
        maxSelections: 3,
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: 'Anything you notice, looking back over the week?',
        helper: "There's no right answer. This is just for you.",
      },
    ],
    closing: {
      text: 'Each entry is one moment. It is not a verdict on the week.',
    },
    review: { withinDays: 7, activityField: 'doing', feelingsField: 'feelings' },
  },
  content_hi: null,
};

const strengthsSpotting: CatalogueEntry = {
  tool_id: 'ws_strengths',
  label: 'Strengths spotting',
  label_hi: null,
  summary: "Notice what you're already good at, and one time you used it.",
  summary_hi: null,
  section: 'be_kinder',
  therapy_modality: 'Strengths identification',
  therapist_note:
    'ticks only, then one concrete recent example, so a strength lands as evidence rather than a compliment. Light on purpose.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 30,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "Low mood makes strengths hard to see. They stop feeling like strengths and start feeling like nothing special. They are still there. This is a few minutes of looking properly.",
    fields: [
      {
        id: 'strengths',
        type: 'checklist',
        prompt: 'Which of these are true of you, at least some of the time?',
        helper: "Tick as many as fit. This isn't boasting — it's just true.",
        minSelections: 1,
        options: [
          { value: 'kind', label: 'Kind' },
          { value: 'loyal', label: 'Loyal' },
          { value: 'funny', label: 'Funny' },
          { value: 'good_listener', label: 'A good listener' },
          { value: 'curious', label: 'Curious' },
          { value: 'patient', label: 'Patient' },
          { value: 'honest', label: 'Honest' },
          { value: 'creative', label: 'Creative' },
          { value: 'determined', label: 'Determined' },
          { value: 'thoughtful', label: 'Thoughtful' },
          { value: 'practical', label: 'Practical' },
          { value: 'brave', label: 'Brave' },
          { value: 'something_of_my_own', label: 'Something of my own' },
        ],
      },
      {
        id: 'own_strength',
        type: 'short_text',
        prompt: 'What strength would you add?',
        helper: 'In your own words — anything you notice about yourself counts.',
        required: true,
        visibleWhen: { field: 'strengths', in: ['something_of_my_own'] },
      },
      {
        id: 'recent',
        type: 'short_text',
        prompt: 'One time recently you used one of them',
        helper: 'Even a small time counts — holding a door, remembering something, saying no.',
        required: true,
      },
    ],
    closing: {
      text: "You didn't have to become someone else to have these. They were already yours.",
    },
  },
  content_hi: null,
};

const thingsIMightEnjoy: CatalogueEntry = {
  tool_id: 'ws_things_i_might_enjoy',
  label: 'Things I might enjoy',
  label_hi: null,
  summary: 'Everyday things worth trying, and a way to carry the ones you pick into your planner.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Behavioural activation (activity menu)',
  therapist_note:
    'a menu to lower the cost of choosing an activity. Picked ideas are carried into the client-wide Small things planner; the planner itself is untouched.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 100,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "When you've felt low for a while, it's easy to forget what you actually enjoy, or to believe nothing would help anyway. Here are some ordinary things. Tick anything that sounds even slightly possible.",
    fields: [
      {
        id: 'ideas',
        type: 'checklist',
        prompt: 'Which of these might be worth a try?',
        helper: 'Nothing here is a rule, and nothing has to be done today.',
        minSelections: 1,
        options: [
          { value: 'chai_with_friend', label: 'Chai with a friend' },
          { value: 'walk', label: 'A walk, anywhere' },
          { value: 'cook_something', label: 'Cooking something simple' },
          { value: 'game', label: 'A game — phone, board or cards' },
          { value: 'music', label: 'Music, loud or quiet' },
          { value: 'call_cousin', label: 'Calling a cousin' },
          { value: 'street_food', label: 'Street food you like' },
          { value: 'cycle', label: 'A cycle ride' },
          { value: 'cricket', label: 'Cricket, watching or playing' },
          { value: 'terrace_sunset', label: 'Sitting outside at sunset' },
          { value: 'drawing', label: 'Drawing or doodling' },
          { value: 'film_with_someone', label: 'A film with someone' },
        ],
      },
    ],
    closing: {
      text: "Picking is the easy half. When you're ready, the planner is somewhere to put the ones you chose.",
      handOff: {
        toolId: 'ws_small_things',
        field: 'ideas',
        label: 'Take these to my Small things planner',
        // Where the picks land in the planner: its own list, in its "What"
        // column. Named here so the screen hard-codes nothing and the button
        // needs no network round-trip.
        targetField: 'plan',
        targetColumn: 'what',
      },
    },
  },
  content_hi: null,
};

const tinyStepsLadder: CatalogueEntry = {
  tool_id: 'ws_tiny_steps',
  label: 'Tiny steps ladder',
  label_hi: null,
  summary: 'Turn one big thing into steps, from the smallest to the biggest.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Task decomposition',
  therapist_note:
    'task breakdown with the first step scheduled. Smallest first, so the ladder is a way in rather than a to-do list.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 110,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "A big task stays impossible while it's still one big task. Broken into steps, the first one is usually something you could do today.",
    fields: [
      {
        id: 'problem',
        type: 'short_text',
        prompt: "What's the thing you've been putting off?",
        helper: "One line. It doesn't have to be worded well.",
        required: true,
      },
      {
        id: 'steps',
        type: 'row_list',
        prompt: 'What are the steps, smallest first?',
        helper:
          "Start with something almost too easy. The last one can be big — you won't be doing it today.",
        maxRows: 8,
        addLabel: 'Add another step',
        columns: [{ id: 'step', label: 'Step', type: 'text' }],
      },
      {
        id: 'first_step_on',
        type: 'datetime',
        prompt: 'When will you do the first one?',
        helper: 'A day is enough. If it slips, it slips — you can change it.',
        withDate: true,
        withTime: false,
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: 'Which step feels most doable right now?',
      },
    ],
    closing: {
      text: "You don't have to climb it today. You just have to know where the first step is.",
    },
  },
  content_hi: null,
};

const innerCritic: CatalogueEntry = {
  tool_id: 'ws_inner_critic',
  label: 'Meet the inner critic',
  label_hi: null,
  summary: "Get to know the critical voice — what it says, and what you'd say back.",
  summary_hi: null,
  section: 'be_kinder',
  therapy_modality: 'Cognitive defusion (externalising the inner critic)',
  therapist_note:
    'externalises the critical voice so it reads as one voice rather than the truth. High load: it asks the client to write the critic out in full, which can be upsetting. Carry the deeper safety screen.',
  access_mode: 'assigned',
  load_level: 'demanding',
  est_minutes: 15,
  sort_order: 40,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: true,
  content_en: {
    version: 1,
    intro:
      "Most people have a voice inside that is harsher than they would ever be to a friend. This is a place to describe it properly, as something separate from you, with its own habits.",
    fields: [
      {
        id: 'name',
        type: 'short_text',
        prompt: 'If this voice had a name, what would it be?',
        helper:
          'Something silly is fine. A name makes it easier to hear as one voice rather than the truth.',
        required: true,
      },
      {
        id: 'says',
        type: 'long_text',
        prompt: 'What does it usually say?',
        helper:
          'Write it the way it actually speaks, as harsh as it is. Nothing here is edited or softened.',
        required: true,
      },
      {
        id: 'loudest',
        type: 'short_text',
        prompt: 'When is it loudest?',
        helper: 'A time of day, a situation, a kind of person. Anything you have noticed.',
      },
      {
        id: 'protecting',
        type: 'short_text',
        prompt: 'What might it be trying to protect you from?',
        helper: "Critics often started as protection. There's no right answer here.",
      },
      {
        id: 'back',
        type: 'short_text',
        prompt: 'What would you like to say back to it?',
        helper: "In your own words. It doesn't have to be kind — it just has to be yours.",
      },
    ],
    closing: {
      text: "You named it, so it's a voice now, not the truth about you.",
    },
  },
  content_hi: null,
};

const reconnectPlanner: CatalogueEntry = {
  tool_id: 'ws_reconnect_planner',
  label: 'Reconnect planner',
  label_hi: null,
  summary: 'Pick someone you miss, choose how to reach out, and set a day.',
  summary_hi: null,
  section: 'people_boundaries',
  therapy_modality: 'Behavioural activation (social reconnection)',
  therapist_note:
    'one person, one channel, one date. Kept to a single reach-out so it does not become a list of everyone they have lost touch with.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 50,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "When you've been low, people can drift without anyone deciding to. Picking one person and one small way to reach out is easier than trying to fix everything at once.",
    fields: [
      {
        id: 'people',
        type: 'row_list',
        prompt: 'Who would you like to be back in touch with?',
        helper: 'Someone you could actually reach. One name per line.',
        maxRows: 8,
        addLabel: 'Add someone',
        columns: [{ id: 'who', label: 'Who', type: 'text' }],
      },
      {
        id: 'how',
        type: 'choice',
        prompt: 'How would you like to reach out?',
        helper: 'The smallest one that feels possible is the right one.',
        options: [
          { value: 'message', label: 'A message' },
          { value: 'meme', label: 'Send a meme' },
          { value: 'call', label: 'A call' },
          { value: 'meet', label: 'Meet up' },
        ],
      },
      {
        id: 'when',
        type: 'datetime',
        prompt: 'When?',
        withDate: true,
        withTime: false,
      },
      {
        id: 'did_it',
        type: 'choice',
        prompt: 'How did it go?',
        helper: "Not yet is fine. It stays here for whenever you're ready.",
        options: [
          { value: 'yes', label: 'Did it' },
          { value: 'no', label: 'Not yet' },
        ],
      },
    ],
    closing: {
      text: "Reaching out once doesn't undo the distance. It's still a start.",
    },
  },
  content_hi: null,
};

const comparisonCheck: CatalogueEntry = {
  tool_id: 'ws_comparison_check',
  label: 'Comparison check',
  label_hi: null,
  summary: 'Look at where comparison happens, what it leaves out, and one small thing to do now.',
  summary_hi: null,
  section: 'untangle_thoughts',
  therapy_modality: 'Cognitive restructuring (social comparison)',
  therapist_note:
    'where, what feeling it left, what was compared to, and what the post leaves out. High load: comparison is often where body and eating material surfaces, so it carries the deeper safety screen. No weight, body or food fields anywhere.',
  access_mode: 'assigned',
  load_level: 'demanding',
  est_minutes: 10,
  sort_order: 100,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: true,
  content_en: {
    version: 1,
    intro:
      "Comparing yourself to other people is close to automatic, and phones make it constant. This is a few minutes of looking at it closely, without deciding you should stop feeling it.",
    fields: [
      {
        id: 'where',
        type: 'choice',
        prompt: 'Where were you when it happened?',
        required: true,
        options: [
          { value: 'instagram', label: 'Instagram' },
          { value: 'youtube', label: 'YouTube' },
          { value: 'college', label: 'College' },
          { value: 'family', label: 'Family' },
          { value: 'other', label: 'Somewhere else' },
        ],
      },
      {
        id: 'feelings',
        type: 'feelings_picker',
        prompt: 'How did it leave you feeling?',
        helper: 'Pick up to three.',
        required: true,
        feelings: FEELINGS_EN,
        maxSelections: 3,
      },
      {
        id: 'comparing_to',
        type: 'short_text',
        prompt: 'What were you comparing yourself to?',
        helper: "A post, a person, a way someone's life looked.",
        required: true,
      },
      {
        id: 'not_shown',
        type: 'short_text',
        prompt: "What doesn't that post or person show?",
        helper: "Everyone's day has parts nobody photographs.",
      },
      {
        id: 'do_now',
        type: 'short_text',
        prompt: "One small thing you'll do now",
        helper: 'Something for you, not for how it looks. Closing the app counts.',
      },
    ],
    closing: {
      text: "You saw it clearly for a minute. That's the skill, and it gets easier with practice.",
    },
  },
  content_hi: null,
};

const morningAfterMiracle: CatalogueEntry = {
  tool_id: 'ws_miracle_question',
  label: 'The morning after a miracle',
  label_hi: null,
  summary: 'Imagine things had changed overnight, and find the first small step.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Solution-focused (miracle question)',
  therapist_note:
    'the miracle question, kept concrete: what they would notice, where they are now, one step up. The 0-10 is the client\'s own number, never read as a band.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 120,
  status: 'approved',
  approved_at: '2026-11-24',
  opens: 'worksheet',
  care_plans: ['low_mood'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'This is a question therapists often ask. Imagine you go to sleep tonight and, while you sleep, the problem gets easier — not solved, just easier. You wake up and nobody has explained anything to you.',
    fields: [
      {
        id: 'notice',
        type: 'long_text',
        prompt: 'What would you notice first, before anyone told you anything?',
        helper:
          "Small and ordinary is good — what you'd see, who you'd speak to, what you'd do differently.",
        required: true,
      },
      {
        id: 'now',
        type: 'scale_0_10',
        prompt: 'Where are you now, on the way to that morning?',
        minLabel: '0 = nowhere near it',
        maxLabel: '10 = almost there',
      },
      {
        id: 'step_up',
        type: 'short_text',
        prompt: 'What would one step up from here look like?',
        helper: 'One step. Not the whole way.',
      },
    ],
    closing: {
      text: "You don't need the whole picture. One step you can actually see is enough to move.",
    },
  },
  content_hi: null,
};

export const lowMoodEntries: CatalogueEntry[] = [
  oneSmallThing,
  moodActivityLog,
  strengthsSpotting,
  thingsIMightEnjoy,
  tinyStepsLadder,
  innerCritic,
  reconnectPlanner,
  comparisonCheck,
  morningAfterMiracle,
];

/**
 * The Low Mood batch of 24 November 2026, in the owner's order.
 *
 * A list, not "whatever is `draft` today": the seed migration it generates must
 * keep meaning this batch, so a later approval never silently moves a row into
 * or out of it. Every id here is written `status = 'draft'` by that migration
 * however the catalogue later reads.
 */
export const LOW_MOOD_BATCH_IDS = [
  'ws_one_small_thing',
  'ws_mood_activity_log',
  'ws_strengths',
  'ws_things_i_might_enjoy',
  'ws_tiny_steps',
  'ws_inner_critic',
  'ws_reconnect_planner',
  'ws_comparison_check',
  'ws_miracle_question',
] as const;

/**
 * The nine Low Mood rows the owner approved on 24 November 2026, after the four
 * revisions he asked for.
 *
 * A list rather than "whatever is approved today", for the same reason as the
 * other batches: each approval gets its own migration, and that migration must
 * keep meaning this decision. Its own generated file, `20261124233000_approve_
 * low_mood_nine`, writes the approved copy with the status.
 */
export const APPROVED_LOW_MOOD_IDS = [...LOW_MOOD_BATCH_IDS] as const;
