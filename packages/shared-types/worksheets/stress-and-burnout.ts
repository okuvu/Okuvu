/**
 * STRESS & BURNOUT — the ten worksheets the owner briefed on 24 November 2026.
 *
 * STATUS, 24 November 2026 (owner's decisions, in chat):
 *
 *   - APPROVED, as written: What's on my plate, Basics check, Rest break,
 *     Boundary planner, Priority sorter, Doomscroll log, Weekly load check,
 *     Caring load check. They carry `status: 'approved'` and
 *     `OWNER_APPROVAL_24_NOV` as their approval date.
 *   - APPROVED LATER THE SAME DAY, after the revisions he asked for: Unsent
 *     letter and Weighing it up. He read the revised wording and approved both
 *     on 24 November 2026 (second round). Their copy below is the revised text
 *     he approved, and it is the text that ships.
 *
 * The four that were already sitting in the catalogue as placeholders (Boundary
 * planner, Unsent letter, Doomscroll log — filed under its old name, Scrolling
 * log — and Weighing it up — filed as Pros and cons of change) keep their
 * existing ids, and the approved pair now shows the new name in the Library.
 *
 * The owner's brief, one line each:
 *
 *  1 What's on my plate   open      a task list, each sorted must / wait / drop
 *  2 Basics check         open      six basics, an empty-tank slider, one to keep
 *  3 Rest break           open      2/5/10 minutes, then the countdown timer
 *  4 Boundary planner     assigned  the situation, the words, how hard it feels
 *  5 Priority sorter      assigned  a task list sorted into the four boxes
 *  6 Doomscroll log       open      when, how long, feelings before and after
 *  7 Weekly load check    assigned  this week's load, its demands, past weeks
 *  8 Unsent letter        assigned  the letter, then keep it or delete it
 *  9 Weighing it up       assigned  the four boxes, and how ready you feel
 * 10 Caring load check    assigned  the caring you carry, and one ask for help
 *
 * None of them asks for weight, body measurements, calories, food amounts or
 * medicines (rule 3), and none of them adds anything into a total, a level or a
 * label (rule 5). The two that the owner named for the deeper screen — the
 * doomscroll log and the unsent letter — carry `sensitive_check: true`; for the
 * rest the shared safety check on every write is the whole of it.
 *
 * Copy below is the client's wording. All ten rows are approved: eight as
 * written on 24 Nov 2026, and two after the revisions the owner asked for and
 * then approved the same day.
 */
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';
import { FEELINGS_EN } from '@okuvu/shared-types/worksheets/feelings';
import { OWNER_APPROVAL_24_NOV } from '@okuvu/shared-types/worksheets/types';

const whatsOnMyPlate: CatalogueEntry = {
  tool_id: 'ws_whats_on_my_plate',
  label: "What's on my plate",
  label_hi: null,
  summary: 'Put everything down in one place, then decide what can wait.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Task triage (behavioural activation / stress management)',
  therapist_note:
    'sorts current demands into must do / can wait / can drop or hand off. Light on purpose, so it stays usable on an overwhelmed day.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 30,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "When everything is in your head at once, it can all feel equally urgent. Writing it down helps you see what's actually there — and what can wait.",
    fields: [
      {
        id: 'tasks',
        type: 'row_list',
        prompt: "What's on your plate right now?",
        helper:
          "One thing per line. Anything counts — big, small, work, home, the message you keep meaning to send.",
        maxRows: 10,
        addLabel: 'Add another',
        columns: [
          { id: 'task', label: 'What', type: 'text' },
          {
            id: 'plan',
            label: "What I'll do with it",
            type: 'choice',
            options: [
              { value: 'must_do', label: 'Must do' },
              { value: 'can_wait', label: 'Can wait' },
              { value: 'can_drop', label: 'Can drop or hand off' },
            ],
          },
        ],
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: 'Was anything easier to decide once you saw it written down?',
        helper: "There's no right answer. This is just for you.",
      },
    ],
    closing: {
      text: "You don't have to do all of it. Deciding what can wait is part of the work.",
    },
  },
  content_hi: null,
};

