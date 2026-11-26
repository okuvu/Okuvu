/**
 * The building blocks a worksheet is made of.
 *
 * One definition, three consumers: the client app renders these, the therapist
 * portal previews them, and the write path refuses to store a worksheet that
 * does not validate. Approved wording is DATA (ToolRegistryEntry.content_en /
 * content_hi), never code — so a copy change is a content change, not a
 * release of new widget code. Nothing here paraphrases the approved document:
 * prompts, helpers, examples and labels all arrive in the content JSON.
 *
 * Deliberate constraints, each with a reason:
 *
 * - No scores or instruments. There is no PHQ-9 field here and there is no
 *   "total" anywhere in this file. Every scale is a single self-report the
 *   client moves for themselves; nothing is summed, and no scale is named
 *   after an instrument. `scale_0_10` is the feeling scale (0-10, the one the
 *   demanding-worksheet gate reads); `scale_0_100` exists only for "how much
 *   do you believe it" percentages. The daily mood check-in's 1-5 value is a
 *   different field in a different table and is never accepted here.
 *
 * - Unknown keys are rejected, not ignored. A typo like `requried` would
 *   otherwise silently create an optional field where the approved worksheet
 *   says required. Failing the save is the safe direction.
 *
 * - Branching is one level deep, forward-only, and explicit. A field may
 *   declare `visibleWhen: { field, in }` pointing at an EARLIER choice or
 *   checklist field. That covers every branch in the approved set (the worry
 *   tree's "Yes"/"Not right now", the small-things planner's three-way
 *   outcome) without a rules engine that could loop or reference itself.
 */

export const WORKSHEET_CONTENT_VERSION = 1;

/** Library sections, in the order the approved document uses them. */
export const WORKSHEET_SECTIONS = [
  'notice_and_name',
  'calm_my_body',
  'untangle_thoughts',
  'do_what_matters',
  'people_boundaries',
  'be_kinder',
  'energy_life',
  'before_after',
  'safety',
] as const;

export type WorksheetSection = (typeof WORKSHEET_SECTIONS)[number];

/** Who may open the worksheet. Mirrors ToolRegistryEntry.access_mode. */
export const WORKSHEET_ACCESS_MODES = ['open', 'assigned', 'in_session', 'therapist_only'] as const;
export type WorksheetAccessMode = (typeof WORKSHEET_ACCESS_MODES)[number];

/** 'light' | 'demanding'. Mirrors ToolRegistryEntry.load_level. */
export const WORKSHEET_LOAD_LEVELS = ['light', 'demanding'] as const;
export type WorksheetLoadLevel = (typeof WORKSHEET_LOAD_LEVELS)[number];

/** Buttons a worksheet can end with. Copy comes from the content, not here. */
export const WORKSHEET_CLOSING_ACTIONS = ['done', 'treasure_box', 'get_help'] as const;
export type WorksheetClosingAction = (typeof WORKSHEET_CLOSING_ACTIONS)[number];

export const WORKSHEET_FIELD_TYPES = [
  'instruction',
  'short_text',
  'long_text',
  'voice_note',
  'scale_0_10',
  'scale_0_100',
  'feelings_picker',
  'checklist',
  'choice',
  'row_list',
  'datetime',
  'countdown_timer',
  'body_outline',
  'echo',
  'closing_reflection',
] as const;

export type WorksheetFieldType = (typeof WORKSHEET_FIELD_TYPES)[number];

export interface WorksheetOption {
  /** Stable value stored in the answers. Must not be shown to the client. */
  value: string;
  /** Client-facing wording. */
  label: string;
  /** Optional one-line explanation under the label (e.g. a thinking trap). */
  description?: string;
}

/**
 * One feeling in the picker. `parent` points at a broader family so the
 * picker can show "scared" first and open "worried / panicky / unsafe" under
 * it. Families have no parent; depth is exactly two levels.
 */
export interface WorksheetFeeling {
  id: string;
  label: string;
  parent?: string;
}

/**
 * A column in an add-your-own-rows list, e.g. "What" + "When".
 *
 * `choice` exists for the worksheets that sort a list into named buckets — the
 * priority sorter's four boxes are one choice per row, not four separate lists,
 * so the client keeps one list and labels each line. Its options are approved
 * copy like every other option in the body, and the stored answer is the option
 * value (a string), never a number or a rank.
 */
export interface WorksheetRowColumn {
  id: string;
  label: string;
  type: 'text' | 'scale_0_10' | 'datetime' | 'choice';
  /** Required on a `choice` column; refused on every other type. */
  options?: WorksheetOption[];
}

export interface WorksheetBranch {
  /** Id of an earlier `choice` or `checklist` field. */
  field: string;
  /** Show this field only when the earlier answer includes one of these. */
  in: string[];
}

export interface WorksheetFieldBase {
  id: string;
  type: WorksheetFieldType;
  /** The question on screen. Also the text of an `instruction` piece. */
  prompt: string;
  /** Defaults to false. An instruction can never be required. */
  required?: boolean;
  /** Small print under the question. */
  helper?: string;
  /** A worked example. Never a suggested answer to copy. */
  example?: string;
  /**
   * Reserve space under this piece for the therapist's personal line
   * (Homework.personal_note). Off by default; the human decides where it sits.
   */
  therapistNote?: boolean;
  /**
   * Framing the therapist needs and the client must never see: the question to
   * ask in session, or why this piece exists. Stripped from every client view
   * by `toClientWorksheetView`, so it cannot leak by being in the body.
   */
  therapistPrompt?: string;
  visibleWhen?: WorksheetBranch;
}

export interface InstructionField extends WorksheetFieldBase {
  type: 'instruction';
  /**
   * Render the client's own answers so far under this instruction. Used by the
   * "Here's your plan." screen, which reads back screens 3 to 9 before a hard
   * conversation. A read-back, never a summary written by a machine.
   */
  showAnswers?: boolean;
}

export interface ShortTextField extends WorksheetFieldBase {
  type: 'short_text';
  maxLength?: number;
}

export interface LongTextField extends WorksheetFieldBase {
  type: 'long_text';
  maxLength?: number;
}

/**
 * Speaking instead of typing. Only the transcript is stored — there is no
 * audio column anywhere in the schema and none is created here. The app
 * dictation service already works this way; this piece is the same mechanism
 * with a worksheet-shaped face.
 */
export interface VoiceNoteField extends WorksheetFieldBase {
  type: 'voice_note';
  maxLength?: number;
}

/** 0-10 self-report. End labels come from approved copy when there are any. */
export interface Scale10Field extends WorksheetFieldBase {
  type: 'scale_0_10';
  minLabel?: string;
  maxLabel?: string;
}

/** 0-100 percentage, for conviction ratings. Never a score out of anything. */
export interface Scale100Field extends WorksheetFieldBase {
  type: 'scale_0_100';
  minLabel?: string;
  maxLabel?: string;
}

export interface FeelingsPickerField extends WorksheetFieldBase {
  type: 'feelings_picker';
  feelings: WorksheetFeeling[];
  /** Defaults to 3 — the approved pickers cap at three. */
  maxSelections?: number;
  /** When true the client also rates each picked feeling on 0-10. */
  withStrength?: boolean;
  /**
   * The question shown above the per-feeling sliders, when the approved copy
   * gives one ("How strong is each one?"). Data, like every other prompt.
   */
  strengthPrompt?: string;
}

export interface ChecklistField extends WorksheetFieldBase {
  type: 'checklist';
  options: WorksheetOption[];
  minSelections?: number;
  maxSelections?: number;
}

export interface ChoiceField extends WorksheetFieldBase {
  type: 'choice';
  options: WorksheetOption[];
}

export interface RowListField extends WorksheetFieldBase {
  type: 'row_list';
  columns: WorksheetRowColumn[];
  minRows?: number;
  maxRows?: number;
  /** Label on the add-row button. Supplied by content when copy exists. */
  addLabel?: string;
}

export interface DateTimeField extends WorksheetFieldBase {
  type: 'datetime';
  /** Defaults to true. */
  withDate?: boolean;
  withTime?: boolean;
}

/**
 * A countdown the client starts and watches run down — the piece a breathing or
 * grounding step needs when the approved wording says "for two minutes".
 *
 * Deliberately not a score and not a measure of effort: the answer is the number
 * of seconds the timer actually ran, which is what the client saw on the clock.
 * Nothing sums it, averages it, or turns it into a level.
 *
 * All the wording is content: the piece supplies `startLabel` / `doneLabel` from
 * the approved copy, and the client-facing prompt says what to do while it runs.
 */
export interface CountdownTimerField extends WorksheetFieldBase {
  type: 'countdown_timer';
  /** Total length in seconds. Whole seconds, 5 to 3600. */
  seconds: number;
  /** Label on the button that starts it. Approved copy, never invented here. */
  startLabel?: string;
  /** Label once it has finished. */
  doneLabel?: string;
  /**
   * When set, stopping the timer before this many seconds leaves the piece
   * unanswered. Absent means the client may stop at any point and that is a
   * complete answer.
   */
  minSeconds?: number;
}

/** One tappable part of a body outline. `parent` groups a part under a region. */
export interface WorksheetBodyRegion {
  id: string;
  label: string;
  parent?: string;
}

/**
 * A body outline the client taps. The piece carries the parts to offer, because
 * the words are clinical copy; the app draws the outline and reports which parts
 * were tapped and, when `withStrength` is on, how strong it feels there (0-10,
 * the same scale as every other rating inside a worksheet).
 *
 * Answer shape is the feelings picker's: `{ picked, strength? }`. Never a total,
 * never a count shown back as a result.
 */
