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
 * The owner's own approval, given in chat, of the eight Stress & Burnout
 * worksheets on 24 November 2026. Recorded separately because the date is part
 * of what "which wording was live when" means, and the 9 Nov document did not
 * contain these worksheets.
 */
export const OWNER_APPROVAL_24_NOV = {
  approvedBy: 'Rajwant (owner)',
  approvedAt: '2026-11-24',
} as const;

/**
 * `placeholder` rows are a name and a one-line purpose for worksheets that do
 * not exist yet. They are hidden from clients AND from therapists, so they are
 * excluded from every list query by `isListable`.
 *
 * `draft` is the state of a real, written worksheet whose wording has not been
 * approved. It has a body and can be previewed, and it is switched off for
 * clients: no card, no assignment, no direct open (owner's rule, 24 Nov 2026).
 * EVERY new worksheet starts here. `approved` is only reachable by the owner
 * saying the wording is approved.
 */
export type CatalogueStatus = 'draft' | 'approved' | 'placeholder';

// ─── Care plans ───────────────────────────────────────────────────────────

/**
 * The three plans a worksheet can belong to, plus the label that means "useful
 * whoever the client is" (owner's rule, 24 Nov 2026).
 *
 * These keys are internal. The client app is never sent a care plan — not the
 * CP1/CP2/CP3 id and not a plan name — because the plan is clinical framing the
 * client did not choose to see. What the client experiences is ORDER: the
 * worksheets for their plan come first in the Library and are what Home
 * suggests. That is computed on the server, from these labels.
 */
export const CARE_PLAN_SCOPES = ['anxiety_worry', 'low_mood', 'stress_burnout'] as const;
export type CarePlanScope = (typeof CARE_PLAN_SCOPES)[number];

export type CarePlanLabel = CarePlanScope | 'all';

/** The owner's own words for each label. Therapist-facing only. */
export const CARE_PLAN_LABELS: Record<CarePlanLabel, string> = {
  anxiety_worry: 'Anxiety & Worry',
  low_mood: 'Low Mood',
  stress_burnout: 'Stress & Burnout',
  all: 'All',
};

/** Every label a row may carry, in the owner's order. */
export const CARE_PLAN_LABEL_ORDER: CarePlanLabel[] = [...CARE_PLAN_SCOPES, 'all'];

/** The internal CP1/CP2/CP3 enum, mapped. Never serialized to a client. */
export const CARE_PLAN_SCOPE_BY_ID: Record<string, CarePlanScope> = {
  CP1: 'anxiety_worry',
  CP2: 'low_mood',
  CP3: 'stress_burnout',
};

/** The scope for a client's plan id, or null when they have no plan yet. */
export function scopeForCarePlan(planId: string | null | undefined): CarePlanScope | null {
  if (!planId) return null;
  return CARE_PLAN_SCOPE_BY_ID[planId] ?? null;
}

/**
 * Does this row apply to that plan? `all` applies to everybody, and a client
 * with no plan yet matches everything (so nothing is reordered for them).
 */
export function appliesToScope(
  labels: readonly CarePlanLabel[] | null | undefined,
  scope: CarePlanScope | null,
): boolean {
  if (!scope) return true;
  if (!labels || labels.length === 0) return true;
  return labels.includes('all') || labels.includes(scope);
}

/**
 * Put the client's own plan first, keep everything else, and keep the order
 * inside each group exactly as it was given (a stable partition).
 *
 * This is the whole of "the client's assigned plan decides which worksheets show
 * first on Home" — the Library itself stays complete and browsable, and no card
 * is hidden from it.
 */
export function orderForCarePlan<T>(
  rows: readonly T[],
  scope: CarePlanScope | null,
  labelsOf: (row: T) => readonly CarePlanLabel[] | null | undefined,
): T[] {
  if (!scope) return [...rows];
  const first: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    (appliesToScope(labelsOf(row), scope) ? first : rest).push(row);
  }
  return [...first, ...rest];
}

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
  /**
   * The date the wording was approved. Absent means `ENGLISH_APPROVAL.approvedAt`
   * — the 9 Nov 2026 approved document. Set explicitly on a row approved later,
   * so a second approval never rewrites the first one's date.
   */
  approved_at?: string;
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
  opens: 'worksheet' | 'mood_checkin' | 'grounding' | 'breathing' | 'sos_calm';
  /**
   * Which care plan(s) this belongs to. Drives the order a client sees, never a
   * badge: the client is not shown a plan name. `['all']` means every plan.
   */
  care_plans: CarePlanLabel[];
  /**
   * True when this worksheet must run the extra risk screen as well as the shared
   * safety check: skipping meals, restricting food, making yourself sick,
   * exercising to punish yourself, hating your body, days without sleep, wanting
   * not to wake up, wanting to hurt someone, self-harm.
   *
   * It is a property of the row rather than a list of ids in code, so a worksheet
   * cannot be given the deeper screen by being renamed, and one that needs it
   * cannot lose it by an id change. Set at the same time as the wording, by the
   * person writing the worksheet, and never inferred from the title.
   */
  sensitive_check: boolean;
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
