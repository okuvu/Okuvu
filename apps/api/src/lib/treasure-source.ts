/**
 * Where a Treasure Box note came from, in the owner's five labels.
 *
 * Resolved on the server so the app never composes a provenance line, and so an
 * unknown stored value cannot reach a screen as raw enum text. Kept out of the
 * route files because the readable export needs the same labels.
 */
export const TREASURE_SOURCE_LABELS: Record<string, string> = {
  self: 'Me',
  therapist: 'My therapist',
  worksheet: 'From a worksheet',
  journal: 'From my journal',
  chat: 'From OKUVU chat',
};

export function sourceLabel(source: string | null | undefined): string {
  return TREASURE_SOURCE_LABELS[source ?? 'self'] ?? TREASURE_SOURCE_LABELS.self;
}
