/**
 * The safety surfaces the api, the portal and the app must agree about.
 *
 * Three things live here, and each one lives here because a second copy of it
 * drifts:
 *
 * 1. **The helpline list.** One structured list of the five approved services,
 *    in the clinical lead's order (two 24-hour lines first, 112 third, SNEHA
 *    fourth, iCall last because it is not a 24-hour service). The chat copy
 *    (`apps/api/src/pipeline/fallbacks.ts` -> `HELPLINE_BLOCK`), the portal's
 *    safety-plan editor and any screen that lists helplines read this list.
 *    Numbers are stored as dial strings (`tel:` form) plus a display string,
 *    so a screen never has to reformat one by hand.
 *
 * 2. **The demanding-worksheet gate.** "Above 5 out of 10" is the rule the
 *    owner approved, and it is enforced by the api. It is defined here so the
 *    number and the comparison cannot be restated differently in a second
 *    place: a gate that reads a 1-5 value as if it were 0-10 opens a
 *    demanding worksheet to someone who said 8.
 *
 * 3. **The privacy line.** One approved sentence, used on the journal, on
 *    worksheets, on the Treasure Box and on the privacy page. It replaced a
 *    line that said OKUVU does not read what a client writes, which became
 *    false the moment the safety pass landed.
 *
 * Nothing clinical is composed here: every string is the owner's, verbatim.
 */

export interface Helpline {
  /** Stable key — never rendered, used for tests and analytics. */
  key: string
  name: string
  /** The clinical lead's parenthetical, verbatim. */
  description: string
  /** Dial string for `tel:` / `wa.me`. Digits and a leading + only. */
  phone: string
  /** What the screen shows. */
  display: string
}

/**
 * The five approved services. Order is a clinical decision, not alphabetical.
 * NIMHANS (080-46110007) and the 1860-2662-345 Vandrevala line were retired by
 * clinical decision on 1 November 2026 and must not reappear.
 */
export const HELPLINES: readonly Helpline[] = [
  {
    key: 'tele_manas',
    name: 'Tele-MANAS',
    description: 'free, 24 hours',
    phone: '14416',
    display: '14416',
  },
  {
    key: 'vandrevala',
    name: 'Vandrevala Foundation',
    description: '24 hours, call or WhatsApp',
    phone: '+91' + '9999' + '666' + '555',
    display: '+91 9999 666 555',
  },
  {
    key: 'emergency',
    name: 'Emergency services',
    description: 'Ambulance, police and fire.',
    phone: '112',
    display: '112',
  },
  {
    key: 'sneha',
    name: 'SNEHA, Chennai',
    description: '10am-10pm, every day',
    phone: '044' + '2464' + '0050',
    display: '044-24640050',
  },
  {
    key: 'icall',
    name: 'iCall (TISS)',
    description: 'Monday to Saturday, 10am-8pm',
    phone: '9152' + '9878' + '21',
    display: '9152987821',
  },
] as const

/** The client's safety plan, as the catalogue knows it. */
export const SAFETY_PLAN_TOOL_ID = 'ws_safety_plan'

/** Owner's question, shown before a demanding worksheet opens. */
export const DEMANDING_GATE_QUESTION = "How strong is what you're feeling right now?"

/** Owner's copy, shown instead of the worksheet when the gate closes. */
export const DEMANDING_GATE_MESSAGE =
  'It sounds like a lot is going on right now. This one works best when things feel a bit steadier. Want to try something calming first? You can come back to it anytime.'

export const DEMANDING_GATE_BUTTONS = {
  grounding: 'Try grounding',
  later: 'Maybe later',
} as const

/** The rated scale the gate reads. Worksheets are 0-10; the mood check-in is not. */
export const DEMANDING_GATE_MIN = 0
export const DEMANDING_GATE_MAX = 10
export const DEMANDING_GATE_THRESHOLD = 5

/** The exercise the blocked card offers. */
export const GROUNDING_TOOL_ID = 'grounding_5431'

/**
 * The approved privacy sentence. Used verbatim on the journal, on worksheets,
 * on the Treasure Box and on the privacy page. It is a promise about what the
 * product does, so it is read by the surfaces that make the promise and by the
 * test that pins it to the approved document.
 */
export const PRIVACY_LINE =
  "Your therapist can't read this unless you choose to share it. If OKUVU's safety system notices you may be in danger, it will show you help straight away and let your therapist know you may need support, without sharing what you wrote."

/**
 * When the safety check cannot run.
 *
 * Owner's rule (9 Nov 2026, replacing the Step 4 fallthrough): a failed or slow
 * check is **moderate concern** — never safe, never crisis. Firing the crisis
 * card on every classifier outage floods therapists with false alarms, and an
 * alert they learn to ignore is worse than no alert.
 *
 * So a degraded check does three things and no more:
 *
 *  1. The deterministic crisis floor still runs first, and a hit there is a full
 *     crisis (card, flag, alert) exactly as before. Only silence falls through.
 *  2. Silence shows the client this line, as an offer rather than an assertion:
 *     help is reachable, nothing is being claimed about them.
 *  3. The write is queued for a recheck. If the recheck later finds risk, the
 *     therapist is alerted then — not on the outage.
 *
 * The line is the owner's phrase; the button is the approved help button from
 * the crisis copy ("tap Get help").
 */
export const SAFETY_CHECK_UNAVAILABLE_LINE = 'Help is here if you need it.'
export const SAFETY_CHECK_UNAVAILABLE_BUTTON = 'Get help'

/**
 * The level a degraded check is recorded at: S2, the moderate one. It is not a
 * flag level (S3/S4 are), so no alert email and no Safety-card row.
 */
export const SAFETY_CHECK_DEGRADED_LEVEL = 'S2' as const

/**
 * Levels at which a client is treated as being in a crisis state.
 *
 * S3 is the grounding card, S4 the crisis card; both carry the helplines. A
 * demanding worksheet is not opened at either — cognitive work at that level is
 * the wrong ask — and both raise the help card on a non-chat write.
 */
export const CRISIS_LEVELS: readonly ('S3' | 'S4')[] = ['S3', 'S4']

export function isCrisisLevel(level: string | null | undefined): boolean {
  return level === 'S3' || level === 'S4'
}

/**
 * Does the demanding-worksheet gate close?
 *
 * Closes when the client is in a crisis state, when the rating was not given
 * (the question is the gate — no answer, no entry), or when the rating is above
 * the threshold. Fails closed on a value it cannot read: a NaN or an
 * out-of-range number is not a low rating.
 */
export function demandingGateBlocks(
  feelingNow: number | null | undefined,
  currentSafetyState: string | null | undefined,
): boolean {
  if (isCrisisLevel(currentSafetyState)) return true
  if (typeof feelingNow !== 'number' || !Number.isFinite(feelingNow)) return true
  if (
    !Number.isInteger(feelingNow) ||
    feelingNow < DEMANDING_GATE_MIN ||
    feelingNow > DEMANDING_GATE_MAX
  ) {
    return true
  }
  return feelingNow > DEMANDING_GATE_THRESHOLD
}
