export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `\u2022\u2022\u2022 \u2022\u2022\u2022 ${digits.slice(-4)}`;
}

/**
 * `formatClientLabel` used to live here and returned the word "Client".
 *
 * It took a user id and had no data, so every client heading and breadcrumb in
 * the portal read "Dashboard / Client / Notes". Names come from the router now:
 * `clients.list`/`clients.detail` for pages that already fetch a client, and
 * `clients.header` via `components/useClientHeader` for the rest. Do not
 * reintroduce a formatter that cannot see the row.
 */