export interface BodyOutlineField extends WorksheetFieldBase {
  type: 'body_outline';
  regions: WorksheetBodyRegion[];
  /** Defaults to 3, matching the feelings pickers. */
  maxSelections?: number;
  /** When true the client also rates each tapped part on 0-10. */
  withStrength?: boolean;
  /** Question above the per-part sliders, when the approved copy gives one. */
  strengthPrompt?: string;
  /**
   * When true the client also picks feeling words for each tapped part.
   *
   * The Body map needs this: "tap where you feel something, then use the
   * feelings picker for that spot". It is deliberately per-part rather than a
   * single picker after the outline, because the whole point of the exercise is
   * that two places can feel different — a tight chest and a heavy stomach are
   * not the same feeling, and one picker for both would erase that.
   *
   * The vocabulary is the same fixed list every other picker uses, so the words
   * cannot drift apart; `feelings` in the answer is a map from region id to the
   * chosen feeling ids, exactly as `strength` is a map from region id to 0-10.
   */
  withFeelings?: boolean;
  /** Question above the per-part pickers, when the approved copy gives one. */
  feelingsPrompt?: string;
  /**
   * The vocabulary offered for each tapped part, when `withFeelings` is on.
   *
   * The same shape the feelings picker uses, so one fixed list serves both and
   * the words cannot drift apart. Required when `withFeelings` is true, and
   * refused when it is not — a vocabulary nobody can pick from is dead copy.
   */
  feelings?: WorksheetFeeling[];
  /**
   * Shown when the client tries to tap one part past `maxSelections`.
   *
   * The client is told what the limit is and that tapping again removes a part,
   * rather than the tap silently doing nothing (owner's decision, 26 Nov 2026:
   * "You can pick up to three. Tap a spot again to remove it."). Optional, so a
   * piece with no approved line stays quiet — but a silent dead tap is never
   * acceptable, so when `maxSelections` is set the catalogue requires this.
   */
  fullMessage?: string;
}

/**
 * Reads an earlier answer back inside fixed sentences, in the client's own
 * words.
 *
 * The unhooking worksheet needs this: the client writes a thought once, and the
 * screen then shows it back as "I'm having the thought that …" and "I notice I'm
 * having the thought that …". The client's words are substituted into `{answer}`
 * verbatim and never rewritten, summarised or corrected — the whole point of the
 * exercise is that the thought is unchanged and only the framing moves.
 *
 * Not answerable: like an instruction it is a screen to read, and it can never
 * be required. A frame that does not contain `{answer}` is refused, because a
 * frame with no place for the client's words would silently hide what they
 * wrote.
 */
export interface EchoField extends WorksheetFieldBase {
  type: 'echo';
  /** Id of an earlier short_text / long_text / voice_note piece. */
  fromField: string;
  /** Sentences carrying `{answer}`, in reading order. */
  frames: string[];
  /**
   * The words are safety-screened before the frame is drawn (owner's decision,
   * 24 Nov 2026).
   *
   * `true` is the only value, and it is required: a read-back is the one place
   * the app repeats a client's own sentence back to them, so it must not be
   * possible to build one that skips the check. The api answers
   * `POST /worksheets/:toolId/readback` with the frames only when the screen
   * raised nothing, and with the approved safety response when it did — so a
   * flagged thought is never shown inside "I'm having the thought that …".
   */
  screened: true;
}

export interface ClosingReflectionField extends WorksheetFieldBase {
  type: 'closing_reflection';
}

export type WorksheetField =
  | InstructionField
  | ShortTextField
  | LongTextField
  | VoiceNoteField
  | Scale10Field
  | Scale100Field
  | FeelingsPickerField
  | ChecklistField
  | ChoiceField
  | RowListField
  | DateTimeField
  | CountdownTimerField
  | BodyOutlineField
  | EchoField
  | ClosingReflectionField;

export interface WorksheetClosingButton {
  label: string;
  action: WorksheetClosingAction;
}

export interface WorksheetContent {
  version: number;
  /** Opening paragraph, above the first piece. */
  intro?: string;
  fields: WorksheetField[];
  /** Line under the last piece, plus the buttons that end the worksheet. */
  closing?: {
    text?: string;
    buttons?: WorksheetClosingButton[];
    /**
     * "Keep it or delete it" for a worksheet whose whole point is writing
     * something the client may not want kept — the unsent letter.
     *
     * When the client's answer to `field` is one of `in`, the just-saved entry
     * is removed straight away with the same delete the client's own Past me
     * uses. It is content, not app code: a worksheet that does not declare it
     * behaves exactly as before, and no field id is hard-coded in a screen.
     */
    discardWhen?: { field: string; in: string[] };
    /**
     * Carrying picked answers into another worksheet's own draft.
     *
     * "Things I might enjoy" is a menu; the Small things planner is where the
     * chosen items become a plan. Declaring the hand-off here keeps the target
     * out of the screen: the closing screen renders the button from the body,
     * and the app seeds the target's local draft with the picked labels — it
     * does not save on the client's behalf, overwrite a row they wrote, or
     * change the target worksheet in any way. The owner was explicit that the
     * planner itself must not change (24 Nov 2026), and this is the mechanism
     * that honours it.
     *
     * `field` must be an earlier checklist on this body. `targetField` names the
     * row list on the destination that receives the picks, and `targetColumn`
     * the text column inside it — named here so no screen hard-codes an id and
     * the button needs no network round-trip to work out where to put anything.
     * `toolId`, `targetField` and `targetColumn` are proved against the rest of
     * the catalogue in `handOffProblems`, because a body cannot see its
     * neighbours.
     */
    handOff?: {
      toolId: string;
      field: string;
      label: string;
      targetField: string;
      targetColumn: string;
    };
  };
  /**
   * How this worksheet's row reads in Past me, beyond the first answer's text.
   *
   * `leadField` names one `scale_0_10` piece whose chosen number leads the row,
   * written as the number the client picked — "7 out of 10" — never a band, a
   * trend or an average. It is content, not app code: a worksheet that does not
   * declare it reads exactly as before, and no field id is hard-coded in a
   * screen. The owner asked for it on the weekly load check (24 Nov 2026) so a
   * past week shows its number beside the date, with no graph.
   */
  timeline?: { leadField: string };
  /**
   * A plain-language read-back of this worksheet's own recent entries.
   *
   * The owner asked for a weekly view "in words" on the Mood and activity log
   * (24 Nov 2026), with no score. So this declares which piece holds the
   * activity words and which holds the feelings, and the api groups the last
   * `withinDays` entries by the client's own activity text, listing the feelings
   * they picked each time. Nothing is summed, averaged, ranked or turned into a
   * level — the app cannot compute "better" without inventing an ordering of
   * feelings, which would be a clinical judgement and a label.
   */
  review?: {
    /** How far back the view looks. 1-90 whole days. */
    withinDays: number;
    /** Id of an earlier short_text piece: the activity words, verbatim. */
    activityField: string;
    /** Id of an earlier feelings_picker piece. */
    feelingsField: string;
  };
}

// ─── Answers ──────────────────────────────────────────────────────────────

export type WorksheetAnswerValue =
  | string
  | string[]
  | number
  | { picked: string[]; strength?: Record<string, number>; feelings?: Record<string, string[]> }
  | Array<Record<string, string | number>>;

/** Keyed by WorksheetField.id. */
export type WorksheetAnswers = Record<string, WorksheetAnswerValue>;

// ─── Validation ───────────────────────────────────────────────────────────

export type WorksheetValidationResult =
  | { ok: true; content: WorksheetContent }
  | { ok: false; errors: string[] };

/** Hard ceilings so a runaway generator cannot ship an unrenderable sheet. */
export const WORKSHEET_LIMITS = {
  fields: 40,
  prompt: 600,
  helper: 300,
  example: 300,
  label: 120,
  description: 160,
  textAnswer: 10000,
  shortTextAnswer: 500,
  rows: 25,
  options: 24,
  feelings: 60,
  regions: 40,
  timerSeconds: 3600,
} as const;

const FIELD_ID_RE = /^[a-z][a-z0-9_]{0,47}$/;

/** Keys each field type is allowed to carry, on top of the shared ones. */
const COMMON_KEYS = [
  'id',
  'type',
  'prompt',
  'required',
  'helper',
  'example',
  'therapistNote',
  'therapistPrompt',
  'visibleWhen',
];

