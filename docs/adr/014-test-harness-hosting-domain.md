# ADR-014: Test Harness Hosting Domain

**Status:** Accepted
**Date:** 2026-08-19
**Driver:** TH-S01 — Test Harness Implementation Plan §12 Open Question 5

---

## Context

The Test Harness needs a dedicated hosting domain to separate it from production user-facing services. The domain must be accessible to PI, raters, and engineers while being clearly distinct from `evia.ai` (the patient-facing domain) to avoid accidental exposure of internal test infrastructure.

Options considered:

1. **`test-harness.evia.ai`** — subdomain of the existing domain.
2. **`harness.okuvu.in`** — subdomain of the rebranded domain (post-migration).
3. **`evia-test-harness.web.app`** — Firebase Hosting default subdomain.

## Decision

Use `test-harness.evia.ai`.

This subdomain clearly communicates that the service is the internal test harness, is distinct from the patient-facing `evia.ai`, and lives under the existing `evia.ai` domain (which is already configured for Firebase/GCP).

## Alternatives Considered

### `harness.okuvu.in`
- Aligns with the okuvu rebrand (M6–M8 stories).
- But the rebrand is in-progress and may not be complete before the harness ships.
- The harness is internal-only and not patient-facing — rebranding is not urgent.
- Reject for now; revisit post-rebrand if the team wants consistency.

### `evia-test-harness.web.app`
- Firebase Hosting default domain — zero DNS configuration.
- Less professional for a tool used by PI and ethics committee.
- Reject: `test-harness.evia.ai` is more readable and trustworthy.

## Consequences

**Positive:**
- Clear, readable domain that immediately communicates the service's purpose.
- Lives under the existing `evia.ai` domain — no new DNS zone or SSL certificate needed.
- Distinct from patient-facing services — no risk of accidental user exposure.

**Negative:**
- Requires DNS CNAME record pointing `test-harness.evia.ai` to Firebase Hosting (or Cloud Run if SSR is needed).
- If the rebrand to okuvu completes, the domain may need to change to `test-harness.okuvu.in` — acceptable given the harness is internal-only.

**Risks:**
- DNS propagation delay on first setup — mitigated by the harness being deployable to `*.web.app` as a fallback during setup.