const basicsCheck: CatalogueEntry = {
  tool_id: 'ws_basics_check',
  label: 'Basics check',
  label_hi: null,
  summary: 'A quick look at the everyday basics, and one to look after today.',
  summary_hi: null,
  section: 'energy_life',
  therapy_modality: 'Psychoeducation: the everyday basics under load',
  therapist_note:
    'sleep, food, movement, rest, daylight and contact. Ticks only, no quantities, so it cannot become a food or body record. The slider is read as the client\'s own number, never a band.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 20,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "When you're running on empty, the basics are usually the first to go — and the hardest to notice. This is a quick look, not a test.",
    fields: [
      {
        id: 'basics',
        type: 'checklist',
        prompt: 'Which of these have you had in the last day or two?',
        helper: "Tick what's true. Nothing here is graded.",
        options: [
          { value: 'slept', label: 'slept enough' },
          { value: 'ate', label: 'ate proper meals' },
          { value: 'moved', label: 'moved my body' },
          { value: 'break', label: 'took a break' },
          { value: 'outside', label: 'went outside' },
          { value: 'talked', label: 'talked to someone' },
        ],
      },
      {
        id: 'tank',
        type: 'scale_0_10',
        prompt: 'How empty does my tank feel?',
        minLabel: '0 = full',
        maxLabel: '10 = running on empty',
      },
      {
        id: 'one_basic',
        type: 'short_text',
        prompt: "One basic I'll look after today",
        helper: 'Pick the easiest one, not the most important one.',
        example: 'Go to bed by eleven. Text my sister back.',
      },
    ],
    closing: {
      text: 'One basic, done today, is worth more than a perfect plan for next week.',
    },
  },
  content_hi: null,
};

const restBreak: CatalogueEntry = {
  tool_id: 'ws_rest_break',
  label: 'Rest break',
  label_hi: null,
  summary: 'Stop for a few minutes on purpose, with nothing to show for it.',
  summary_hi: null,
  section: 'calm_my_body',
  therapy_modality: 'Rest as a skill (nervous-system down-regulation)',
  therapist_note:
    'a timed stop with no productivity attached. The timer stores the seconds it actually ran; stopping early is a complete answer, so there is no minimum.',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 30,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "Rest is not a reward you earn after everything else is done. It's part of how you keep going.",
    fields: [
      {
        id: 'length',
        type: 'choice',
        prompt: 'How long do you want to stop for?',
        required: true,
        options: [
          { value: 'two', label: '2 minutes' },
          { value: 'five', label: '5 minutes' },
          { value: 'ten', label: '10 minutes' },
        ],
      },
      {
        id: 'rest_two',
        type: 'countdown_timer',
        prompt: 'You have permission to stop. Nothing needs to be earned first.',
        helper: 'Sit, lie down, look out of the window. Doing nothing is the point.',
        seconds: 120,
        startLabel: 'Start the 2 minutes',
        doneLabel: "Time's up",
        visibleWhen: { field: 'length', in: ['two'] },
      },
      {
        id: 'rest_five',
        type: 'countdown_timer',
        prompt: 'You have permission to stop. Nothing needs to be earned first.',
        helper: 'Put the phone down if you can. The world will still be there after.',
        seconds: 300,
        startLabel: 'Start the 5 minutes',
        doneLabel: "Time's up",
        visibleWhen: { field: 'length', in: ['five'] },
      },
      {
        id: 'rest_ten',
        type: 'countdown_timer',
        prompt: 'You have permission to stop. Nothing needs to be earned first.',
        helper: 'Ten minutes is a real rest, not a long one. You can stop earlier if you want.',
        seconds: 600,
        startLabel: 'Start the 10 minutes',
        doneLabel: "Time's up",
        visibleWhen: { field: 'length', in: ['ten'] },
      },
      {
        id: 'after',
        type: 'closing_reflection',
        prompt: 'Anything different after stopping for a moment?',
        helper: 'Optional. A word is enough.',
      },
    ],
    closing: {
      text: 'Stopping is a skill. You just practised it.',
    },
  },
  content_hi: null,
};

