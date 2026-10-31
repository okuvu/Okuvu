/**
 * Which hostnames are the *app*, not the brochure.
 *
 * Before the landing page existed, `/` redirected to `/dashboard` everywhere,
 * so `portal.okuvu.in` was how a therapist reached their caseload and a
 * bookmark to it kept working. Publishing the landing page at `/` silently
 * changed that: a therapist typing their usual address would land on marketing
 * copy and have to click through.
 *
 * The apex and `www` carry the landing page. The `portal.` subdomain keeps its
 * old behaviour and continues straight into the app — which is also why a
 * signed-out visitor there still ends up on /auth rather than being sold to.
 *
 * Kept as a pure function so it can be tested without a Request. The host
 * header is attacker-controlled, which is tolerable here only because the
 * decision gates a *relative* redirect to /dashboard: a spoofed Host can make
 * the visitor see the app instead of the landing page, and nothing more. It
 * must never be used to build an absolute URL.
 */
export function isPortalEntryHost(host: string | null | undefined): boolean {
  if (!host) return false;
  // Strip the port without trusting URL parsing on a bare host value.
  const hostname = host.split(':')[0].toLowerCase();
  return hostname.startsWith('portal.');
}
