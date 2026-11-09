/**
 * Privacy and sharing — the vocabulary the api, the portal and the app must
 * agree about.
 *
 * One item, one share. The owner's rule (Step 6, 9 Nov 2026) is that every
 * entry and note starts Private and is shared only when the client says so,
 * item by item, with its own revoke. This module holds the three things a
 * second copy of which always drifts: the label pair, the two confirmation
 * sentences, and the set of surfaces that can be shared.
 *
 * Nothing here is composed: every string is the owner's approved copy from
 * `docs/exercise-library/02-approved-worksheet-copy.md` (SHARED APP COPY).
 */

/** The label on every entry and note. Exactly two states, never a third. */
export const SHARE_LABEL_PRIVATE = 'Private'
export const SHARE_LABEL_SHARED = 'Shared with my therapist'

export function shareLabel(shared: boolean): string {
  return shared ? SHARE_LABEL_SHARED : SHARE_LABEL_PRIVATE
}

/** First time a client shares an entry or note. */
export const FIRST_SHARE_LINE =
  'Your therapist will be able to read this. You can stop sharing anytime.'
export const FIRST_SHARE_BUTTONS = { confirm: 'Share', cancel: 'Cancel' } as const

/** After finishing an assigned worksheet. Equal buttons, neither preselected. */
export const WORKSHEET_SHARE_PROMPT = 'Share this with your therapist?'
export const WORKSHEET_SHARE_BUTTONS = { share: 'Share', keepPrivate: 'Keep private' } as const

/** The fixed line in the Updates list, so "shared" is never read as "live". */
export const UPDATES_SHARED_LINE =
  'Your therapist reads shared entries before sessions, not in real time. If you need help right now, tap Get help.'

/**
 * What can be shared.
 *
 * The three surfaces that store client-authored free text. A safety plan is
 * not here: it is co-written in session and visible to the linked therapist by
 * construction, so a share switch on it would be a second, contradictory rule.
 */
export const SHAREABLE_KINDS = ['journal_entry', 'worksheet_response', 'treasure_note'] as const
export type ShareableKind = (typeof SHAREABLE_KINDS)[number]

export function isShareableKind(value: unknown): value is ShareableKind {
  return typeof value === 'string' && (SHAREABLE_KINDS as readonly string[]).includes(value)
}

/** What the api answers after a share or an unshare. */
export interface ShareState {
  kind: ShareableKind
  id: string
  shared: boolean
  /** ISO timestamp of the last share; null when never shared or after a stop. */
  sharedAt: string | null
  /** ISO timestamp of the last stop; null when never stopped. */
  unsharedAt: string | null
  /** The label the app renders, so the app never composes one. */
  label: string
}

/**
 * Does this item reach a therapist on a read?
 *
 * The single predicate every portal read must use: shared flag **and** the
 * read's own link check. Having it here means "shared" cannot be read as
 * "shared with anyone who was ever assigned".
 */
export function isVisibleToTherapist(sharedWithTherapist: boolean | null | undefined): boolean {
  return sharedWithTherapist === true
}

/** One row in "My toolkit": an exercise the client marked as helping. */
export interface ToolkitItem {
  toolId: string
  label: string
  summary: string | null
  /** How many times they marked it helpful. */
  timesHelpful: number
  lastHelpedAt: string
}

/** One row in "Past me": the client's own writing, in one timeline. */
export interface PastMeItem {
  kind: 'journal_entry' | 'worksheet_response'
  id: string
  /** ISO timestamp the entry was written / the worksheet finished. */
  at: string
  /** The exercise label for a worksheet; null for a journal entry. */
  toolId: string | null
  toolLabel: string | null
  /** The first line or two, for the timeline. */
  excerpt: string
  shared: boolean
  /** 0-10 before/after, worksheet only, when the client rated it. */
  feelingBefore: number | null
  feelingAfter: number | null
}

/** A filter chip on "Past me": every exercise the client has written in. */
export interface PastMeFilter {
  toolId: string | null
  label: string
  count: number
}
