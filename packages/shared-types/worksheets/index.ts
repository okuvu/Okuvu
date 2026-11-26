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
import { anxietyWorryEntries } from '@okuvu/shared-types/worksheets/anxiety-worry';
import { allPlansEntries } from '@okuvu/shared-types/worksheets/all-plans';
import { calmMyBodyEntries } from '@okuvu/shared-types/worksheets/calm-my-body';
import { beKinderEntries } from '@okuvu/shared-types/worksheets/be-kinder';
import { doWhatMattersEntries } from '@okuvu/shared-types/worksheets/do-what-matters';
import { energyLifeEntries, beforeAfterEntries } from '@okuvu/shared-types/worksheets/energy-and-session';
import { noticeAndNameEntries } from '@okuvu/shared-types/worksheets/notice-and-name';
import { peopleBoundariesEntries } from '@okuvu/shared-types/worksheets/people-boundaries';
import { lowMoodEntries } from '@okuvu/shared-types/worksheets/low-mood';
import { placeholderEntries } from '@okuvu/shared-types/worksheets/placeholders';
import { safetyEntries } from '@okuvu/shared-types/worksheets/safety';
import { stressAndBurnoutEntries } from '@okuvu/shared-types/worksheets/stress-and-burnout';
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
  // Appended, not inserted: the generated seed migration numbers its row ids by
  // array position, so an entry added in the middle would renumber rows that
  // already exist. Library order comes from `sort_order`, never from this index.
  ...stressAndBurnoutEntries,
  ...anxietyWorryEntries,
  ...lowMoodEntries,
  ...allPlansEntries,
];

/** What a client or therapist may see: approved rows only, in order. */
export const LISTABLE_CATALOGUE: CatalogueEntry[] = CATALOGUE.filter(isListable).sort(
  (a, b) => a.sort_order - b.sort_order,
);

/**
 * What the **client** Library may list.
 *
 * Approval is not publication. The exposure ladder is approved and
 * `therapist_only`: it is built with the therapist in session, never a Library
 * card, never assignable, never suggested by chat (owner's rule, 24 Nov 2026).
 * The api's list query filters `access_mode` itself; this export exists so the
 * rule has one home for anything that reads the catalogue directly.
 */
export const CLIENT_LIBRARY_CATALOGUE: CatalogueEntry[] = LISTABLE_CATALOGUE.filter(
  (entry) => entry.access_mode !== 'therapist_only',
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
      // A card that opens an existing screen rather than the runner is a group:
      // the Breathing card (four techniques) and SOS calm (a breath, then
      // grounding) both open built screens, so neither has a worksheet body.
      entry.opens === 'breathing' || entry.opens === 'sos_calm'
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
    approved_at: entry.status === 'approved' ? (entry.approved_at ?? ENGLISH_APPROVAL.approvedAt) : null,
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
/**
 * Cross-row check for `closing.handOff`.
 *
 * A body cannot see its neighbours, so the validator only proves the shape: the
 * field is an earlier checklist and the label exists. What it cannot know is
 * whether the target worksheet exists, is one a client may open, and actually
 * has a list to put the picks into. That is checked here, over the whole
 * catalogue, so a hand-off to a therapist-only row or to a worksheet with no
 * list fails the build rather than becoming a dead button.
 */
export function handOffProblems(): CatalogueProblem[] {
  const out: CatalogueProblem[] = [];
  for (const entry of CATALOGUE) {
    const handOff = entry.content_en?.closing?.handOff;
    if (!handOff) continue;

    const problems: string[] = [];
    const target = CATALOGUE.find((row) => row.tool_id === handOff.toolId);
    if (!target) {
      problems.push(`handOff: "${handOff.toolId}" is not in the catalogue`);
    } else if (target.access_mode === 'therapist_only' || target.access_mode === 'in_session') {
      problems.push(`handOff: "${handOff.toolId}" is not a worksheet a client may open`);
    } else if (!target.content_en) {
      problems.push(`handOff: "${handOff.toolId}" has no body to carry the picks into`);
    } else {
      const first = target.content_en.fields[0];
      if (!first || first.type !== 'row_list') {
        problems.push(`handOff: "${handOff.toolId}" does not start with a row list`);
      } else {
        const named = target.content_en.fields.find((field) => field.id === handOff.targetField);
        if (!named || named.type !== 'row_list') {
          problems.push(
            `handOff: "${handOff.toolId}" has no row list called "${handOff.targetField}"`,
          );
        } else {
          const column = named.columns.find((c) => c.id === handOff.targetColumn);
          if (!column) {
            problems.push(
              `handOff: "${handOff.toolId}.${handOff.targetField}" has no column "${handOff.targetColumn}"`,
            );
          } else if (column.type !== 'text') {
            problems.push(
              `handOff: "${handOff.toolId}.${handOff.targetField}.${handOff.targetColumn}" is not a text column`,
            );
          }

          const checklist = entry.content_en?.fields.find((field) => field.id === handOff.field);
          const wanted =
            checklist && checklist.type === 'checklist' ? checklist.maxSelections : undefined;
          const capacity = named.maxRows;
          if (wanted !== undefined && capacity !== undefined && wanted > capacity) {
            problems.push(
              `handOff: "${entry.tool_id}" allows ${wanted} picks but "${handOff.toolId}" holds ${capacity}`,
            );
          }
        }
      }
    }

    if (problems.length > 0) out.push({ tool_id: entry.tool_id, problems });
  }
  return out;
}

export function catalogueProblems(): CatalogueProblem[] {
  const out: CatalogueProblem[] = [];
  for (const entry of LISTABLE_CATALOGUE) {
    if (entry.opens !== 'worksheet') continue;
    const problems = worksheetRowProblems(toRegistryRow(entry));
    if (problems.length > 0) out.push({ tool_id: entry.tool_id, problems });
  }
  return out;
}