const boundaryPlanner: CatalogueEntry = {
  tool_id: 'ws_boundary_planner',
  label: 'Boundary planner',
  label_hi: null,
  summary: 'Work out what you want to say no to, and the words to say it.',
  summary_hi: null,
  section: 'people_boundaries',
  therapy_modality: 'Assertiveness and boundary setting',
  therapist_note:
    'prepares one boundary sentence before it is needed. Assigned, because a boundary is usually rehearsed in session first.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 20,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "A boundary is a sentence about what you can and can't do. It's easier to say when you've decided the words before you need them.",
    fields: [
      {
        id: 'situation',
        type: 'short_text',
        prompt: "What's the situation?",
        helper: 'A few words is enough.',
        example: 'My manager keeps adding work at 7pm.',
      },
      {
        id: 'who',
        type: 'short_text',
        prompt: 'Who is it with?',
        helper: "A name, a role, or just 'someone at home'.",
      },
      {
        id: 'no_to',
        type: 'short_text',
        prompt: 'What do you want to say no to?',
        example: 'Taking on another project this month.',
      },
      {
        id: 'words',
        type: 'long_text',
        prompt: "What will you say? Write it the way you'd actually say it.",
        helper:
          "Short and plain usually works better than a speech. You can change it after you've said it out loud once.",
        example: "I can't take another project this month. I can start it in December.",
      },
      {
        id: 'hard',
        type: 'scale_0_10',
        prompt: 'How hard does this feel to say?',
        minLabel: '0 = easy',
        maxLabel: '10 = very hard',
      },
      {
        id: 'helps',
        type: 'closing_reflection',
        prompt: 'What would make it a little easier to say?',
        helper: 'Where you say it, who is nearby, what you do straight afterwards.',
      },
    ],
    closing: {
      text: "You're allowed to take up space in your own life.",
    },
  },
  content_hi: null,
};

const prioritySorter: CatalogueEntry = {
  tool_id: 'ws_priority_sorter',
  label: 'Priority sorter',
  label_hi: null,
  summary: 'Sort what you are carrying into four boxes, then pick one to start.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Prioritisation (urgent / important)',
  therapist_note:
    'one list, one label per line, then a single first step. Urgent is about time; important is about what matters to the client.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 40,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "Not everything urgent is important, and not everything important is urgent. Sorting it takes a minute and saves a lot.",
    fields: [
      {
        id: 'tasks',
        type: 'row_list',
        prompt: "Add the things you're carrying.",
        helper:
          "Urgent means it needs doing soon. Important means it matters to you. Most things are only one of the two.",
        maxRows: 10,
        addLabel: 'Add another',
        columns: [
          { id: 'task', label: 'What', type: 'text' },
          {
            id: 'box',
            label: 'Which box',
            type: 'choice',
            options: [
              { value: 'urgent_important', label: 'Urgent and important' },
              { value: 'important_not_urgent', label: 'Important, not urgent' },
              { value: 'urgent_not_important', label: 'Urgent, not important' },
              { value: 'neither', label: 'Neither' },
            ],
          },
        ],
      },
      {
        id: 'first',
        type: 'short_text',
        prompt: 'Which one will you do first?',
        helper: 'One only. The rest can wait their turn.',
      },
    ],
    closing: {
      text: "You don't have to do it all today. You just have to know what's first.",
    },
  },
  content_hi: null,
};

const doomscrollLog: CatalogueEntry = {
  tool_id: 'ws_scrolling_log',
  label: 'Doomscroll log',
  label_hi: null,
  summary: 'Note when you scrolled, how long, and how it felt before and after.',
  summary_hi: null,
  section: 'energy_life',
  therapy_modality: 'Digital habits: behavioural chain',
  therapist_note:
    'before-and-after feelings around a scrolling episode, to show what the scrolling is doing for the client. Carries the deeper screen (owner, 24 Nov 2026).',
  access_mode: 'open',
  load_level: 'light',
  est_minutes: 3,
  sort_order: 30,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: true,
  content_en: {
    version: 1,
    intro:
      "Scrolling isn't a moral failure. It's easier to change when you can see what it does for you — and what it costs.",
    fields: [
      {
        id: 'when',
        type: 'datetime',
        prompt: 'When did this happen?',
        withDate: true,
        withTime: true,
      },
      {
        id: 'how_long',
        type: 'choice',
        prompt: 'How long were you scrolling?',
        options: [
          { value: 'under_15', label: 'Under 15 minutes' },
          { value: '15_to_60', label: '15–60 minutes' },
          { value: 'over_hour', label: 'Over an hour' },
        ],
      },
      {
        id: 'before',
        type: 'feelings_picker',
        prompt: 'How did you feel just before you picked up your phone?',
        maxSelections: 3,
        feelings: FEELINGS_EN,
      },
      {
        id: 'after',
        type: 'feelings_picker',
        prompt: 'And afterwards?',
        maxSelections: 3,
        feelings: FEELINGS_EN,
      },
      {
        id: 'pulled_in',
        type: 'short_text',
        prompt: 'What pulled you in?',
        helper: "Boredom, a notification, a feeling you didn't want, a habit. All of these count.",
      },
    ],
    closing: {
      text: 'Noticing is the whole exercise. Nothing here has to be different next time.',
    },
  },
  content_hi: null,
};

