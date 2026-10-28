# ADR-016 — Cut over from GCP/Firebase to AWS ap-south-1

**Date:** 27 October 2026
**Status:** ACCEPTED — implemented in code, verified by test suites, not yet deployed
**Supersedes:** ADR-001a ("GCP Only, No AWS") in `docs/adr/001-gcp-monorepo.md`
**Related:** `docs/AWS-CUTOVER-SPEC.md` (the implementation contract), `docs/AWS-MIGRATION-PLAN.md` (v3.0 delivery plan)

---

## Context

ADR-001a chose GCP for a single-DPA DPDP story. The business driver changed:
AWS credits are available and the company is standardising on AWS. The data
residency requirement did not change — all processing must stay in India —
which pins the region to `ap-south-1` (Mumbai) exactly as it pinned the old
stack to `asia-south1`.

The coupling to GCP was narrow but load-bearing: six call sites (LLM,
embeddings, queue, secrets, client identity, staff identity) plus the
infrastructure-as-code, the CI pipeline and the mobile SDKs.

## Decision

Cut over completely. No dual-cloud fallback, no provider switches left in the
code that could silently route clinical data to the wrong vendor. Specifically:

| Concern | Was | Now |
|---|---|---|
| LLM (A1, A2, A9-pre, A9-post) | Vertex AI `gemini-2.5-flash` / OpenRouter | Amazon Bedrock `amazon.nova-pro-v1:0` (OpenRouter kept only for load tests/comparison) |
| Embeddings | Vertex `text-embedding-004` (768) | Bedrock Titan Text Embeddings V2 (768) |
| Summary queue | Cloud Tasks | SQS + DLQ |
| Secrets | Secret Manager | Secrets Manager |
| Client identity | Firebase Auth (phone OTP) | Cognito user pool, phone + SMS OTP |
| Staff identity | Firebase Auth (Google OAuth) | Cognito user pool, email + password + TOTP, federated through NextAuth |
| Compute | Cloud Run | ECS Fargate behind an ALB |
| Database | Cloud SQL | RDS PostgreSQL |
| Cache | Memorystore | ElastiCache |
| Objects | Cloud Storage | S3 |
| CI/CD | Cloud Build | CodeBuild (`buildspec.yml`) |
| Observability | Cloud Logging/Monitoring | CloudWatch |

## Consequences

**Good.** One cloud, one DPA, one region. The retired switches
(`OKUVU_LLM_PROVIDER`, `OKUVU_QUEUE_PROVIDER`, `OKUVU_SECRETS_PROVIDER`) are
gone, so "which provider is live?" has exactly one answer per environment. The
API verifies Cognito tokens offline against the pool JWKS — no per-request
identity round-trip and no new npm dependency.

**Costs, stated plainly.**

1. **Android push would now be impossible without Google.** FCM is the only
   system-level push transport on Android. Nothing in the product uses push
   today (no messaging SDK, no device-token table), so the constraint is
   currently theoretical — but the moment push is built, an Android app cannot
   be 100% Google-free. SNS mobile push on Android still terminates at FCM.
2. **SMS OTP delivery to Indian numbers needs TRAI DLT registration.** Cognito
   sends through SNS. Until the sender/template is registered, codes will not
   arrive. This is an operational prerequisite, not a code change.
3. **Therapist accounts must be re-created in Cognito.** Firebase user records
   do not port; therapist emails are re-provisioned in the pool (see the
   portal's onboarding guide). Client `auth_subject` values keep their column
   and are re-linked on first Cognito sign-in.
4. **Bedrock quota is a real prerequisite.** Nova Pro needs an approved
   on-demand quota in the target account before staging traffic.
5. **Nova Pro is a different model from Gemini 2.5 Flash.** Prompts were tuned
   against Gemini; the pipeline's parsers are defensive (schema re-validation,
   fail-closed fallbacks), but output quality must be evaluated before pilot.

## Alternatives considered

- **Keep GCP for identity, AWS for compute.** Rejected: it preserves the exact
  cross-cloud coupling the migration exists to remove, and health data would
  still cross two DPAs.
- **Keep the provider seams and default them to AWS.** Rejected: a live switch
  that can point clinical prompts at a vendor the operator believes is off is
  a worse failure mode than a redeploy.
- **Amplify on the Flutter side for Cognito.** Rejected: `amplify_auth_cognito`
  pulls a large transitive dependency tree for four HTTP calls the app can make
  through its existing `dio` client, and it would have made the auth flow
  harder to unit-test.