const TYPE_KEYS: Record<WorksheetFieldType, string[]> = {
  instruction: ['showAnswers'],
  short_text: ['maxLength'],
  long_text: ['maxLength'],
  voice_note: ['maxLength'],
  scale_0_10: ['minLabel', 'maxLabel'],
  scale_0_100: ['minLabel', 'maxLabel'],
  feelings_picker: ['feelings', 'maxSelections', 'withStrength', 'strengthPrompt'],
  checklist: ['options', 'minSelections', 'maxSelections'],
  choice: ['options'],
  row_list: ['columns', 'minRows', 'maxRows', 'addLabel'],
  datetime: ['withDate', 'withTime'],
  countdown_timer: ['seconds', 'startLabel', 'doneLabel', 'minSeconds'],
  body_outline: ['regions', 'maxSelections', 'withStrength', 'strengthPrompt', 'withFeelings', 'feelingsPrompt', 'feelings', 'fullMessage'],
  echo: ['fromField', 'frames', 'screened'],
  closing_reflection: [],
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function asInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

/**
 * Validate a worksheet body. Returns the typed content on success and a list
 * of human-readable errors on failure — the caller must not save on failure.
 */
/**
 * Validate a piece's declared feeling vocabulary.
 *
 * Extracted so the feelings picker and the body outline's per-part picker run
 * the same rules — the same ids, the same one-level nesting, the same ceiling —
 * and cannot drift apart. `at` is the path prefix the message is reported under.
 */
function feelingListProblems(feelings: unknown, at: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(feelings) || feelings.length === 0) {
    errors.push(`${at}.feelings: at least one feeling is required`);
    return errors;
  }
  if (feelings.length > WORKSHEET_LIMITS.feelings) {
    errors.push(`${at}.feelings: at most ${WORKSHEET_LIMITS.feelings}`);
    return errors;
  }
  const ids = new Set<string>();
  feelings.forEach((f, fi) => {
    if (!isPlainObject(f)) {
      errors.push(`${at}.feelings[${fi}]: must be an object`);
      return;
    }
    if (!isNonEmptyString(f.id)) errors.push(`${at}.feelings[${fi}].id: required`);
    else if (ids.has(f.id as string)) errors.push(`${at}.feelings[${fi}].id: duplicate "${f.id}"`);
    else ids.add(f.id as string);

    if (!isNonEmptyString(f.label)) errors.push(`${at}.feelings[${fi}].label: required`);
    else if ((f.label as string).length > WORKSHEET_LIMITS.label) {
      errors.push(`${at}.feelings[${fi}].label: over ${WORKSHEET_LIMITS.label} characters`);
    }

    for (const key of Object.keys(f)) {
      if (!['id', 'label', 'parent'].includes(key)) {
        errors.push(`${at}.feelings[${fi}]: unknown key "${key}"`);
      }
    }
  });
  // Second pass: parents must exist, and only one level of nesting.
  feelings.forEach((f, fi) => {
    if (!isPlainObject(f) || f.parent === undefined) return;
    if (!isNonEmptyString(f.parent)) {
      errors.push(`${at}.feelings[${fi}].parent: must be a non-empty string`);
      return;
    }
    if (f.parent === f.id) {
      errors.push(`${at}.feelings[${fi}].parent: a feeling cannot be its own parent`);
    } else if (!ids.has(f.parent as string)) {
      errors.push(`${at}.feelings[${fi}].parent: unknown feeling "${f.parent}"`);
    } else {
      const parent = feelings.find((p) => isPlainObject(p) && p.id === f.parent);
      if (isPlainObject(parent) && parent.parent !== undefined) {
        errors.push(`${at}.feelings[${fi}].parent: feelings nest only one level deep`);
      }
    }
  });
  return errors;
}

