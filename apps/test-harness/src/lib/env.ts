import { z } from 'zod';

const envSchema = z.object({
  TEST_HARNESS_ENV: z.enum(['sandbox', 'staging', 'beta']).default('sandbox'),
  DATABASE_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  TEST_HARNESS_API_SANDBOX: z.string().url().optional(),
  TEST_HARNESS_API_STAGING: z.string().url().optional(),
  TEST_HARNESS_API_BETA: z.string().url().optional(),
  // TH-S09 — apps/worker base URL, used to invoke the combined A13
  // (summary) + A15 (memory) task at POST /tasks/summary. That route is
  // OIDC-protected, so calls from local/test environments without valid
  // credentials are expected to fail — handled gracefully in agent-adapter.ts.
  WORKER_URL: z.string().url().optional(),
  // TH-S17 — optional live Vertex AI pricing endpoint. When unset,
  // pricing-live.ts's fetchLivePricing() always returns null and callers
  // fall back to the static table in lib/pricing.ts (TH-S15).
  VERTEX_AI_PRICE_API_URL: z.string().url().optional(),
  // TH-S31 — beta environment data retention window, in days. Read by
  // apps/beta/page.tsx (display only) and by the worker's
  // POST /cleanup/beta-retention job (apps/worker/src/routes/beta-retention.ts,
  // which reads it directly from process.env rather than through this
  // schema, since it runs in apps/worker not apps/test-harness). Default
  // matches ADR-013's decision (docs/adr/013-test-harness-beta-retention.md).
  BETA_RETENTION_DAYS: z.string().regex(/^\d+$/).default('90'),
  // TH-S27 — GitHub Actions REST API credentials for the `ci` router
  // (getGateStatus/triggerRegression/getHaltFailures), wrapping
  // .github/workflows/regression.yml's run history. GITHUB_REPO is
  // "owner/repo" form. Both optional: this environment has no real GitHub
  // token configured, so the `ci` router's procedures are expected to
  // surface a catchable PRECONDITION_FAILED error rather than crash when
  // these are unset — see lib/github-actions.ts.
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  // Audit-bot API bypass (server/trpc.ts's auditBypassSession) — unset by
  // default (bypass fully disabled). When set, a request carrying a
  // matching `x-audit-token` header authenticates as a PI-role session
  // with no Google OAuth. Rotate/unset when the audit is done.
  AUDIT_BYPASS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  _env = envSchema.parse(process.env);
  return _env;
}
