/**
 * ANXIETY & WORRY — the nine worksheets the owner briefed on 24 November 2026.
 *
 * STATUS: every row is `draft`. The owner's rule (Step 0, 24 Nov 2026) is that
 * a new worksheet starts switched off for clients, cannot be assigned from the
 * portal, and is switched on only when he says its wording is approved. That is
 * the whole reason these are written here and not approved: the copy below is
 * the draft he reads in chat, and nothing in this file is approved wording.
 *
 * The owner's brief, one line each:
 *
 *  1 Worry time               assigned  a daily time and length, a parked list, a review
 *  2 Brain-dump               open      one long answer, then keep it or let it go
 *  3 Unhooking from a thought assigned  the thought, read back in two frames, belief before/after
 *  4 SOS calm                 open      one tap: a long-breath exercise, then grounding
 *  5 Sitting with not knowing assigned  what is unknown, discomfort before/after, one small way
 *  6 Big day planner          open      the date, prep steps with dates, an on-the-day list
 *  7 Social situation prep    assigned  the prediction, then what actually happened
 *  8 Pressure map             assigned  the areas, who expects what, how heavy, whose it is
 *  9 Exposure ladder          therapist-only: steps rated 0-100, unlocked one at a time
 *
 * What the rows share:
 *
 *  - `care_plans: ['anxiety_worry']`, the owner's label for this plan.
 *  - Every answer goes through the shared safety check on save, exactly as the
 *    journal does. None of these nine is on the owner's deeper-screen list
 *    (Comparison check, Sleep diary, Meet the inner critic, Unsent letter,
 *    Doomscroll log), so `sensitive_check` is false throughout — the ordinary
 *    check is the whole of it.
 *  - No worksheet asks for weight, body measurements, calories, food amounts or
 *    medicines; the validator enforces that on every client-facing string.
 *  - Nothing is summed, averaged or turned into a level. The 0-100 sliders are
 *    the client's own number at two moments, and the app never subtracts them.
 *
 * Four of these fill placeholder ids the applied seed already created: the
 * unhooking worksheet, the fear ladder slot (now the therapist-only exposure
 * ladder), the exam-and-career planner slot (now Big day planner) and the family
 * expectations slot (now Pressure map). Keeping those ids is what stops the seed
 * orphaning a row; the names and bodies are the owner's.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

const worryTime: CatalogueEntry = {
  tool_id: 'ws_worry_time',
  label: 'Worry time',
  label_hi: null,
  summary: 'Give worrying one time and one place, instead of all day.',
  summary_hi: null,
  section: 'untangle_thoughts',
  therapy_modality: 'Stimulus control: worry postponement',
  therapist_note:
    'sets one daily worry window and a parked list. The parked list is what the client returns to at worry time; each entry is marked still bothering / not anymore, which is a review, never a score. A daily email reminder is the only reminder — no app notification.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 60,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "Worrying has a way of spreading across the whole day. Giving it one time and one place doesn't make it disappear — it gives it somewhere to wait.",
    fields: [
      {
        id: 'time',
        type: 'datetime',
        prompt: 'What time each day do you want to give it?',
        helper:
          "Pick a time when you can usually stop for a bit. It doesn't have to be perfect, and you can move it later.",
        withDate: false,
        withTime: true,
        required: true,
      },
      {
        id: 'length',
        type: 'choice',
        prompt: 'How long do you want?',
        helper: 'A shorter window is easier to keep. You can always finish early.',
        required: true,
        options: [
          { value: 'ten', label: '10 minutes' },
          { value: 'fifteen', label: '15 minutes' },
          { value: 'twenty', label: '20 minutes' },
        ],
      },
      {
        id: 'parked',
        type: 'row_list',
        prompt: "What's parked for that time?",
        helper:
          'During the day, when a worry turns up, put it here instead of carrying it round. When your worry time comes, come back and look at each one.',
        maxRows: 12,
        addLabel: 'Park a worry',
        columns: [
          { id: 'worry', label: 'The worry', type: 'text' },
          {
            id: 'review',
            label: 'When you came back to it',
            type: 'choice',
            options: [
              { value: 'still', label: 'Still bothering me' },
              { value: 'not_anymore', label: 'Not anymore' },
            ],
          },
        ],
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: 'What do you notice about the ones you parked?',
        helper: 'Optional. A word is enough.',
      },
    ],
    closing: {
      text: "A worry kept for later is a worry you're not carrying all day.",
    },
  },
  content_hi: null,
};

const brainDump: CatalogueEntry = {
  tool_id: 'ws_brain_dump',
  label: 'Brain-dump',
  label_hi: null,
  summary: 'Empty the whole swirl onto one page, then decide whether to keep it.',
  summary_hi: null,
  section: 'untangle_thoughts',
  therapy_modality: 'Free writing: cognitive offloading',
  therapist_note:
    'one long answer, typed or spoken, with keep / let it go at the end. Let-it-go deletes the saved entry at once; the content-free safety flag stays if a check-in happened.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 70,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'Nothing here has to be tidy. Put the whole swirl down in one place, and let it be as messy as it actually is.',
    fields: [
      {
        id: 'dump',
        type: 'long_text',
        prompt: "What's in your head right now?",
        helper:
          "One long list is fine. Nothing has to be in order. You can type this or say it out loud — whichever is easier.",
      },
      {
        id: 'keep',
        type: 'choice',
        prompt: 'What would you like to do with it?',
        required: true,
        options: [
          {
            value: 'keep',
            label: 'Save it',
            description: 'It goes into Past me, private unless you choose to share it.',
          },
          {
            value: 'delete',
            label: 'Let it go',
            description:
              'This deletes it straight away. If OKUVU already checked in about something you wrote, your therapist may still know that a check-in happened.',
          },
        ],
      },
    ],
    closing: {
      text: "You got it out of your head. That's the whole job.",
      discardWhen: { field: 'keep', in: ['delete'] },
    },
  },
  content_hi: null,
};

const unhookingFromAThought: CatalogueEntry = {
  tool_id: 'ws_unhooking',
  label: 'Unhooking from a thought',
  label_hi: null,
  summary: 'Say a thought back to yourself as a thought, and notice if it loosens.',
  summary_hi: null,
  section: 'untangle_thoughts',
  therapy_modality: 'Cognitive defusion',
  therapist_note:
    'the thought is read back in two fixed frames — "I\'m having the thought that…" and "I notice I\'m having the thought that…" — in the client\'s own words. Belief is 0-100 before and after; the two numbers are shown as chosen and never subtracted.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 80,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "A thought can feel like a fact about the world. Saying it back as a thought — in your own words — is how it starts to sound like one.",
    fields: [
      {
        id: 'thought',
        type: 'short_text',
        prompt: "What's the thought that keeps coming?",
        helper: 'Write it the way it arrives, exactly as harsh as it sounds. Nothing here is edited.',
        required: true,
      },
      {
        id: 'belief_before',
        type: 'scale_0_100',
        prompt: 'How much do you believe it right now?',
        minLabel: '0 = not at all',
        maxLabel: '100 = completely',
      },
      {
        id: 'readback',
        type: 'echo',
        prompt: 'Here it is again, a little further away.',
        helper: 'These are your own words. Nothing has been changed.',
        fromField: 'thought',
        frames: [
          "I'm having the thought that {answer}",
          'I notice I\'m having the thought that {answer}',
        ],
      },
      {
        id: 'belief_after',
        type: 'scale_0_100',
        prompt: 'And now, having read it back?',
        minLabel: '0 = not at all',
        maxLabel: '100 = completely',
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: "What's different, if anything, about the thought now?",
        helper: 'Optional. Nothing has to have changed.',
      },
    ],
    closing: {
      text: "The thought didn't have to change for you to step back from it.",
    },
  },
  content_hi: null,
};

const sosCalm: CatalogueEntry = {
  tool_id: 'ws_sos_calm',
  label: 'SOS calm',
  label_hi: null,
  summary: 'One tap: a long breath out, then look around the room. Nothing to type.',
  summary_hi: null,
  section: 'calm_my_body',
  therapy_modality: 'Acute distress: paced breathing then sensory grounding',
  therapist_note:
    'opens the existing extended-exhale exercise (the one with the long out-breath), then the existing 5-4-3-2-1 grounding. Nothing in either exercise is changed and nothing is written by the client. Available from Home and from chat.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 40,
  status: 'draft',
  opens: 'sos_calm',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "You don't have to explain anything. Let's take one long breath out first, then look around the room together.",
    fields: [
      {
        id: 'first_step',
        type: 'instruction',
        prompt:
          "Start with the long breath out. It's one breath, then another — you can stop whenever you want.",
      },
    ],
    closing: {
      text: "You're here. Take your time leaving.",
    },
  },
  content_hi: null,
};

const sittingWithNotKnowing: CatalogueEntry = {
  tool_id: 'ws_sitting_with_not_knowing',
  label: 'Sitting with not knowing',
  label_hi: null,
  summary: 'Let one unanswered question stay open, and see how it feels afterwards.',
  summary_hi: null,
  section: 'untangle_thoughts',
  therapy_modality: 'Intolerance of uncertainty: exposure to the unresolved',
  therapist_note:
    'discomfort is rated before and after one small act of leaving something unresolved. The two numbers are read as chosen; no difference is computed and nothing is graded.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 90,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "Some things don't have an answer yet. Trying to force one can keep you awake. This is a few minutes of letting a question stay open.",
    fields: [
      {
        id: 'unsure',
        type: 'short_text',
        prompt: "What are you unsure about?",
        helper: "A few words. You don't have to explain the whole situation.",
        required: true,
      },
      {
        id: 'discomfort_before',
        type: 'scale_0_10',
        prompt: 'How uncomfortable does leaving it unknown feel?',
        minLabel: '0 = not at all',
        maxLabel: '10 = unbearable',
      },
      {
        id: 'small_way',
        type: 'short_text',
        prompt: "One small way you'll let it stay unknown today",
        helper:
          "Something you can actually do, or actually not do. \"I'll wait until Thursday before deciding\" counts. Checking it one more time doesn't.",
      },
      {
        id: 'discomfort_after',
        type: 'scale_0_10',
        prompt: 'And now, having written that?',
        minLabel: '0 = not at all',
        maxLabel: '10 = unbearable',
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: 'What do you notice?',
        helper: 'Optional.',
      },
    ],
    closing: {
      text: 'Not knowing for a while is not the same as giving up.',
    },
  },
  content_hi: null,
};

const bigDayPlanner: CatalogueEntry = {
  tool_id: 'ws_exam_career_pressure',
  label: 'Big day planner',
  label_hi: null,
  summary: 'Get the practical parts of a big day out of your head and onto one page.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Pre-event planning (exam, placement, interview)',
  therapist_note:
    'the date, the prep steps with their own dates, an on-the-day list, and one sentence to read at the door. Practical only: no food amounts, no drinks targets, no body content.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 70,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'Big days take up a lot of room in your head. Putting the practical parts somewhere helps you keep your head for the day itself.',
    fields: [
      {
        id: 'event_date',
        type: 'datetime',
        prompt: 'When is it?',
        helper: 'The date is enough.',
        withDate: true,
        withTime: false,
        required: true,
      },
      {
        id: 'prep',
        type: 'row_list',
        prompt: 'What needs doing before then?',
        helper: 'One step per line, with the day you will do it. Small steps are easier to keep.',
        maxRows: 12,
        addLabel: 'Add a step',
        columns: [
          { id: 'step', label: 'What', type: 'text' },
          { id: 'by_when', label: 'By when', type: 'datetime' },
        ],
      },
      {
        id: 'on_day',
        type: 'checklist',
        prompt: 'On the day',
        helper: 'Tick these as they happen. Nothing here is a rule.',
        options: [
          { value: 'eat', label: 'eat something before I go' },
          { value: 'leave_early', label: 'leave earlier than I need to' },
          { value: 'take', label: 'take what I need with me' },
          { value: 'quiet_phone', label: 'put my phone on silent' },
          { value: 'arrive', label: 'get there and sit down for a minute' },
          { value: 'afterwards', label: 'plan something kind for afterwards' },
        ],
      },
      {
        id: 'remember',
        type: 'short_text',
        prompt: 'What do you want to remember on the day?',
        helper: "One sentence you'd want to read at the door.",
        example: "I've done the work. I just have to turn up.",
      },
    ],
    closing: {
      text: "The day will go how it goes. You'll have done what you could.",
    },
  },
  content_hi: null,
};

const socialSituationPrep: CatalogueEntry = {
  tool_id: 'ws_social_situation_prep',
  label: 'Social situation prep',
  label_hi: null,
  summary: 'Write the prediction before, and what actually happened after.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Behavioural experiment for social anxiety',
  therapist_note:
    'the prediction is written before the event and checked after it. "Didn\'t do it" is a legitimate outcome, not a failure, and the after-question stays hidden unless one of the two done outcomes is chosen.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 80,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "Before something social, the mind often writes the ending in advance. This is somewhere to write that ending down — and then, later, what actually happened.",
    fields: [
      {
        id: 'situation',
        type: 'short_text',
        prompt: "What's the situation?",
        helper: 'A few words is enough.',
        example: 'Drinks with the team on Friday.',
        required: true,
      },
      {
        id: 'prediction',
        type: 'short_text',
        prompt: 'What do you think will happen?',
        helper: 'The version your mind keeps showing you, in its own words.',
      },
      {
        id: 'worry',
        type: 'scale_0_10',
        prompt: 'How worried do you feel about it?',
        minLabel: '0 = calm',
        maxLabel: '10 = very worried',
      },
      {
        id: 'small_try',
        type: 'short_text',
        prompt: "One small thing you'll try",
        helper: 'Small is the point. Say one sentence. Stay ten minutes. Arrive and leave when you like.',
      },
      {
        id: 'outcome',
        type: 'choice',
        prompt: 'If you have done it — how did it go?',
        helper: 'Leave this until afterwards. You can come back to this worksheet.',
        options: [
          { value: 'as_feared', label: 'Went as feared' },
          { value: 'better', label: 'Better than feared' },
          { value: 'didnt_do', label: "Didn't do it" },
        ],
      },
      {
        id: 'actually',
        type: 'short_text',
        prompt: 'What actually happened?',
        helper: 'Just what happened, in plain words.',
        visibleWhen: { field: 'outcome', in: ['as_feared', 'better'] },
      },
    ],
    closing: {
      text: 'A prediction written down is a prediction you can check.',
    },
  },
  content_hi: null,
};

const pressureMap: CatalogueEntry = {
  tool_id: 'ws_family_expectations',
  label: 'Pressure map',
  label_hi: null,
  summary: 'See where the pressure comes from, and whose expectation it really is.',
  summary_hi: null,
  section: 'people_boundaries',
  therapy_modality: 'Expectations mapping (family, culture, self)',
  therapist_note:
    'one line per area carrying expectations, with who expects what, how heavy it feels and whose expectation it mostly is. Clarifies ownership; it does not tell the client to drop anything.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 40,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'A lot of pressure comes from what we think other people expect. Mapping it shows which of it is yours, and which you picked up somewhere else.',
    fields: [
      {
        id: 'areas',
        type: 'row_list',
        prompt: 'Which areas are carrying expectations?',
        helper:
          'One line for each area that applies — studies, career, money, family, marriage, friends, the future. Skip the ones that carry nothing.',
        maxRows: 10,
        addLabel: 'Add an area',
        columns: [
          {
            id: 'area',
            label: 'Area',
            type: 'choice',
            options: [
              { value: 'studies', label: 'Studies' },
              { value: 'career', label: 'Career' },
              { value: 'money', label: 'Money' },
              { value: 'family', label: 'Family' },
              { value: 'marriage', label: 'Marriage' },
              { value: 'friends', label: 'Friends' },
              { value: 'future', label: 'The future' },
            ],
          },
          { id: 'who', label: 'Who expects what?', type: 'text' },
          { id: 'heavy', label: 'How heavy does it feel?', type: 'scale_0_10' },
          {
            id: 'whose',
            label: 'Whose expectation is it mostly?',
            type: 'choice',
            options: [
              { value: 'mine', label: 'Mostly mine' },
              { value: 'others', label: "Mostly other people's" },
            ],
          },
        ],
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: 'What do you notice, seeing them side by side?',
        helper: 'Optional.',
      },
    ],
    closing: {
      text: "Naming whose expectation it is doesn't settle it. It does make it easier to see.",
    },
  },
  content_hi: null,
};

const exposureLadder: CatalogueEntry = {
  tool_id: 'ws_exposure_ladder',
  label: 'Exposure ladder',
  label_hi: null,
  summary: 'Therapist-built: graded steps, unlocked one at a time.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Graded exposure',
  therapist_note:
    'THERAPIST-ONLY. Built in the portal with the client during a session; the client sees only the steps unlocked for them, rates before and after 0-100, and above 79 gets grounding plus a suggestion to pause and bring it to session. Never a Library card, never assignable, never suggested by chat.',
  access_mode: 'therapist_only',
  load_level: 'demanding',
  est_minutes: 20,
  sort_order: 90,
  status: 'draft',
  opens: 'worksheet',
  care_plans: ['anxiety_worry'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'Your therapist builds this ladder with you, in session. Each step is added together, and unlocked when you are both ready for it.',
    fields: [
      {
        id: 'about',
        type: 'instruction',
        prompt:
          'You will see only the steps that have been unlocked for you. For each one, rate how difficult it feels before you try it, and again afterwards. If a step feels like too much on the day, it can wait.',
      },
      {
        id: 'before_prompt',
        type: 'scale_0_100',
        prompt: 'Before you try this step, how difficult does it feel?',
        minLabel: '0 = not difficult',
        maxLabel: '100 = as difficult as it gets',
      },
      {
        id: 'after_prompt',
        type: 'scale_0_100',
        prompt: 'And afterwards?',
        minLabel: '0 = not difficult',
        maxLabel: '100 = as difficult as it gets',
      },
    ],
    closing: {
      text: 'Each step is yours to take when you are ready.',
    },
  },
  content_hi: null,
};

export const anxietyWorryEntries: CatalogueEntry[] = [
  worryTime,
  brainDump,
  unhookingFromAThought,
  sosCalm,
  sittingWithNotKnowing,
  bigDayPlanner,
  socialSituationPrep,
  pressureMap,
  exposureLadder,
];
