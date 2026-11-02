export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `\u2022\u2022\u2022 \u2022\u2022\u2022 ${digits.slice(-4)}`;
}

/**
 * Retired: `User #E7D8`.
 *
 * A generated id is not a name, and the redesign removes it from every
 * therapist surface — the therapist's own label (TherapistClient.client_label)
 * is the only identifier the portal shows.
 *
 * Sub-pages that have not been through the redesign yet (homework, reminders,
 * notes, report, tools, program) still call this helper; they get a neutral
 * word rather than an id until each page passes its real label from
 * clients.detail. Returning the label is each page's own change — this
 * function cannot fetch one.
 */
export function formatClientLabel(_id: string): string {
  return "Client";
}
