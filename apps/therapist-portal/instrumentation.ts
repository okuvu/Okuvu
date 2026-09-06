/**
 * Production boot guard for LOCAL_DEV_BYPASS_AUTH (F-01).
 *
 * apps/api and apps/worker both refuse to boot if this flag is left "true"
 * under NODE_ENV=production (see apps/api/src/lib/check-production-bypass.ts)
 * — because that flag disables authentication (proxy.ts) and every
 * per-resource authorization check (server/trpc.ts, clients.ts, notes.ts)
 * at once. This app had no equivalent guard. Next.js runs `register()` here
 * once per server startup, in every environment (dev, `next start`, and
 * platforms like Vercel), before any request is served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  try {
    checkProductionBypass(process.env.NODE_ENV, process.env.LOCAL_DEV_BYPASS_AUTH);
  } catch (err) {
    // Next.js logs an instrumentation-hook error but does not exit the
    // process — it leaves the HTTP listener up, answering every request
    // with a 500 instead of actually refusing to boot (verified locally:
    // `next start` prints "Failed to prepare server" yet the port stays
    // open). That's fail-closed for data exposure, but it defeats the
    // point of a boot guard for deploy tooling that checks exit codes
    // (Vercel, Docker healthchecks, k8s) — mirror apps/api's explicit
    // process.exit(1) so a misconfigured deploy is unambiguously a failed
    // deploy, not a silently-broken one that looks "up".
    console.error('FATAL: ' + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

export function checkProductionBypass(
  nodeEnv: string | undefined,
  bypassFlag: string | undefined,
): void {
  if (nodeEnv === 'production' && bypassFlag === 'true') {
    throw new Error(
      'LOCAL_DEV_BYPASS_AUTH is set to "true" in NODE_ENV=production. ' +
        'This would leave the entire therapist portal unauthenticated and ' +
        'unauthorized. Refusing to start.',
    );
  }
}