export function validateWorksheetContent(value: unknown): WorksheetValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, errors: ['content must be an object'] };
  }

  const topKeys = new Set(['version', 'intro', 'fields', 'closing', 'timeline', 'review']);
  for (const key of Object.keys(value)) {
    if (!topKeys.has(key)) errors.push(`content: unknown key "${key}"`);
  }

  if (value.version !== WORKSHEET_CONTENT_VERSION) {
    errors.push(`content.version: must be ${WORKSHEET_CONTENT_VERSION}`);
  }

  if (value.intro !== undefined && !isNonEmptyString(value.intro)) {
    errors.push('content.intro: must be a non-empty string when present');
  }

  if (!Array.isArray(value.fields) || value.fields.length === 0) {
    errors.push('content.fields: at least one piece is required');
    return { ok: false, errors };
  }

  if (value.fields.length > WORKSHEET_LIMITS.fields) {
    errors.push(`content.fields: at most ${WORKSHEET_LIMITS.fields} pieces`);
  }

  const seen = new Map<string, WorksheetFieldType>();
  const choices = new Map<string, Set<string>>();
  let closingReflectionSeen = false;

  value.fields.forEach((raw, index) => {
    const at = `fields[${index}]`;

    if (!isPlainObject(raw)) {
      errors.push(`${at}: must be an object`);
      return;
    }

    const type = raw.type;
    if (typeof type !== 'string' || !(WORKSHEET_FIELD_TYPES as readonly string[]).includes(type)) {
      errors.push(`${at}.type: unknown piece type "${String(type)}"`);
      return;
    }
    const fieldType = type as WorksheetFieldType;

    const allowed = new Set([...COMMON_KEYS, ...TYPE_KEYS[fieldType]]);
    for (const key of Object.keys(raw)) {
      if (!allowed.has(key)) errors.push(`${at}: unknown key "${key}" for ${fieldType}`);
    }

    const id = raw.id;
    if (typeof id !== 'string' || !FIELD_ID_RE.test(id)) {
      errors.push(`${at}.id: must match ${FIELD_ID_RE}`);
    } else if (seen.has(id)) {
      errors.push(`${at}.id: duplicate id "${id}"`);
    } else {
      seen.set(id, fieldType);
    }

    if (!isNonEmptyString(raw.prompt)) {
      errors.push(`${at}.prompt: required`);
    } else if ((raw.prompt as string).length > WORKSHEET_LIMITS.prompt) {
      errors.push(`${at}.prompt: over ${WORKSHEET_LIMITS.prompt} characters`);
    }

    if (raw.helper !== undefined) {
      if (!isNonEmptyString(raw.helper)) errors.push(`${at}.helper: must be a non-empty string`);
      else if ((raw.helper as string).length > WORKSHEET_LIMITS.helper) {
        errors.push(`${at}.helper: over ${WORKSHEET_LIMITS.helper} characters`);
      }
    }

    if (raw.example !== undefined) {
      if (!isNonEmptyString(raw.example)) errors.push(`${at}.example: must be a non-empty string`);
      else if ((raw.example as string).length > WORKSHEET_LIMITS.example) {
        errors.push(`${at}.example: over ${WORKSHEET_LIMITS.example} characters`);
      }
    }

    if (raw.required !== undefined && typeof raw.required !== 'boolean') {
      errors.push(`${at}.required: must be true or false`);
    }
    if (raw.therapistNote !== undefined && typeof raw.therapistNote !== 'boolean') {
      errors.push(`${at}.therapistNote: must be true or false`);
    }
    if (raw.therapistPrompt !== undefined) {
      if (!isNonEmptyString(raw.therapistPrompt)) {
        errors.push(`${at}.therapistPrompt: must be a non-empty string`);
      } else if ((raw.therapistPrompt as string).length > WORKSHEET_LIMITS.prompt) {
        errors.push(`${at}.therapistPrompt: over ${WORKSHEET_LIMITS.prompt} characters`);
      }
    }

    // An instruction is not a question; marking it required is a setup mistake.
    if (fieldType === 'instruction' && raw.required === true) {
      errors.push(`${at}.required: an instruction piece is never required`);
    }
    if (raw.showAnswers !== undefined && typeof raw.showAnswers !== 'boolean') {
      errors.push(`${at}.showAnswers: must be true or false`);
    }

    if (fieldType === 'echo') {
      const fromField = raw.fromField;
      if (!isNonEmptyString(fromField)) {
        errors.push(`${at}.fromField: required`);
      } else if (seen.get(fromField as string) === undefined) {
        // A frame can only read back something the client has already written.
        errors.push(`${at}.fromField: "${fromField}" is not an earlier piece`);
      } else {
        const earlier = seen.get(fromField as string);
        if (earlier !== 'short_text' && earlier !== 'long_text' && earlier !== 'voice_note') {
          errors.push(`${at}.fromField: "${fromField}" must be a text piece`);
        }
      }

      const frames = raw.frames;
      if (!Array.isArray(frames) || frames.length === 0) {
        errors.push(`${at}.frames: at least one frame is required`);
      } else if (frames.length > 4) {
        errors.push(`${at}.frames: at most 4 frames`);
      } else {
        frames.forEach((frame, fi) => {
          if (!isNonEmptyString(frame)) {
            errors.push(`${at}.frames[${fi}]: must be a non-empty string`);
            return;
          }
          if ((frame as string).length > WORKSHEET_LIMITS.prompt) {
            errors.push(`${at}.frames[${fi}]: over ${WORKSHEET_LIMITS.prompt} characters`);
          }
          // Without the token there is nowhere for the client's own words to
          // go, and the screen would show a sentence about a thought it had
          // silently dropped.
          if (!(frame as string).includes('{answer}')) {
            errors.push(`${at}.frames[${fi}]: must contain {answer}`);
          }
        });
      }

      if (raw.required === true) {
        errors.push(`${at}.required: an echo piece is never required`);
      }

      // A read-back repeats the client's own words, so it is screened before it
      // is drawn. The flag is not optional and cannot be false: the app asks the
      // api for the frames, and the api withholds them when the screen raises
      // anything (owner's decision, 24 Nov 2026).
      if (raw.screened !== true) {
        errors.push(`${at}.screened: an echo piece must be screened before it is shown`);
      }
    }

    if (fieldType === 'closing_reflection') {
      if (closingReflectionSeen) errors.push(`${at}: only one closing reflection is allowed`);
      closingReflectionSeen = true;
      if (index !== (value.fields as unknown[]).length - 1) {
        errors.push(`${at}: the closing reflection must be the last piece`);
      }
    }

    // ── per-type payloads ──
    const optionValues = new Set<string>();

    if (fieldType === 'choice' || fieldType === 'checklist') {
      const options = raw.options;
      if (!Array.isArray(options) || options.length < 2) {
        errors.push(`${at}.options: at least two options are required`);
      } else if (options.length > WORKSHEET_LIMITS.options) {
        errors.push(`${at}.options: at most ${WORKSHEET_LIMITS.options} options`);
      } else {
        options.forEach((opt, oi) => {
          if (!isPlainObject(opt)) {
            errors.push(`${at}.options[${oi}]: must be an object`);
            return;
          }
          if (!isNonEmptyString(opt.value)) errors.push(`${at}.options[${oi}].value: required`);
          else if (optionValues.has(opt.value as string)) {
            errors.push(`${at}.options[${oi}].value: duplicate "${opt.value}"`);
          } else optionValues.add(opt.value as string);

          if (!isNonEmptyString(opt.label)) errors.push(`${at}.options[${oi}].label: required`);
          else if ((opt.label as string).length > WORKSHEET_LIMITS.label) {
            errors.push(`${at}.options[${oi}].label: over ${WORKSHEET_LIMITS.label} characters`);
          }

          if (opt.description !== undefined) {
            if (!isNonEmptyString(opt.description)) {
              errors.push(`${at}.options[${oi}].description: must be a non-empty string`);
            } else if ((opt.description as string).length > WORKSHEET_LIMITS.description) {
              errors.push(`${at}.options[${oi}].description: over ${WORKSHEET_LIMITS.description} characters`);
            }
          }

          for (const key of Object.keys(opt)) {
            if (!['value', 'label', 'description'].includes(key)) {
              errors.push(`${at}.options[${oi}]: unknown key "${key}"`);
            }
          }
        });
      }
    }

    if (fieldType === 'checklist') {
      const min = raw.minSelections === undefined ? 0 : asInt(raw.minSelections);
      const max = raw.maxSelections === undefined ? null : asInt(raw.maxSelections);
      if (min === null || min < 0) errors.push(`${at}.minSelections: must be a whole number >= 0`);
      if (raw.maxSelections !== undefined && (max === null || max < 1)) {
        errors.push(`${at}.maxSelections: must be a whole number >= 1`);
      }
      if (min !== null && max !== null && max < min) {
        errors.push(`${at}.maxSelections: must be >= minSelections`);
      }
    }

    if (fieldType === 'feelings_picker') {
      errors.push(...feelingListProblems(raw.feelings, at));

      const maxSel = raw.maxSelections === undefined ? 3 : asInt(raw.maxSelections);
      if (maxSel === null || maxSel < 1 || maxSel > WORKSHEET_LIMITS.options) {
        errors.push(`${at}.maxSelections: must be a whole number between 1 and ${WORKSHEET_LIMITS.options}`);
      }
      if (raw.withStrength !== undefined && typeof raw.withStrength !== 'boolean') {
        errors.push(`${at}.withStrength: must be true or false`);
      }
      if (raw.strengthPrompt !== undefined) {
        if (!isNonEmptyString(raw.strengthPrompt)) {
          errors.push(`${at}.strengthPrompt: must be a non-empty string`);
        } else if ((raw.strengthPrompt as string).length > WORKSHEET_LIMITS.prompt) {
          errors.push(`${at}.strengthPrompt: over ${WORKSHEET_LIMITS.prompt} characters`);
        }
        if (raw.withStrength !== true) {
          errors.push(`${at}.strengthPrompt: needs withStrength`);
        }
      }
    }

    if (fieldType === 'row_list') {
      const columns = raw.columns;
      if (!Array.isArray(columns) || columns.length === 0) {
        errors.push(`${at}.columns: at least one column is required`);
      } else {
        const colIds = new Set<string>();
        columns.forEach((c, ci) => {
          if (!isPlainObject(c)) {
            errors.push(`${at}.columns[${ci}]: must be an object`);
            return;
          }
          if (!isNonEmptyString(c.id)) errors.push(`${at}.columns[${ci}].id: required`);
          else if (colIds.has(c.id as string)) errors.push(`${at}.columns[${ci}].id: duplicate "${c.id}"`);
          else colIds.add(c.id as string);

          if (!isNonEmptyString(c.label)) errors.push(`${at}.columns[${ci}].label: required`);
          if (!['text', 'scale_0_10', 'datetime', 'choice'].includes(String(c.type))) {
            errors.push(
              `${at}.columns[${ci}].type: must be text, scale_0_10, datetime or choice`,
            );
          }
          for (const key of Object.keys(c)) {
            if (!['id', 'label', 'type', 'options'].includes(key)) {
              errors.push(`${at}.columns[${ci}]: unknown key "${key}"`);
            }
          }

          if (c.type === 'choice') {
            const options = c.options;
            if (!Array.isArray(options) || options.length < 2) {
              errors.push(`${at}.columns[${ci}].options: at least two options are required`);
              return;
            }
            if (options.length > WORKSHEET_LIMITS.options) {
              errors.push(`${at}.columns[${ci}].options: at most ${WORKSHEET_LIMITS.options}`);
            }
            const values = new Set<string>();
            options.forEach((opt, oi) => {
              if (!isPlainObject(opt)) {
                errors.push(`${at}.columns[${ci}].options[${oi}]: must be an object`);
                return;
              }
              if (!isNonEmptyString(opt.value)) {
                errors.push(`${at}.columns[${ci}].options[${oi}].value: required`);
              } else if (values.has(opt.value as string)) {
                errors.push(`${at}.columns[${ci}].options[${oi}].value: duplicate "${opt.value}"`);
              } else {
                values.add(opt.value as string);
              }
              if (!isNonEmptyString(opt.label)) {
                errors.push(`${at}.columns[${ci}].options[${oi}].label: required`);
              } else if ((opt.label as string).length > WORKSHEET_LIMITS.label) {
                errors.push(
                  `${at}.columns[${ci}].options[${oi}].label: over ${WORKSHEET_LIMITS.label} characters`,
                );
              }
              for (const key of Object.keys(opt)) {
                if (!['value', 'label', 'description'].includes(key)) {
                  errors.push(`${at}.columns[${ci}].options[${oi}]: unknown key "${key}"`);
                }
              }
            });
          } else if (c.options !== undefined) {
            errors.push(`${at}.columns[${ci}].options: only a choice column takes options`);
          }
        });
      }

      const minRows = raw.minRows === undefined ? 0 : asInt(raw.minRows);
      const maxRows = raw.maxRows === undefined ? null : asInt(raw.maxRows);
      if (minRows === null || minRows < 0) errors.push(`${at}.minRows: must be a whole number >= 0`);
      if (raw.maxRows !== undefined) {
        if (maxRows === null || maxRows < 1 || maxRows > WORKSHEET_LIMITS.rows) {
          errors.push(`${at}.maxRows: must be a whole number between 1 and ${WORKSHEET_LIMITS.rows}`);
        }
      }
      if (minRows !== null && maxRows !== null && maxRows < minRows) {
        errors.push(`${at}.maxRows: must be >= minRows`);
      }
    }

    if (fieldType === 'datetime') {
      if (raw.withDate !== undefined && typeof raw.withDate !== 'boolean') {
        errors.push(`${at}.withDate: must be true or false`);
      }
      if (raw.withTime !== undefined && typeof raw.withTime !== 'boolean') {
        errors.push(`${at}.withTime: must be true or false`);
      }
      const withDate = raw.withDate === undefined ? true : raw.withDate === true;
      const withTime = raw.withTime === true;
      if (!withDate && !withTime) {
        errors.push(`${at}: a date picker needs at least a date or a time`);
      }
    }

    if (fieldType === 'countdown_timer') {
      const seconds = asInt(raw.seconds);
      if (seconds === null || seconds < 5 || seconds > WORKSHEET_LIMITS.timerSeconds) {
        errors.push(`${at}.seconds: must be a whole number between 5 and ${WORKSHEET_LIMITS.timerSeconds}`);
      }
      if (raw.minSeconds !== undefined) {
        const min = asInt(raw.minSeconds);
        if (min === null || min < 0) {
          errors.push(`${at}.minSeconds: must be a whole number >= 0`);
        } else if (seconds !== null && min > seconds) {
          errors.push(`${at}.minSeconds: must not be longer than seconds`);
        }
      }
      for (const key of ['startLabel', 'doneLabel'] as const) {
        const value = raw[key];
        if (value === undefined) continue;
        if (!isNonEmptyString(value)) errors.push(`${at}.${key}: must be a non-empty string`);
        else if ((value as string).length > WORKSHEET_LIMITS.label) {
          errors.push(`${at}.${key}: over ${WORKSHEET_LIMITS.label} characters`);
        }
      }
    }

    if (fieldType === 'body_outline') {
      const regions = raw.regions;
      if (!Array.isArray(regions) || regions.length === 0) {
        errors.push(`${at}.regions: at least one part is required`);
      } else if (regions.length > WORKSHEET_LIMITS.regions) {
        errors.push(`${at}.regions: at most ${WORKSHEET_LIMITS.regions} parts`);
      } else {
        const ids = new Set<string>();
        regions.forEach((r, ri) => {
          if (!isPlainObject(r)) {
            errors.push(`${at}.regions[${ri}]: must be an object`);
            return;
          }
          if (!isNonEmptyString(r.id)) errors.push(`${at}.regions[${ri}].id: required`);
          else if (ids.has(r.id as string)) {
            errors.push(`${at}.regions[${ri}].id: duplicate "${r.id}"`);
          } else ids.add(r.id as string);

          if (!isNonEmptyString(r.label)) errors.push(`${at}.regions[${ri}].label: required`);
          else if ((r.label as string).length > WORKSHEET_LIMITS.label) {
            errors.push(`${at}.regions[${ri}].label: over ${WORKSHEET_LIMITS.label} characters`);
          }

          for (const key of Object.keys(r)) {
            if (!['id', 'label', 'parent'].includes(key)) {
              errors.push(`${at}.regions[${ri}]: unknown key "${key}"`);
            }
          }
        });
        // Parents must exist, and only one level of nesting — the same rule the
        // feelings picker uses, so the two pickers cannot drift apart.
        regions.forEach((r, ri) => {
          if (!isPlainObject(r) || r.parent === undefined) return;
          if (!isNonEmptyString(r.parent)) {
            errors.push(`${at}.regions[${ri}].parent: must be a non-empty string`);
            return;
          }
          if (r.parent === r.id) {
            errors.push(`${at}.regions[${ri}].parent: a part cannot be its own parent`);
          } else if (!ids.has(r.parent as string)) {
            errors.push(`${at}.regions[${ri}].parent: unknown part "${r.parent}"`);
          } else {
            const parent = regions.find((p) => isPlainObject(p) && p.id === r.parent);
            if (isPlainObject(parent) && parent.parent !== undefined) {
              errors.push(`${at}.regions[${ri}].parent: parts nest only one level deep`);
            }
          }
        });
      }

      const maxSel = raw.maxSelections === undefined ? 3 : asInt(raw.maxSelections);
      if (maxSel === null || maxSel < 1 || maxSel > WORKSHEET_LIMITS.regions) {
        errors.push(`${at}.maxSelections: must be a whole number between 1 and ${WORKSHEET_LIMITS.regions}`);
      }
      if (raw.withStrength !== undefined && typeof raw.withStrength !== 'boolean') {
        errors.push(`${at}.withStrength: must be true or false`);
      }
      if (raw.strengthPrompt !== undefined) {
        if (!isNonEmptyString(raw.strengthPrompt)) {
          errors.push(`${at}.strengthPrompt: must be a non-empty string`);
        } else if ((raw.strengthPrompt as string).length > WORKSHEET_LIMITS.prompt) {
          errors.push(`${at}.strengthPrompt: over ${WORKSHEET_LIMITS.prompt} characters`);
        }
        if (raw.withStrength !== true) {
          errors.push(`${at}.strengthPrompt: needs withStrength`);
        }
      }
      if (raw.withFeelings !== undefined && typeof raw.withFeelings !== 'boolean') {
        errors.push(`${at}.withFeelings: must be true or false`);
      }
      if (raw.feelingsPrompt !== undefined) {
        if (!isNonEmptyString(raw.feelingsPrompt)) {
          errors.push(`${at}.feelingsPrompt: must be a non-empty string`);
        } else if ((raw.feelingsPrompt as string).length > WORKSHEET_LIMITS.prompt) {
          errors.push(`${at}.feelingsPrompt: over ${WORKSHEET_LIMITS.prompt} characters`);
        }
        if (raw.withFeelings !== true) {
          errors.push(`${at}.feelingsPrompt: needs withFeelings`);
        }
      }
      // The vocabulary and the flag must agree: a picker with nothing to pick
      // from, or a vocabulary nobody is offered, is dead copy either way.
      if (raw.withFeelings === true) {
        errors.push(...feelingListProblems(raw.feelings, at));
      } else if (raw.feelings !== undefined) {
        errors.push(`${at}.feelings: needs withFeelings`);
      }
      // A capped outline has to say what happens at the cap. `maxSelections`
      // defaults to 3, so every outline is capped, and a tap that silently does
      // nothing reads like a broken screen. The copy is therefore required
      // rather than optional (owner's decision, 26 Nov 2026).
      if (raw.fullMessage === undefined) {
        errors.push(`${at}.fullMessage: required, so a tap past the cap is never silent`);
      } else if (!isNonEmptyString(raw.fullMessage)) {
        errors.push(`${at}.fullMessage: must be a non-empty string`);
      } else if ((raw.fullMessage as string).length > WORKSHEET_LIMITS.helper) {
        errors.push(`${at}.fullMessage: over ${WORKSHEET_LIMITS.helper} characters`);
      }
    }

    if (fieldType === 'short_text' || fieldType === 'long_text' || fieldType === 'voice_note') {
      if (raw.maxLength !== undefined) {
        const max = asInt(raw.maxLength);
        const ceiling =
          fieldType === 'short_text' ? WORKSHEET_LIMITS.shortTextAnswer : WORKSHEET_LIMITS.textAnswer;
        if (max === null || max < 1 || max > ceiling) {
          errors.push(`${at}.maxLength: must be a whole number between 1 and ${ceiling}`);
        }
      }
    }

    // Record option values so a later branch can be checked against them.
    if ((fieldType === 'choice' || fieldType === 'checklist') && optionValues.size > 0) {
      choices.set(String(raw.id), optionValues);
    }
  });

  // Branches last: they reference other fields, so they need the whole list.
  (value.fields as unknown[]).forEach((raw, index) => {
    if (!isPlainObject(raw) || raw.visibleWhen === undefined) return;
    const at = `fields[${index}].visibleWhen`;
    const branch = raw.visibleWhen;
    if (!isPlainObject(branch)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    for (const key of Object.keys(branch)) {
      if (!['field', 'in'].includes(key)) errors.push(`${at}: unknown key "${key}"`);
    }
    if (!isNonEmptyString(branch.field)) {
      errors.push(`${at}.field: required`);
      return;
    }
    const targetIndex = (value.fields as Array<Record<string, unknown>>).findIndex(
      (f, i) => i < index && isPlainObject(f) && f.id === branch.field,
    );
    if (targetIndex === -1) {
      errors.push(`${at}.field: "${branch.field}" is not an earlier piece`);
      return;
    }
    const target = (value.fields as Array<Record<string, unknown>>)[targetIndex];
    if (target.type !== 'choice' && target.type !== 'checklist') {
      errors.push(`${at}.field: "${branch.field}" must be a choice or checklist`);
    }
    const allowedValues = choices.get(branch.field as string);
    if (!Array.isArray(branch.in) || branch.in.length === 0) {
      errors.push(`${at}.in: at least one option value is required`);
      return;
    }
    branch.in.forEach((v, vi) => {
      if (!isNonEmptyString(v)) {
        errors.push(`${at}.in[${vi}]: must be a non-empty option value`);
      } else if (allowedValues && !allowedValues.has(v)) {
        errors.push(`${at}.in[${vi}]: "${v}" is not an option of "${branch.field}"`);
      }
    });
  });

  if (value.closing !== undefined) {
    if (!isPlainObject(value.closing)) {
      errors.push('content.closing: must be an object');
    } else {
      for (const key of Object.keys(value.closing)) {
        if (!['text', 'buttons', 'discardWhen', 'handOff'].includes(key)) {
          errors.push(`content.closing: unknown key "${key}"`);
        }
      }
      if (value.closing.text !== undefined && !isNonEmptyString(value.closing.text)) {
        errors.push('content.closing.text: must be a non-empty string when present');
      }
      if (value.closing.discardWhen !== undefined) {
        const discard = value.closing.discardWhen;
        if (!isPlainObject(discard)) {
          errors.push('content.closing.discardWhen: must be an object');
        } else {
          for (const key of Object.keys(discard)) {
            if (!['field', 'in'].includes(key)) {
              errors.push(`content.closing.discardWhen: unknown key "${key}"`);
            }
          }
          if (!isNonEmptyString(discard.field)) {
            errors.push('content.closing.discardWhen.field: required');
          } else {
            const allowedValues = choices.get(discard.field as string);
            if (!allowedValues) {
              errors.push(
                `content.closing.discardWhen.field: "${discard.field}" is not an earlier choice`,
              );
            } else if (!Array.isArray(discard.in) || discard.in.length === 0) {
              errors.push('content.closing.discardWhen.in: at least one option value is required');
            } else {
              discard.in.forEach((v, vi) => {
                if (!isNonEmptyString(v)) {
                  errors.push(
                    `content.closing.discardWhen.in[${vi}]: must be a non-empty option value`,
                  );
                } else if (!allowedValues.has(v as string)) {
                  errors.push(
                    `content.closing.discardWhen.in[${vi}]: "${v}" is not one of its options`,
                  );
                }
              });
            }
          }
        }
      }
      if (value.closing.handOff !== undefined) {
        const handOff = value.closing.handOff;
        if (!isPlainObject(handOff)) {
          errors.push('content.closing.handOff: must be an object');
        } else {
          for (const key of Object.keys(handOff)) {
            if (!['toolId', 'field', 'label', 'targetField', 'targetColumn'].includes(key)) {
              errors.push(`content.closing.handOff: unknown key \"${key}\"`);
            }
          }
          if (!isNonEmptyString(handOff.toolId)) {
            errors.push('content.closing.handOff.toolId: required');
          }
          if (!isNonEmptyString(handOff.label)) {
            errors.push('content.closing.handOff.label: required');
          }
          if (!isNonEmptyString(handOff.targetField)) {
            errors.push('content.closing.handOff.targetField: required');
          }
          if (!isNonEmptyString(handOff.targetColumn)) {
            errors.push('content.closing.handOff.targetColumn: required');
          }
          if (!isNonEmptyString(handOff.field)) {
            errors.push('content.closing.handOff.field: required');
          } else if (seen.get(handOff.field as string) !== 'checklist') {
            // "Send the ones I picked" only means something if the client
            // actually picked from a list. A text field would have no labels to
            // carry over, and a choice would carry exactly one.
            errors.push(
              `content.closing.handOff.field: \"${handOff.field}\" must be an earlier checklist`,
            );
          }
        }
      }
      if (value.closing.buttons !== undefined) {
        const buttons = value.closing.buttons;
        if (!Array.isArray(buttons) || buttons.length === 0) {
          errors.push('content.closing.buttons: must be a non-empty list when present');
        } else {
          const actions = new Set<string>();
          buttons.forEach((b, bi) => {
            if (!isPlainObject(b)) {
              errors.push(`content.closing.buttons[${bi}]: must be an object`);
              return;
            }
            for (const key of Object.keys(b)) {
              if (!['label', 'action'].includes(key)) {
                errors.push(`content.closing.buttons[${bi}]: unknown key "${key}"`);
              }
            }
            if (!isNonEmptyString(b.label)) errors.push(`content.closing.buttons[${bi}].label: required`);
            if (!(WORKSHEET_CLOSING_ACTIONS as readonly string[]).includes(String(b.action))) {
              errors.push(
                `content.closing.buttons[${bi}].action: must be one of ${WORKSHEET_CLOSING_ACTIONS.join(', ')}`,
              );
            } else if (actions.has(b.action as string)) {
              errors.push(`content.closing.buttons[${bi}].action: duplicate "${b.action}"`);
            } else {
              actions.add(b.action as string);
            }
          });
        }
      }
    }
  }

  if (value.timeline !== undefined) {
    const timeline = value.timeline;
    if (!isPlainObject(timeline)) {
      errors.push('content.timeline: must be an object');
    } else {
      for (const key of Object.keys(timeline)) {
        if (key !== 'leadField') errors.push(`content.timeline: unknown key "${key}"`);
      }
      if (!isNonEmptyString(timeline.leadField)) {
        errors.push('content.timeline.leadField: required');
      } else if (seen.get(timeline.leadField as string) !== 'scale_0_10') {
        // The row leads with a number the client chose on a 0-10 slider. Any
        // other piece would have to be summarised to become a lead, and a
        // summary is exactly what rule 5 refuses.
        errors.push(
          `content.timeline.leadField: "${timeline.leadField}" must be an earlier scale_0_10 piece`,
        );
      }
    }
  }

  if (value.review !== undefined) {
    const review = value.review;
    if (!isPlainObject(review)) {
      errors.push('content.review: must be an object');
    } else {
      for (const key of Object.keys(review)) {
        if (!['withinDays', 'activityField', 'feelingsField'].includes(key)) {
          errors.push(`content.review: unknown key \"${key}\"`);
        }
      }
      const days = asInt(review.withinDays);
      if (days === null || days < 1 || days > 90) {
        errors.push('content.review.withinDays: must be a whole number between 1 and 90');
      }
      if (!isNonEmptyString(review.activityField)) {
        errors.push('content.review.activityField: required');
      } else if (seen.get(review.activityField as string) !== 'short_text') {
        // The activity words are read back verbatim. A long or spoken piece
        // would put a paragraph in a one-line group heading.
        errors.push(
          `content.review.activityField: \"${review.activityField}\" must be an earlier short_text piece`,
        );
      }
      if (!isNonEmptyString(review.feelingsField)) {
        errors.push('content.review.feelingsField: required');
      } else if (seen.get(review.feelingsField as string) !== 'feelings_picker') {
        errors.push(
          `content.review.feelingsField: \"${review.feelingsField}\" must be an earlier feelings_picker piece`,
        );
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, content: value as unknown as WorksheetContent };
}

/**
 * The Hinglish body must be the same worksheet as the English one: same
 * pieces, same order, same option values and feelings, so a client can switch
 * language mid-way without losing what they already answered. Labels and
 * prompts differ; ids and values must not.
 */
export function validateWorksheetTranslation(
  english: WorksheetContent,
  hinge: WorksheetContent,
): string[] {
  const errors: string[] = [];

  if (english.fields.length !== hinge.fields.length) {
    errors.push(
      `translation: ${hinge.fields.length} pieces against ${english.fields.length} in English`,
    );
    return errors;
  }

  english.fields.forEach((en, i) => {
    const hi = hinge.fields[i];
    const at = `fields[${i}]`;
    if (en.id !== hi.id) errors.push(`${at}: id "${hi.id}" against "${en.id}" in English`);
    if (en.type !== hi.type) errors.push(`${at}: type "${hi.type}" against "${en.type}" in English`);
    if ((en.required === true) !== (hi.required === true)) {
      errors.push(`${at}: required differs from English`);
    }
    if ((en.therapistNote === true) !== (hi.therapistNote === true)) {
      errors.push(`${at}: therapistNote differs from English`);
    }

    const enOptions = 'options' in en ? en.options : undefined;
    const hiOptions = 'options' in hi ? (hi as { options?: WorksheetOption[] }).options : undefined;
    if (enOptions || hiOptions) {
      const enValues = (enOptions ?? []).map((o) => o.value);
      const hiValues = (hiOptions ?? []).map((o) => o.value);
      if (enValues.join('|') !== hiValues.join('|')) {
        errors.push(`${at}: option values differ from English`);
      }
    }

    const enFeelings = 'feelings' in en ? en.feelings : undefined;
    const hiFeelings = 'feelings' in hi ? (hi as { feelings?: WorksheetFeeling[] }).feelings : undefined;
    if (enFeelings || hiFeelings) {
      const enIds = (enFeelings ?? []).map((f) => f.id);
      const hiIds = (hiFeelings ?? []).map((f) => f.id);
      if (enIds.join('|') !== hiIds.join('|')) {
        errors.push(`${at}: feeling ids differ from English`);
      }
    }

    const enColumns = 'columns' in en ? en.columns : undefined;
    const hiColumns = 'columns' in hi ? (hi as { columns?: WorksheetRowColumn[] }).columns : undefined;
    if (enColumns || hiColumns) {
      const enShape = (enColumns ?? []).map((c) => `${c.id}:${c.type}`).join('|');
      const hiShape = (hiColumns ?? []).map((c) => `${c.id}:${c.type}`).join('|');
      if (enShape !== hiShape) {
        errors.push(`${at}: row columns differ from English`);
      } else {
        (enColumns ?? []).forEach((enCol, ci) => {
          const hiCol = (hiColumns ?? [])[ci];
          const enValues = (enCol.options ?? []).map((o) => o.value).join('|');
          const hiValues = (hiCol?.options ?? []).map((o) => o.value).join('|');
          if (enValues !== hiValues) {
            errors.push(`${at}: column "${enCol.id}" option values differ from English`);
          }
        });
      }
    }

    const enBranch = en.visibleWhen;
    const hiBranch = hi.visibleWhen;
    if (Boolean(enBranch) !== Boolean(hiBranch)) {
      errors.push(`${at}: branching differs from English`);
    } else if (enBranch && hiBranch) {
      if (enBranch.field !== hiBranch.field) errors.push(`${at}: branch target differs from English`);
      if (enBranch.in.join('|') !== hiBranch.in.join('|')) {
        errors.push(`${at}: branch values differ from English`);
      }
    }
  });

  return errors;
}

// ─── Reading answers ──────────────────────────────────────────────────────

/** Does this piece apply, given what has been answered so far? */
export function isFieldVisible(field: WorksheetField, answers: WorksheetAnswers): boolean {
  const branch = field.visibleWhen;
  if (!branch) return true;
  const answer = answers[branch.field];
  if (Array.isArray(answer)) return answer.some((v) => typeof v === 'string' && branch.in.includes(v));
  if (typeof answer === 'string') return branch.in.includes(answer);
  return false;
}

/** The pieces a client will actually be shown, in order. */
export function visibleFields(content: WorksheetContent, answers: WorksheetAnswers): WorksheetField[] {
  return content.fields.filter((f) => isFieldVisible(f, answers));
}

/** True when a piece has something in it. Used for the "optional" hint. */
export function isAnswerPresent(answer: WorksheetAnswerValue | undefined): boolean {
  if (answer === undefined || answer === null) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (typeof answer === 'number') return Number.isFinite(answer);
  if (Array.isArray(answer)) return answer.length > 0;
  if (typeof answer === 'object' && answer !== null && 'picked' in answer) {
    const picked = (answer as { picked?: unknown }).picked;
    return Array.isArray(picked) && picked.length > 0;
  }
  return false;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Check answers against the worksheet. Returns the problems; an empty list
 * means it can be saved. Optional pieces that were left blank are fine —
 * "optional" is the default, and the approved worksheets lean on it heavily.
 */
export function validateWorksheetAnswers(
  content: WorksheetContent,
  answers: WorksheetAnswers,
): string[] {
  const errors: string[] = [];

  for (const field of content.fields) {
    if (!isFieldVisible(field, answers)) continue;

    const answer = answers[field.id];
    const present = isAnswerPresent(answer);

    if (!present) {
      if (field.required === true && field.type !== 'instruction') {
        errors.push(`${field.id}: an answer is required`);
      }
      continue;
    }

    switch (field.type) {
      case 'instruction':
      case 'echo': {
        // Not answerable; a value here means the client's answers are stale.
        errors.push(`${field.id}: this piece does not take an answer`);
        break;
      }
      case 'closing_reflection': {
        // A reflection question at the end: the client may write something,
        // and it is always optional.
        if (typeof answer !== 'string') {
          errors.push(`${field.id}: must be text`);
          break;
        }
        if (answer.length > WORKSHEET_LIMITS.textAnswer) {
          errors.push(`${field.id}: over ${WORKSHEET_LIMITS.textAnswer} characters`);
        }
        break;
      }
      case 'short_text':
      case 'long_text':
      case 'voice_note': {
        if (typeof answer !== 'string') {
          errors.push(`${field.id}: must be text`);
          break;
        }
        const ceiling =
          field.maxLength ??
          (field.type === 'short_text'
            ? WORKSHEET_LIMITS.shortTextAnswer
            : WORKSHEET_LIMITS.textAnswer);
        if (answer.length > ceiling) errors.push(`${field.id}: over ${ceiling} characters`);
        break;
      }
      case 'scale_0_10':
      case 'scale_0_100': {
        const max = field.type === 'scale_0_10' ? 10 : 100;
        if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer > max) {
          errors.push(`${field.id}: must be a whole number between 0 and ${max}`);
        }
        break;
      }
      case 'choice': {
        if (typeof answer !== 'string') {
          errors.push(`${field.id}: must be one option value`);
          break;
        }
        if (!field.options.some((o) => o.value === answer)) {
          errors.push(`${field.id}: "${answer}" is not one of its options`);
        }
        break;
      }
      case 'checklist': {
        const picked = Array.isArray(answer) ? (answer as unknown[]) : null;
        if (!picked || picked.some((v) => typeof v !== 'string')) {
          errors.push(`${field.id}: must be a list of option values`);
          break;
        }
        const values = field.options.map((o) => o.value);
        for (const v of picked as string[]) {
          if (!values.includes(v)) errors.push(`${field.id}: "${v}" is not one of its options`);
        }
        const min = field.minSelections ?? 0;
        const max = field.maxSelections ?? Number.POSITIVE_INFINITY;
        if (picked.length < min) errors.push(`${field.id}: at least ${min} selections`);
        if (picked.length > max) errors.push(`${field.id}: at most ${max} selections`);
        break;
      }
      case 'feelings_picker': {
        if (
          typeof answer !== 'object' ||
          Array.isArray(answer) ||
          !('picked' in answer) ||
          !Array.isArray(answer.picked)
        ) {
          errors.push(`${field.id}: must be a list of picked feelings`);
          break;
        }
        const ids = field.feelings.map((f) => f.id);
        for (const p of answer.picked) {
          if (!ids.includes(p)) errors.push(`${field.id}: "${p}" is not one of its feelings`);
        }
        const max = field.maxSelections ?? 3;
        if (answer.picked.length > max) errors.push(`${field.id}: at most ${max} feelings`);
        if (answer.strength) {
          for (const [key, value] of Object.entries(answer.strength)) {
            if (!answer.picked.includes(key)) {
              errors.push(`${field.id}: strength given for unpicked feeling "${key}"`);
            }
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
              errors.push(`${field.id}.strength.${key}: must be a whole number between 0 and 10`);
            }
          }
        }
        break;
      }
      case 'row_list': {
        if (!Array.isArray(answer)) {
          errors.push(`${field.id}: must be a list of rows`);
          break;
        }
        const max = field.maxRows ?? WORKSHEET_LIMITS.rows;
        if (answer.length > max) errors.push(`${field.id}: at most ${max} rows`);
        const min = field.minRows ?? 0;
        if (answer.length < min) errors.push(`${field.id}: at least ${min} rows`);
        const colIds = field.columns.map((c) => c.id);
        answer.forEach((row, ri) => {
          if (typeof row !== 'object' || row === null || Array.isArray(row)) {
            errors.push(`${field.id}[${ri}]: must be an object of column values`);
            return;
          }
          for (const key of Object.keys(row)) {
            if (!colIds.includes(key)) errors.push(`${field.id}[${ri}]: unknown column "${key}"`);
          }
          for (const col of field.columns) {
            const v = (row as Record<string, string | number>)[col.id];
            if (v === undefined) continue;
            if (col.type === 'text' && typeof v !== 'string') {
              errors.push(`${field.id}[${ri}].${col.id}: must be text`);
            }
            if (col.type === 'scale_0_10') {
              if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 10) {
                errors.push(`${field.id}[${ri}].${col.id}: must be a whole number between 0 and 10`);
              }
            }
            if (col.type === 'datetime' && typeof v !== 'string') {
              errors.push(`${field.id}[${ri}].${col.id}: must be a date or date-time string`);
            }
            if (col.type === 'choice') {
              const values = (col.options ?? []).map((o) => o.value);
              if (typeof v !== 'string') {
                errors.push(`${field.id}[${ri}].${col.id}: must be one option value`);
              } else if (!values.includes(v)) {
                errors.push(`${field.id}[${ri}].${col.id}: "${v}" is not one of its options`);
              }
            }
          }
        });
        break;
      }
      case 'datetime': {
        if (typeof answer !== 'string') {
          errors.push(`${field.id}: must be a date or date-time string`);
          break;
        }
        const [datePart, timePart] = answer.split('T');
        if (!ISO_DATE_RE.test(datePart ?? '')) {
          errors.push(`${field.id}: date must be YYYY-MM-DD`);
        }
        if (timePart !== undefined && !ISO_TIME_RE.test(timePart)) {
          errors.push(`${field.id}: time must be HH:mm`);
        }
        break;
      }
      case 'countdown_timer': {
        // Seconds the timer actually ran. A single duration, never a total of
        // anything, and never compared against a threshold.
        if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0) {
          errors.push(`${field.id}: must be a whole number of seconds`);
          break;
        }
        if (answer > field.seconds) {
          errors.push(`${field.id}: longer than the timer`);
        }
        break;
      }
      case 'body_outline': {
        if (
          typeof answer !== 'object' ||
          Array.isArray(answer) ||
          !('picked' in answer) ||
          !Array.isArray((answer as { picked?: unknown }).picked)
        ) {
          errors.push(`${field.id}: must be a list of tapped parts`);
          break;
        }
        const picked = (answer as { picked: unknown[] }).picked;
        const ids = field.regions.map((r) => r.id);
        for (const p of picked) {
          if (typeof p !== 'string' || !ids.includes(p)) {
            errors.push(`${field.id}: "${String(p)}" is not one of its parts`);
          }
        }
        const max = field.maxSelections ?? 3;
        if (picked.length > max) errors.push(`${field.id}: at most ${max} parts`);
        const strength = (answer as { strength?: Record<string, unknown> }).strength;
        if (strength) {
          for (const [key, value] of Object.entries(strength)) {
            if (!picked.includes(key)) {
              errors.push(`${field.id}: strength given for untapped part "${key}"`);
            }
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
              errors.push(`${field.id}.strength.${key}: must be a whole number between 0 and 10`);
            }
          }
        }
        // Per-part feelings, when the piece offers them: the same rules the
        // feelings picker applies to its own answer, keyed by tapped part.
        const feelings = (answer as { feelings?: Record<string, unknown> }).feelings;
        if (feelings) {
          if (field.withFeelings !== true) {
            errors.push(`${field.id}: feelings given but this piece offers none`);
          }
          const allowed = (field.feelings ?? []).map((f) => f.id);
          const maxFeelings = field.maxSelections ?? 3;
          for (const [key, value] of Object.entries(feelings)) {
            if (!picked.includes(key)) {
              errors.push(`${field.id}: feelings given for untapped part "${key}"`);
            }
            if (!Array.isArray(value)) {
              errors.push(`${field.id}.feelings.${key}: must be a list of feelings`);
              continue;
            }
            if (value.length > maxFeelings) {
              errors.push(`${field.id}.feelings.${key}: at most ${maxFeelings} feelings`);
            }
            for (const f of value) {
              if (typeof f !== 'string' || !allowed.includes(f)) {
                errors.push(`${field.id}.feelings.${key}: "${String(f)}" is not one of its feelings`);
              }
            }
          }
        }
        break;
      }
      default: {
        const exhaustive: never = field;
        void exhaustive;
      }
    }
  }

  // An answer for a piece that is not on screen means the branch flipped after
  // the fact; that answer is not part of this submission.
  for (const key of Object.keys(answers)) {
    const field = content.fields.find((f) => f.id === key);
    if (!field) {
      errors.push(`${key}: not a piece of this worksheet`);
    } else if (!isFieldVisible(field, answers)) {
      errors.push(`${key}: answered but not shown for the branch taken`);
    }
  }

  return errors;
}

