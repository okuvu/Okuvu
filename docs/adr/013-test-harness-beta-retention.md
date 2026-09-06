# ADR-013: Test Harness Beta Data Retention Policy

**Status:** Accepted
**Date:** 2026-08-19
**Driver:** TH-S01 — Test Harness Implementation Plan §12 Open Question 4

---

## Context

The Test Harness beta environment will process real-origin user data (S3/S4 capture verification, real therapy sessions used for validation). DPDP 2026 compliance requires a defined retention period for personal data. The ethics committee needs documented data retention and deletion policies before beta data collection begins.

Options considered:

1. **90-day default retention** — configurable via `BETA_RETENTION_DAYS` env var, with automated cleanup job.
2. **No retention limit** — keep beta data indefinitely for longitudinal analysis.
3. **30-day retention** — aggressive deletion to minimize DPDP exposure.

## Decision

90-day default retention for beta environment data, configurable via `BETA_RETENTION_DAYS` env var.

- Default: 90 days (configurable per-deployment).
- Cleanup job runs in `apps/worker/src/routes/beta-retention.ts` (mirroring `cleanup.ts` structure).
- Dry-run mode (`DRY_RUN=true`) available for ethics committee review before enabling deletion.
- Retention policy documented in `docs/test-harness/ethics-review-prep.md` for the ethics committee.
- All beta `TestRun`, `CorpusCase`, `BlindedReviewItem`, and `ReviewRating` rows older than `BETA_RETENTION_DAYS` are eligible for deletion/depersonalization.

## Alternatives Considered

### No retention limit
- Beta data could accumulate indefinitely, increasing DPDP compliance burden.
- Reject: DPDP 2026 requires justification for retaining personal data beyond its purpose.

### 30-day retention
- Too aggressive for beta validation — results from beta testing may need to be re-examined weeks later.
- Reject: 90 days provides sufficient window for ethics committee review and longitudinal analysis.

## Consequences

**Positive:**
- Clear, documented retention policy satisfies DPDP 2026 requirements.
- `BETA_RETENTION_DAYS` env var allows per-deployment tuning without code changes.
- Dry-run mode lets the ethics committee verify deletion scope before enabling.
- Cleanup job is idempotent and safe to run repeatedly.

**Negative:**
- 90-day window means beta data from early testing persists for 3 months — acceptable given the controlled access model.
- Automated deletion requires the cleanup job to run regularly — needs scheduling (Cloud Scheduler or similar).

**Risks:**
- Retention job could accidentally delete production data if environment filtering is broken — mitigated by the job being scoped to `environment = 'beta'` and by the isolation mechanism in TH-S31.
- Ethics committee may require a different retention period — configurable via env var without code changes.
