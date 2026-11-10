/**
 * The catalogue content: every Library entry, in the words the owner approved.
 *
 * This module is the single source of truth for what a client reads and what a
 * therapist previews. It is imported by:
 *
 *   - the migration generator (`packages/prisma/scripts/emit-worksheet-sql.ts`),
 *     which turns it into the SQL that seeds `ToolRegistryEntry`;
 *   - the tests, which check every row against the pieces validator and, where
 *     the wording is verbatim approved copy, against the approved document
 *     stored in `docs/exercise-library/02-approved-worksheet-copy.md`;
 *   - the api's read path, for the rows that are not seeded by migration yet.
 *
 * Nothing here may be paraphrased. If a sentence changes, a new approved
 * version of the document replaces the old one and this file is regenerated —
 * a copy edit is never a code edit, and never an engineer's own words.
 *
 * Hinglish (`content_hi`, `summary_hi`, `label_hi`) is a translation of the
 * approved English and is NOT approved: it must not be shown to a client until
 * the owner approves it. `status_hi` records that fact per row.
 */
import type {
  WorksheetAccessMode,
  WorksheetContent,
  WorksheetLoadLevel,
  WorksheetSection,
} from '@okuvu/shared-types/worksheet';

/** Who approved the English wording, and when. Stored with every approved row. */
export const ENGLISH_APPROVAL = {
  approvedBy: 'Dr. Shubhangi Goswami (clinical lead)',
  approvedAt: '2026-11-09',
} as const;

/**
 * `placeholder` rows are a name and a one-line purpose for worksheets that do
 * not exist yet. They are hidden from clients AND from therapists, so they are
 * excluded from every list query by `isListable`.
 */
export type CatalogueStatus = 'approved' | 'placeholder';

export interface CatalogueEntry {
  tool_id: string;
  /** What the client sees, and what the therapist sees. */
  label: string;
  label_hi: string | null;
  /** The approved one-line Library description. */
  summary: string;
  summary_hi: string | null;
  section: WorksheetSection;
  /** Therapist-only. Never serialized to a client. Null on placeholders. */
  therapy_modality: string | null;
  /** Therapist-only. Never serialized to a client. Null on placeholders. */
  therapist_note: string | null;
  access_mode: WorksheetAccessMode;
  /** Null on a placeholder, which has no body to rate. */
  load_level: WorksheetLoadLevel | null;
  /** Null on a placeholder. */
  est_minutes: number | null;
  sort_order: number;
  status: CatalogueStatus;
  content_en: WorksheetContent | null;
  /** Translation of the approved English. Unapproved until the owner says so. */
  content_hi: WorksheetContent | null;
  /**
   * Where the row sits in the Library's list of cards. A card can be a single
   * worksheet (`null`) or a group whose children open from it (`breathing`).
   */
  library_group?: string | null;
  /** Set on a child row: the `tool_id` of the card it opens from. */
  parent_tool_id?: string | null;
  /**
   * Rows that already exist in the app and must not be re-created: the card
   * opens an existing screen instead of the worksheet runner.
   */
  opens: 'worksheet' | 'mood_checkin' | 'grounding' | 'breathing';
}

/** The four techniques the Breathing card opens. Guided breathing is retired. */
export const BREATHING_CHILD_TOOL_IDS = [
  'box_breathing',
  'physiological_sigh',
  'extended_exhale',
  'humming_breath',
] as const;

export const BREATHING_CARD_TOOL_ID = 'breathing';

/** The mood check-in card, which extends the check-in that already exists. */
export const MOOD_CHECKIN_TOOL_ID = 'mood_checkin';

/** The grounding card, which is the grounding exercise that already exists. */
export const GROUNDING_TOOL_ID = 'grounding_5431';

export function isListable(entry: { status: CatalogueStatus }): boolean {
  return entry.status === 'approved';
}