/**
 * How far through the client is, for the progress bar. Instructions and the
 * closing reflection are not counted as answerable steps.
 */
export function worksheetProgress(
  content: WorksheetContent,
  answers: WorksheetAnswers,
): { answered: number; total: number } {
  const answerable = visibleFields(content, answers).filter(
    (f) => f.type !== 'instruction' && f.type !== 'echo' && f.type !== 'closing_reflection',
  );
  const answered = answerable.filter((f) => isAnswerPresent(answers[f.id])).length;
  return { answered, total: answerable.length };
}

/** The pieces that block "next", in order. Empty means the step is complete. */
export function missingRequiredFields(
  content: WorksheetContent,
  answers: WorksheetAnswers,
): WorksheetField[] {
  return visibleFields(content, answers).filter(
    (f) =>
      f.required === true &&
      f.type !== 'instruction' &&
      f.type !== 'echo' &&
      !isAnswerPresent(answers[f.id]),
  );
}

// ─── Content rules that are not about shape ───────────────────────────────

/**
 * Things a worksheet may never ask a client for (owner's rule, 24 Nov 2026).
 *
 * These are not style preferences: a worksheet that asks for a weight, a
 * measurement, a calorie count, an amount of food or a medicine turns a therapy
 * exercise into a record that can be read as a target, and for the worksheets
 * about eating and the body it is exactly what the clinical owner ruled out. The
 * check runs over every client-facing string in the body, so it cannot be
 * slipped past by putting the question in a helper line or an option label.
 *
 * Therapist-only strings are not scanned: `therapistPrompt` and the row's
 * `therapist_note` are never shown to a client.
 */
