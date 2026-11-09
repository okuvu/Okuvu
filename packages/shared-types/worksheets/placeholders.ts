/**
 * Future worksheets: a name and a one-line purpose, hidden from clients AND
 * from therapists.
 *
 * These are `status: 'placeholder'`. They have no body and no approval, they
 * are excluded from every list query (`isListable`), and `assertClientServable`
 * refuses them because they are not `approved`. They exist so the next round of
 * writing has a fixed set of ids to fill in rather than a new vocabulary.
 *
 * The one-line purposes here are scaffolding, not client copy: nothing in this
 * file is approved wording and nothing in it can reach a client.
 */
import type { CatalogueEntry } from './types';

function placeholder(
  tool_id: string,
  label: string,
  purpose: string,
  section: CatalogueEntry['section'],
  sort_order: number,
): CatalogueEntry {
  return {
    tool_id,
    label,
    label_hi: null,
    summary: purpose,
    summary_hi: null,
    section,
    therapy_modality: null,
    therapist_note: null,
    access_mode: 'assigned',
    load_level: null,
    est_minutes: null,
    sort_order,
    status: 'placeholder',
    content_en: null,
    content_hi: null,
    opens: 'worksheet',
  };
}

export const placeholderEntries: CatalogueEntry[] = [
  placeholder(
    'ws_body_map',
    'Body map',
    'Mark where in the body a feeling shows up, and how strong it is there.',
    'notice_and_name',
    900,
  ),
  placeholder(
    'ws_unhooking',
    'Unhooking from thoughts',
    'Notice a thought, name it as a thought, and let it pass without arguing with it.',
    'untangle_thoughts',
    910,
  ),
  placeholder(
    'ws_fear_ladder',
    'Fear ladder',
    'Break an avoided situation into graded steps, from easiest to hardest.',
    'do_what_matters',
    920,
  ),
  placeholder(
    'ws_tiny_steps',
    'Tiny steps',
    'Turn one big task into the smallest first step that can be done today.',
    'do_what_matters',
    930,
  ),
  placeholder(
    'ws_problem_solving',
    'Problem solving',
    'Pick one solvable problem, list options, choose one and plan when to try it.',
    'do_what_matters',
    940,
  ),
  placeholder(
    'ws_boundary_planner',
    'Boundary planner',
    'Work out what a boundary is, what to say, and what to do if it is pushed.',
    'people_boundaries',
    950,
  ),
  placeholder(
    'ws_unsent_letter',
    'Unsent letter',
    'Write what was never said to someone, without sending it.',
    'people_boundaries',
    960,
  ),
  placeholder(
    'ws_naming_the_problem',
    'Naming the problem',
    'Separate the problem from the person, so the problem can be talked about.',
    'people_boundaries',
    970,
  ),
  placeholder(
    'ws_miracle_question',
    'The miracle question',
    'Describe how things would look if the problem were solved, to find a first step.',
    'do_what_matters',
    980,
  ),
  placeholder(
    'ws_strengths',
    'Strengths',
    'Name strengths the client already uses, with an example of each.',
    'be_kinder',
    990,
  ),
  placeholder(
    'ws_exam_career_pressure',
    'Exam and career pressure planner',
    'Plan around exam and career pressure: what is in your control this week, and what is not.',
    'energy_life',
    1000,
  ),
  placeholder(
    'ws_sleep_diary',
    'Sleep diary',
    'Record sleep and wake times and how the day felt, to spot a pattern.',
    'energy_life',
    1010,
  ),
  placeholder(
    'ws_scrolling_log',
    'Scrolling log',
    'Note when and why scrolling happens, and how it felt afterwards.',
    'energy_life',
    1020,
  ),
  placeholder(
    'ws_family_expectations',
    'Family expectations map',
    'Map what family expects, what the client wants, and where the two overlap.',
    'people_boundaries',
    1030,
  ),
  placeholder(
    'ws_pros_cons_change',
    'Pros and cons of change',
    'Lay out the costs and benefits of changing, and of staying the same.',
    'do_what_matters',
    1040,
  ),
];
