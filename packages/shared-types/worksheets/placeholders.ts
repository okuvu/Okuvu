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
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

function placeholder(
  tool_id: string,
  label: string,
  purpose: string,
  section: CatalogueEntry['section'],
  sort_order: number,
  extra: {
    carePlans?: CatalogueEntry['care_plans'];
    sensitiveCheck?: boolean;
    accessMode?: CatalogueEntry['access_mode'];
  } = {},
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
    access_mode: extra.accessMode ?? 'assigned',
    load_level: null,
    est_minutes: null,
    sort_order,
    status: 'placeholder',
    content_en: null,
    content_hi: null,
    opens: 'worksheet',
    // Not decided yet: a placeholder has no wording, so it has no plan and no
    // extra screen. Both are set with the body when the worksheet is written.
    care_plans: extra.carePlans ?? [],
    sensitive_check: extra.sensitiveCheck ?? false,
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
    'ws_sleep_diary',
    'Sleep diary',
    'Record sleep and wake times and how the day felt, to spot a pattern.',
    'energy_life',
    1010,
    { sensitiveCheck: true },
  ),
  placeholder(
    'ws_comparison_check',
    'Comparison check',
    'Notice where comparing yourself with other people lands, and what it costs.',
    'untangle_thoughts',
    1050,
    { sensitiveCheck: true },
  ),
  placeholder(
    'ws_inner_critic',
    'Meet the inner critic',
    'Describe the critical voice as something separate, and notice what it says.',
    'be_kinder',
    1060,
    { sensitiveCheck: true },
  ),
];