const FORBIDDEN_REQUEST_PATTERNS: Array<{ what: string; re: RegExp }> = [
  { what: 'weight', re: /\bweight\b|\bweigh(?:ed|ing)? yourself\b|\bkg\b|\bkilos?\b|\bkilograms?\b|\bpounds\b|\blbs\b|\bbmi\b|\bbody mass\b/i },
  { what: 'body measurements', re: /\bbody measurements?\b|\bmeasurements? of (?:your|the) body\b|\bwaist(?:line)?\b|\bhips? measurements?\b|\bchest measurements?\b|\btape measure\b/i },
  { what: 'calories', re: /\bcalories?\b|\bkcal\b|\bcarbs?\b|\bmacros?\b/i },
  { what: 'food amounts', re: /\bhow much (?:did|do) you eat\b|\bhow many (?:meals|calories|servings|portions)\b|\bgrams?\b|\bportions?\b|\bservings?\b|\bcount(?:ing)? (?:your )?(?:meals|calories)\b/i },
  { what: 'medicines', re: /\bmedicines?\b|\bmedications?\b|\btablets?\b|\bpills?\b|\bdoses?\b|\bdosage\b|\bprescriptions?\b|\bmg\b/i },
];

/**
 * Ways a worksheet may never talk about its own output (owner's rule, 24 Nov
 * 2026): no worksheet adds answers into a total, a level or a label, and a
 * slider shows only the number the client chose.
 *
 * There is no aggregate piece type and no summing code anywhere, so the only way
 * this rule breaks is copy that promises one — a client reads "your score" on a
 * screen that has no score, and the wording alone turns their answers into a
 * verdict on them.
 */
