/**
 * The Library catalogue, assembled.
 *
 * One list. The approved exercises that already exist (grounding, the four
 * breathing techniques), the two existing features the Library opens (mood
 * check-in) and the approved worksheets all live here, in the order the
 * approved document puts them. Placeholders are in the same list but are
 * `placeholder`, so every consumer filters them out with `isListable`.
 */
import type { WorksheetRegistryRow } from '@okuvu/shared-types/worksheet';
import { worksheetRowProblems } from '@okuvu/shared-types/worksheet';
import { calmMyBodyEntries } from '@okuvu/shared-types/worksheets/calm-my-body';
import { beKinderEntries } from '@okuvu/shared-types/worksheets/be-kinder';
import { doWhatMattersEntries } from '@okuvu/shared-types/worksheets/do-what-matters';
import { energyLifeEntries, beforeAfterEntries } from '@okuvu/shared-types/worksheets/energy-and-session';
import { noticeAndNameEntries } from '@okuvu/shared-types/worksheets/notice-and-name';
import { peopleBoundariesEntries } from '@okuvu/shared-types/worksheets/people-boundaries';
import { placeholderEntries } from '@okuvu/shared-types/worksheets/placeholders';
import { safetyEntries } from '@okuvu/shared-types/worksheets/safety';
import { untangleThoughtsEntries } from '@okuvu/shared-types/worksheets/untangle-thoughts';
import { ENGLISH_APPROVAL, isListable, type CatalogueEntry } from '@okuvu/shared-types/worksheets/types';

export * from '@okuvu/shared-types/worksheets/types';
export * from '@okuvu/shared-types/worksheets/feelings';

/** Every entry, in Library order. */
export const CATALOGUE: CatalogueEntry[] = [
  ...noticeAndNameEntries,
  ...calmMyBodyEntries,
  ...untangleThoughtsEntries,
  ...doWhatMattersEntries,
  ...peopleBoundariesEntries,
  ...beKinderEntries,
  ...energyLifeEntries,
  ...beforeAfterEntries,
  ...safetyEntries,
  ...placeholderEntries,
];

/** What a client or therapist may see: approved rows only, in order. */
export const LISTABLE_CATALOGUE: CatalogueEntry[] = CATALOGUE.filter(isListable).sort(
  (a, b) => a.sort_order - b.sort_order,
);

export const PLACEHOLDER_CATALOGUE: CatalogueEntry[] = CATALOGUE.filter(
  (entry) => entry.status === 'placeholder',
);

export function entryById(toolId: string): CatalogueEntry | undefined {
  return CATALOGUE.find((entry) => entry.tool_id === toolId);
}

/**
 * The catalogue row as the database holds it, so the same validator that guards
 * a save can be run over the content in a test without a database.
 */
export function toRegistryRow(entry: CatalogueEntry): WorksheetRegistryRow & {
  therapist_note: string | null;
  approved_at: string | null;
} {
  return {
    tool_id: entry.tool_id,
    kind:
      entry.opens === 'breathing'
        ? 'group'
        : entry.opens === 'grounding'
          ? 'exercise'
          : 'worksheet',
    status: entry.status,
    label: entry.label,
    summary: entry.summary,
    section: entry.section,
    therapy_modality: entry.therapy_modality,
    access_mode: entry.access_mode,
    load_level: entry.load_level,
    est_minutes: entry.est_minutes,
    content_en: entry.content_en,
    content_hi: entry.content_hi,
    therapist_note: entry.therapist_note,
    approved_at: entry.status === 'approved' ? ENGLISH_APPROVAL.approvedAt : null,
  };
}

export interface CatalogueProblem {
  tool_id: string;
  problems: string[];
}

/**
 * Every problem with every approved row. Empty means the whole Library can be
 * served. Placeholders are skipped: they have no body yet by design, and are
 * never served.
 */
export function catalogueProblems(): CatalogueProblem[] {
  const out: CatalogueProblem[] = [];
  for (const entry of LISTABLE_CATALOGUE) {
    if (entry.opens !== 'worksheet') continue;
    const problems = worksheetRowProblems(toRegistryRow(entry));
    if (problems.length > 0) out.push({ tool_id: entry.tool_id, problems });
  }
  return out;
}