const weeklyLoadCheck: CatalogueEntry = {
  tool_id: 'ws_weekly_load_check',
  label: 'Weekly load check',
  label_hi: null,
  summary: "Look at how much you carried this week, and what it was made of.",
  summary_hi: null,
  section: 'energy_life',
  therapy_modality: 'Weekly load review',
  therapist_note:
    "one number for the week and the demands behind it. Past weeks read as a plain list in Past me — no graph, no score, no trend language.",
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 40,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'Once a week, it helps to look at how much you were carrying — not to judge it, just to see it.',
    fields: [
      {
        id: 'load',
        type: 'scale_0_10',
        prompt: 'How heavy did this week feel?',
        minLabel: '0 = light',
        maxLabel: '10 = as heavy as it gets',
      },
      {
        id: 'demands',
        type: 'row_list',
        prompt: 'What were the biggest things you carried this week?',
        helper: 'Work, people, money, health, things you kept saying you would do.',
        maxRows: 6,
        addLabel: 'Add another',
        columns: [{ id: 'demand', label: 'What', type: 'text' }],
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: 'What do you notice, looking at this week?',
        helper: 'You can see your past weeks in Past me, under this worksheet.',
      },
    ],
    closing: {
      text: 'However heavy the week was, you carried it. That counts.',
    },
    timeline: { leadField: 'load' },
  },
  content_hi: null,
};

const unsentLetter: CatalogueEntry = {
  tool_id: 'ws_unsent_letter',
  label: 'Unsent letter',
  label_hi: null,
  summary: 'Write what was never said, then choose whether to keep it.',
  summary_hi: null,
  section: 'people_boundaries',
  therapy_modality: 'Expressive writing (unsent letter)',
  therapist_note:
    'high load. Carries the deeper screen. The client chooses keep or delete at the end; delete removes the saved entry at once, and only the content-free flag stays.',
  access_mode: 'assigned',
  load_level: 'demanding',
  est_minutes: 15,
  sort_order: 30,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: true,
  content_en: {
    version: 1,
    intro:
      "Some things never got said, and maybe they never will. Writing them down, with no plan to send them, can make a little more room inside you.",
    fields: [
      {
        id: 'to',
        type: 'short_text',
        prompt: 'Who is this letter to?',
        helper: "A name, a relationship, or just 'someone I used to know'. You don't have to explain.",
      },
      {
        id: 'letter',
        type: 'long_text',
        prompt: 'Write the letter.',
        helper:
          'Nobody reads this unless you choose to share it. If something you write sounds like you might not be safe, OKUVU will check in with you and may let your therapist know.',
      },
      {
        id: 'keep',
        type: 'choice',
        prompt: 'What would you like to do with it now?',
        required: true,
        helper:
          'Keeping it saves it in Past me, private unless you share it later. Deleting removes it straight away.',
        options: [
          { value: 'keep', label: 'Keep it privately' },
          {
            value: 'delete',
            label: 'Delete it',
            description:
              'This deletes the letter. If OKUVU already checked in about something you wrote, your therapist may still know that a check-in happened.',
          },
        ],
      },
    ],
    closing: {
      text: 'You wrote it, and you decided what happens to it. Both of those are yours.',
      discardWhen: { field: 'keep', in: ['delete'] },
    },
  },
  content_hi: null,
};