const FORBIDDEN_SCORE_PATTERNS: Array<{ what: string; re: RegExp }> = [
  { what: 'a score', re: /\b(?:total|overall|final) score\b|\byour score (?:is|was|of)\b|\bscore out of\b|\bscore of \d+\b/i },
  { what: 'a level', re: /\byour (?:anxiety|depress\w*|stress|burnout|mood) (?:score|level|rating)\b|\blevel \d+ of \d+\b/i },
  { what: 'a total', re: /\badd (?:it|them|these|everything) up\b|\bsum (?:it|them|these) up\b|\bwhat (?:is|was) your total\b/i },
];

interface LooseField {
  [key: string]: unknown;
}

const asObjects = (value: unknown): LooseField[] =>
  Array.isArray(value)
    ? value.filter((v): v is LooseField => typeof v === 'object' && v !== null)
    : [];

/** Every client-facing string in a body, in reading order. */
export function clientFacingStrings(content: WorksheetContent): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    if (typeof value === 'string' && value.trim().length > 0) out.push(value);
  };

  push(content.intro);
  push(content.closing?.text);
  for (const button of content.closing?.buttons ?? []) push(button.label);

  for (const field of content.fields as unknown as LooseField[]) {
    push(field.prompt);
    push(field.helper);
    push(field.example);
    push(field.startLabel);
    push(field.doneLabel);
    push(field.strengthPrompt);
    push(field.feelingsPrompt);
    push(field.addLabel);
    push(field.minLabel);
    push(field.maxLabel);
    for (const frame of Array.isArray(field.frames) ? field.frames : []) push(frame);
    for (const option of asObjects(field.options)) {
      push(option.label);
      push(option.description);
    }
    for (const feeling of asObjects(field.feelings)) push(feeling.label);
    for (const region of asObjects(field.regions)) push(region.label);
    for (const column of asObjects(field.columns)) {
      push(column.label);
      // A choice column carries option labels too; they are client-facing copy
      // and get the same forbidden-ask and score guard as every other label.
      for (const option of asObjects(column.options)) {
        push(option.label);
        push(option.description);
      }
    }
  }

  return out;
}

