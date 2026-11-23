/**
 * The therapist-only guide shown on the Goals tab.
 *
 * Deliberately procedural: it says how the tool behaves and what a goal is not,
 * and it makes no clinical prescription — what a client should be working on is
 * the therapist's judgement, not this page's. Kept in one constant so replacing
 * the wording is one edit and the approval record has a single place to point
 * at.
 *
 * STATUS: draft v0.1, written by product, awaiting approval by the clinical
 * authority (Dr Shubhangi Goswami). The portal renders the status line above the
 * text so nobody mistakes the draft for signed copy.
 */
export const GOAL_GUIDE_STATUS = 'Draft v0.1 — awaiting clinical approval';

export interface GoalGuideSection {
  heading: string;
  body: string;
}

export const GOAL_GUIDE: GoalGuideSection[] = [
  {
    heading: 'One at a time',
    body:
      'The active goal at the top of this list is the one you and your client are working on now. ' +
      'Everything under it waits its turn. When that goal is achieved, dropped or has stalled, ' +
      'mark it and the next one becomes the focus by itself — or use "Make focus" to bring a ' +
      'different one up.',
  },
  {
    heading: 'Short enough to hold',
    body:
      'One sentence, about something that can be noticed within a week. ' +
      '"Say no to one extra shift a week" is a goal; "be less anxious" is a hope. ' +
      'If it needs two sentences, it is probably two goals.',
  },
  {
    heading: 'Written so the client could read it',
    body:
      'Write the goal in words you would be willing to read aloud to your client. ' +
      'No clinical shorthand, no diagnosis words and no notes-to-self in this field — ' +
      'it is a target, and a goal should survive being seen.',
  },
  {
    heading: 'A goal is not a session note',
    body:
      'Observations, formulation and what happened in the hour belong in Notes. ' +
      'This field holds only the target you both agreed on, which is why it is short enough ' +
      'to point an assignment at.',
  },
  {
    heading: 'A goal is not a safety plan',
    body:
      'Risk information belongs in the Safety plan, where the system watches for it. ' +
      'A goal never triggers an alert and nobody is notified when you edit one.',
  },
  {
    heading: 'Review it every session',
    body:
      'Open this tab at the start or end of each session: is this still the right target, ' +
      'has it been reached, should it be dropped? A list that never changes is a list nobody ' +
      'is working from.',
  },
];