const weighingItUp: CatalogueEntry = {
  tool_id: 'ws_pros_cons_change',
  label: 'Weighing it up',
  label_hi: null,
  summary: 'Look at both sides of changing, and of staying the same.',
  summary_hi: null,
  section: 'do_what_matters',
  therapy_modality: 'Motivational interviewing: decisional balance',
  therapist_note:
    'the four-quadrant decisional balance, plus a readiness rating. Values are read as the client\'s own words; nothing is counted.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 10,
  sort_order: 50,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      "When part of you wants to change and part of you doesn't, that's not a flaw. It's worth looking at both sides slowly.",
    fields: [
      {
        id: 'change',
        type: 'short_text',
        prompt: 'What change are you thinking about?',
        required: true,
        helper: 'A sentence is enough. You can be as general or as specific as you like.',
      },
      {
        id: 'good_changing',
        type: 'long_text',
        prompt: 'What might be good about this change?',
        helper: 'Even small good things. Nothing is too obvious.',
      },
      {
        id: 'good_same',
        type: 'long_text',
        prompt: 'What might be good about not making this change?',
        helper: "There's usually something, or it would be easier to change.",
      },
      {
        id: 'cost_changing',
        type: 'long_text',
        prompt: 'What might this change cost you?',
        helper: 'Time, comfort, people, the way things are now.',
      },
      {
        id: 'cost_same',
        type: 'long_text',
        prompt: 'What might not making this change cost you?',
        helper: "It's alright if this is hard to answer. Take your time.",
      },
      {
        id: 'ready',
        type: 'scale_0_10',
        prompt: 'How ready do you feel to change, right now?',
        helper: "There's no right number. Readiness can change from day to day.",
        minLabel: '0 = not at all',
        maxLabel: '10 = completely',
      },
      {
        id: 'noticed',
        type: 'closing_reflection',
        prompt: 'What do you notice, seeing all four side by side?',
        helper: 'Optional.',
      },
    ],
    closing: {
      text: 'Noticing both sides is not the same as staying stuck.',
    },
  },
  content_hi: null,
};

const caringLoadCheck: CatalogueEntry = {
  tool_id: 'ws_caring_load_check',
  label: 'Caring load check',
  label_hi: null,
  summary: 'Name the caring you carry, and one bit of help you could ask for.',
  summary_hi: null,
  section: 'energy_life',
  therapy_modality: 'Carer load (psychoeducation)',
  therapist_note:
    'names care work that often goes uncounted, then asks for one concrete ask. No quantities and no score.',
  access_mode: 'assigned',
  load_level: 'light',
  est_minutes: 5,
  sort_order: 50,
  status: 'approved',
  approved_at: OWNER_APPROVAL_24_NOV.approvedAt,
  opens: 'worksheet',
  care_plans: ['stress_burnout'],
  sensitive_check: false,
  content_en: {
    version: 1,
    intro:
      'Looking after other people is real work, even when nobody counts it as work. This is a place to put it down for a minute.',
    fields: [
      {
        id: 'caring',
        type: 'checklist',
        prompt: 'Which of these are you carrying at the moment?',
        helper: 'Tick as many as are true. Some of them are easy to miss.',
        options: [
          { value: 'family_member', label: 'looking after a family member' },
          { value: 'household', label: 'the household' },
          { value: 'money', label: 'money and bills' },
          { value: 'emotional', label: 'emotional support for someone' },
          { value: 'admin', label: 'appointments and paperwork' },
          { value: 'other', label: 'something else' },
        ],
      },
      {
        id: 'stretched',
        type: 'scale_0_10',
        prompt: 'How stretched do you feel?',
        minLabel: '0 = I have room',
        maxLabel: '10 = there is nothing left',
      },
      {
        id: 'help',
        type: 'short_text',
        prompt: "One bit of help you could ask for",
        helper: "It can be small. Someone else making dinner once. An hour to yourself.",
      },
    ],
    closing: {
      text: 'Asking for help is part of caring, not a break from it.',
    },
  },
  content_hi: null,
};

export const stressAndBurnoutEntries: CatalogueEntry[] = [
  whatsOnMyPlate,
  basicsCheck,
  restBreak,
  boundaryPlanner,
  prioritySorter,
  doomscrollLog,
  weeklyLoadCheck,
  unsentLetter,
  weighingItUp,
  caringLoadCheck,
];