/**
 * Problems with what a body ASKS FOR. Empty means it may be stored.
 *
 * Separate from the shape validator because these are content rules an approved
 * document can break by accident, and a report should name the sentence and the
 * rule rather than say "invalid worksheet".
 */
export function worksheetRequestProblems(content: unknown): string[] {
  const checked = validateWorksheetContent(content);
  if (!checked.ok) return []; // shape problems are reported by the caller
  const problems: string[] = [];

  for (const text of clientFacingStrings(checked.content)) {
    for (const rule of FORBIDDEN_REQUEST_PATTERNS) {
      if (rule.re.test(text)) {
        problems.push(`asks for ${rule.what}: "${text.slice(0, 80)}"`);
        break;
      }
    }
    for (const rule of FORBIDDEN_SCORE_PATTERNS) {
      if (rule.re.test(text)) {
        problems.push(`talks about ${rule.what}: "${text.slice(0, 80)}"`);
        break;
      }
    }
  }

  return problems;
}

// ─── Catalogue rows ───────────────────────────────────────────────────────

/**
 * The columns a catalogue row must supply. Structural rather than a Prisma
 * type so the same checks run in the api, in the portal, and in a test with no
 * database, and neither side can drift into "the portal allows what the api
 * would refuse".
 */
export interface WorksheetRegistryRow {
  tool_id: string;
  kind: string;
  status: string;
  label: string;
  summary: string | null;
  section: string | null;
  therapy_modality: string | null;
  access_mode: string;
  load_level: string | null;
  est_minutes: number | null;
  content_en: unknown;
  content_hi: unknown;
}

export class InvalidWorksheetError extends Error {
  readonly toolId: string;
  readonly problems: string[];

  constructor(toolId: string, problems: string[]) {
    super(`Worksheet "${toolId}" is not valid: ${problems.join('; ')}`);
    this.name = 'InvalidWorksheetError';
    this.toolId = toolId;
    this.problems = problems;
  }
}

/**
 * Every problem with one row, empty when it is fit to store and serve.
 *
 * A worksheet is data, so a malformed one can be saved and then found by a
 * client halfway through an exercise. This is the check that makes "a badly
 * put-together worksheet must not be saveable" true, and it runs on the read
 * path too, so a bad row that got in before the check existed still cannot
 * reach anyone.
 */
export function worksheetRowProblems(row: WorksheetRegistryRow): string[] {
  const problems: string[] = [];

  if (!row.summary || row.summary.trim().length === 0) {
    // The Library list needs a client-facing line. The therapist note is not a
    // substitute: it is not client-safe copy.
    problems.push('summary: a Library description is required');
  }

  if (!row.section || !(WORKSHEET_SECTIONS as readonly string[]).includes(row.section)) {
    problems.push(`section: must be one of ${WORKSHEET_SECTIONS.join(', ')}`);
  }

  if (!(WORKSHEET_ACCESS_MODES as readonly string[]).includes(row.access_mode)) {
    problems.push(`access_mode: must be one of ${WORKSHEET_ACCESS_MODES.join(', ')}`);
  }

  if (row.load_level !== null && !(WORKSHEET_LOAD_LEVELS as readonly string[]).includes(row.load_level)) {
    problems.push(`load_level: must be one of ${WORKSHEET_LOAD_LEVELS.join(', ')}`);
  }

  if (
    row.est_minutes !== null &&
    (!Number.isInteger(row.est_minutes) || row.est_minutes < 1 || row.est_minutes > 120)
  ) {
    problems.push('est_minutes: must be a whole number between 1 and 120');
  }

  if (row.content_en === null || row.content_en === undefined) {
    problems.push('content_en: the English body is required');
    return problems;
  }

  const english = validateWorksheetContent(row.content_en);
  if (!english.ok) {
    for (const error of english.errors) problems.push(`content_en.${error}`);
    // Comparing a Hinglish body against a broken English one only adds noise.
    return problems;
  }

  // What the body ASKS FOR, not how it is shaped: a worksheet may not solicit a
  // weight, a measurement, calories, an amount of food or a medicine, and may not
  // promise a score, a level or a total (owner's rules, 24 Nov 2026).
  for (const problem of worksheetRequestProblems(row.content_en)) {
    problems.push(`content_en.${problem}`);
  }

  if (row.content_hi !== null && row.content_hi !== undefined) {
    const hinglish = validateWorksheetContent(row.content_hi);
    if (!hinglish.ok) {
      for (const error of hinglish.errors) problems.push(`content_hi.${error}`);
      return problems;
    }
    for (const error of validateWorksheetTranslation(english.content, hinglish.content)) {
      problems.push(`content_hi.${error}`);
    }
  }

  return problems;
}

export interface ParsedWorksheet {
  english: WorksheetContent;
  hinglish: WorksheetContent | null;
}

/** Validate and return both bodies, or throw. Used by the portal's preview. */
export function parseWorksheetRow(row: WorksheetRegistryRow): ParsedWorksheet {
  const problems = worksheetRowProblems(row);
  if (problems.length > 0) throw new InvalidWorksheetError(row.tool_id, problems);

  const english = validateWorksheetContent(row.content_en);
  if (!english.ok) throw new InvalidWorksheetError(row.tool_id, english.errors);

  let hinglish: WorksheetContent | null = null;
  if (row.content_hi !== null && row.content_hi !== undefined) {
    const hi = validateWorksheetContent(row.content_hi);
    if (!hi.ok) throw new InvalidWorksheetError(row.tool_id, hi.errors);
    hinglish = hi.content;
  }

  return { english: english.content, hinglish };
}

/**
 * Throw unless this row may be shown to a client. Only the client path uses
 * this; the portal previews drafts on purpose.
 */
export function assertClientServable(row: WorksheetRegistryRow): ParsedWorksheet {
  if (row.status !== 'approved') {
    throw new InvalidWorksheetError(row.tool_id, [`status: "${row.status}" is not approved`]);
  }
  return parseWorksheetRow(row);
}

/**
 * What a client is allowed to receive.
 *
 * Note what is absent: `therapy_modality` is therapist-only (the approved
 * document says so), `status` is internal, and no therapist-facing note lives
 * in the body — the per-piece `therapistNote` flag only reserves space for the
 * assignment's personal line.
 */
export interface ClientWorksheetView {
  toolId: string;
  label: string;
  summary: string | null;
  section: WorksheetSection;
  accessMode: WorksheetAccessMode;
  loadLevel: WorksheetLoadLevel | null;
  estMinutes: number | null;
  content: WorksheetContent;
}

/**
 * Remove every therapist-only string from a body before it goes to a client.
 *
 * `therapistPrompt` carries the framing a therapist needs ("What thoughts,
 * feelings, situations or behaviours tell you things are getting difficult?").
 * It lives in the same JSON as the client's questions, so the only safe rule is
 * to strip it on the way out rather than trust each caller to remember. The
 * object is copied, never mutated: the catalogue row stays intact.
 */
export function stripTherapistCopy(content: WorksheetContent): WorksheetContent {
  const fields = content.fields.map((field) => {
    if (!('therapistPrompt' in field) || field.therapistPrompt === undefined) return field;
    const { therapistPrompt: _removed, ...rest } = field as WorksheetField & {
      therapistPrompt?: string;
    };
    return rest as WorksheetField;
  });
  return { ...content, fields };
}

export function toClientWorksheetView(
  row: WorksheetRegistryRow,
  language: 'en' | 'hi' = 'en',
): ClientWorksheetView {
  const parsed = assertClientServable(row);
  const content = language === 'hi' && parsed.hinglish ? parsed.hinglish : parsed.english;

  return {
    toolId: row.tool_id,
    label: row.label,
    summary: row.summary,
    section: row.section as WorksheetSection,
    accessMode: row.access_mode as WorksheetAccessMode,
    loadLevel: (row.load_level as WorksheetLoadLevel | null) ?? null,
    estMinutes: row.est_minutes,
    content: stripTherapistCopy(content),
  };
}
