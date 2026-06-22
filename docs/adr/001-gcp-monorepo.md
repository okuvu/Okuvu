# ADR-001 — GCP Full Consolidation + npm Workspaces Monorepo

**Date:** June 2026
**Status:** ACCEPTED — implemented from Day 0, no migration cost
**Decided by:** Senior Engineer + Product Lead

---

## ADR-001a — GCP Only (No AWS)

### Decision

All infrastructure for Evia runs on Google Cloud Platform (GCP) asia-south1 (Mumbai). AWS is not used. This was decided before any code was written.

### Context

The LLM layer (Vertex AI / Gemini) was already committed to GCP. The original architecture used AWS for compute and database, which created:

- **Two separate DPAs** required for DPDP 2026 compliance (one for AWS compute/DB, one for GCP/Vertex AI for LLM inference)
- **Cross-cloud latency** on every LLM call (AWS ECS → GCP Vertex AI boundary added 20–80ms per turn; target is ≤3s p50)
- **Two cloud billing relationships** and two sets of cloud credentials to manage

### Decision

Consolidate everything to GCP before writing any code. Since no AWS infrastructure existed yet, migration cost was zero.

### Consequences

**Positive:**
- Single Google Cloud DPA covers compute (Cloud Run), database (Cloud SQL), storage (Cloud Storage), auth (Firebase), and LLM inference (Vertex AI) — major DPDP 2026 simplification
- Cloud Run → Vertex AI calls are GCP-internal, eliminating cross-cloud latency
- Firebase Authentication is purpose-built for Indian consumer apps (OTP on Indian phone numbers works well)
- Single cloud billing relationship

**Negative:**
- Single-vendor concentration risk — mitigated by the fact that Cloud Run containers are standard Docker and can be migrated to any cloud if needed; no GCP-proprietary application-level dependencies beyond service calls
- GCP Cloud Monitoring has different metric names and dashboard patterns than CloudWatch — team needs to learn this

**Rejected alternatives:**
- AWS + GCP split: rejected for the two-DPA and cross-cloud latency reasons above
- Azure: not considered (no existing vendor relationship, no Firebase equivalent for Indian OTP)

---

## ADR-001b — npm Workspaces Monorepo (Not Turborepo, Not Nx)

### Decision

The Evia codebase is a monorepo managed with plain npm workspaces. No build-system tooling (Turborepo, Nx, Lerna) is used.

### Context

The team considered three monorepo approaches:
1. **Polyrepo** — separate repositories per app
2. **npm workspaces** — single repo, npm manages dependencies across packages
3. **npm workspaces + Turborepo or Nx** — adds a build orchestration layer on top

### Decision

Plain npm workspaces. No Turborepo or Nx.

### Rationale

The primary reason to use a monorepo in this project is **shared types and shared Prisma schema** — when a backend type or schema field changes, the change needs to be visible to the therapist portal in the same PR. npm workspaces alone achieves this.

Turborepo and Nx are valuable at larger scales where:
- Build times are long enough that caching across tasks matters
- The dependency graph across packages is complex enough that incremental builds save meaningful time
- Multiple teams need to work on the same repo with clear ownership boundaries

None of these conditions apply to a 4-week build with a 10-person team. Adding Turborepo would add a configuration layer to learn, debug, and maintain for negligible benefit.

AI coding tools (Claude/Cursor) also work better with simpler, more conventional structures — a standard npm workspace is something they understand deeply; a Turborepo configuration with custom pipeline definitions is an additional abstraction layer that increases the chance of generated code missing the right build configuration.

### Consequences

**Positive:**
- Simpler `package.json` at root — just `"workspaces": ["apps/*", "packages/*"]`
- `npm install` at root installs everything — no build tool to configure
- AI coding tools work with familiar patterns
- Any future migration to Turborepo is straightforward if the team decides it's needed

**Negative:**
- No build cache across packages — `tsc` in `apps/api` doesn't benefit from a cached `packages/shared-types` build. Acceptable at this team size and build duration.
- No automatic task dependency ordering — the CI pipeline manually specifies build order

**Rejected alternatives:**
- Polyrepo: rejected because it would create cross-repo coordination overhead every time a schema type changes, and would fragment context for AI coding tools that work best with a single checkout
- Turborepo/Nx: rejected for the complexity-vs-benefit reason above; revisit at post-MVP scale if build times become an issue
