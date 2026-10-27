# Okuvu — AWS Migration and Android Release Plan

**Version 3.0 · 27 October 2026**
Supersedes the GCP-hosting assumption in the v2.0 delivery plan. Written after measuring the codebase, not before.

---

## 1. The decision, and what it actually costs

You want off GCP onto AWS, because the credits are there. That is a defensible business decision and this plan delivers it. But the honest shape of it is different from what "change the cloud provider" suggests, so it belongs at the top rather than in a footnote.

The application is not loosely coupled to GCP. Measured tonight: **120 files reference GCP or Firebase, zero reference AWS.** But the coupling is narrow, not deep — the actual cloud-specific code is **six call sites**:

| File | What it does |
|---|---|
| `apps/api/src/lib/vertex-ai.ts` | Gemini structured generation |
| `apps/worker/src/lib/vertex-ai.ts` | same, worker copy |
| `apps/api/src/lib/embedding.ts` + worker | Gemini embeddings |
| `apps/api/src/lib/summary-enqueue.ts` | Cloud Tasks HTTP dispatch with OIDC |
| `apps/api/src/crypto/emergency-contact-encryption.ts` | Secret Manager |
| `apps/api/src/lib/redis.ts`, `rate-limit.ts` | Memorystore (wire-compatible) |

Everything else — 44 Prisma models, the 15-agent pipeline, the therapist portal, the Flutter app — is portable. **Migration effort: 80–88 dev-days, of which about 45% sits in two rows: the AI inference layer and identity.** This is a 6–8 week programme with parallel agent streams, not a two-week switch, and not seven days.

What *is* achievable inside a week is the thing you actually need first: **a live AWS backend the Android app can point at**, so the Play Store clock can start.

---

## 2. What is already built and verified tonight

Not a plan on paper. This is committed and pushed as `d9fcfee` on `feat/aws-migration`.

| Artefact | Evidence |
|---|---|
| AWS Terraform, 16 files | `terraform validate` → Success. `fmt -check` → clean. 76 resource instances: VPC, RDS PG16, ElastiCache Valkey, S3, 3× KMS CMK, ECR, ECS Fargate (api + worker), ALB, SQS + DLQ, Secrets Manager, budget alarm |
| Provider seams in the app | `OKUVU_LLM_PROVIDER` (vertex\|bedrock), `OKUVU_QUEUE_PROVIDER` (cloudtasks\|sqs), `OKUVU_SECRETS_PROVIDER` (gcp\|aws). All default to current GCP behaviour, so nothing regresses |
| Bedrock client | `apps/api/src/lib/bedrock.ts` (18.5 KB) + worker copy — same interface as the Vertex client, schema-constrained generation mapped to forced tool use |
| SQS producer | `sqs-enqueue.ts`, same contract as Cloud Tasks dispatch, 3 retries with backoff |
| Secrets provider | Secrets Manager behind the existing encryption seam |
| IAM gap found and fixed on review | Terraform granted SQS and Secrets Manager but **not** `bedrock:InvokeModel` — both task roles now grant it |
| Android build fixes | `compileSdk 37` + `compileSdkMinor 0`, AGP 8.13.1, `targetSdk 36`, release signing wired, Gradle heap fixed (daemon OOM on this host) |

**Verified by running, not by reading:** API suite **1080 tests / 61 files, 0 failures** (was 999). Worker **81 / 7, 0 failures**. Therapist portal 86. Test harness 302. Terraform validates. TypeScript compiles clean.

The Android APK path was also proven end-to-end with a temporary placeholder Firebase config: **`app-prod-release.aab`, 60.7 MB, signed, exit 0.** That placeholder has been deleted and is not in the repo.

---

## 3. Three findings that change the shape of this migration

These came from checking AWS's own documentation rather than from memory, and each one changes a decision.

### 3.1 The AI layer is the risk. Not the database.

Every infrastructural port is cheap and boring: RDS at about $88/month, ElastiCache at $12–23, two Fargate services behind load balancers at $56–73, one KMS key at $1.

The AI layer is where the problem is. **Amazon Bedrock is available in ap-south-1, but no frontier Claude model sits on the in-region `bedrock-runtime` path.** On the Mumbai endpoint, Claude is either India-geo (Mumbai **and Hyderabad**) or Global. The only genuinely in-region Claude route is a newer `bedrock-mantle` endpoint which is **billed through AWS Marketplace — and promotional credits explicitly exclude Marketplace.** So the credits you are migrating for would not cover the model you would want to use.

What *is* in-region and credit-eligible: open-weight models — Qwen3 235B at $0.26/$1.04 per million tokens, Mistral Large 3 at $0.59/$1.76, Kimi K2.5 at $0.72/$3.60, GLM 5 at $1.20/$3.84, Gemma 3 4B at $0.05/$0.09. Titan Text Embeddings V2 at $0.024/M replaces Gemini embeddings cleanly.

Those models are decent. **They are not Gemini-class for structured clinical summarisation**, and a silent quality drop on the crisis-classification and summarisation prompts is a safety regression, not a cost optimisation. This must be measured, not assumed.

### 3.2 Firebase users cannot be moved to Cognito without forcing password resets

Cognito's import tool accepts BCRYPT, SCRYPT, ARGON2ID and PBKDF2_SHA256 in fixed string formats with no signer-key field. Firebase's modified scrypt depends on a per-project signer key plus a salt separator. The construction does not fit.

**Consequence: 100% of users must reset passwords.** Pre-launch with zero real users that is free. Post-launch it is a product event with churn attached. It is a decision, not an engineering detail — and it is why identity migration is sequenced last, not first.

### 3.3 Two services have no drop-in equivalent

- **Cloud Tasks with an OIDC-authenticated HTTP target has no AWS equivalent.** EventBridge Scheduler will not target non-AWS endpoints; Step Functions HTTP tasks authenticate by Basic, OAuth client-credentials or API key, never an OIDC ID token. The replacement is SQS plus a real consumer in the worker — which is why the worker story is the largest single item in Phase 1.
- **AWS App Runner is closed to new customers.** Anyone planning "Cloud Run → App Runner, one-to-one" is planning something that cannot be provisioned. ECS Fargate is the target, and the Terraform already reflects that.

---

## 4. The bridge that gets you off GCP without gambling on models

There is a way to leave GCP infrastructure entirely in about three weeks while deferring the model question to measurement. It works because **the LLM call today goes through an API-key path, not through GCP infrastructure.** The repo already supports a non-Vertex provider (`LLM_PROVIDER=openrouter|gemini`).

So:

- **Move compute, database, cache, storage, queue, secrets and encryption to AWS now.** These are the billable, residency-relevant, lock-in parts.
- **Keep the LLM call on an API key during the bridge** (OpenRouter or a Gemini API key). No GCP project, no GCP IAM, no GCP billing — just a vendor HTTPS call.
- **Move embeddings to Titan on Bedrock** (§3.1), because embedding quality risk is low and it is in-region and credit-eligible.
- **Run the Bedrock model comparison as a measured spike**, in parallel, with a clinical acceptance threshold. Migrate the model when it passes; not before.

That gives a two-track programme: Track A gets you hosted on AWS and unblocks the Play Store; Track B decides the model with evidence. Neither blocks the other.

---

## 5. Service mapping, verified

| GCP today | AWS target | In ap-south-1 | Effort (dev-days) | Risk |
|---|---|---|---|---|
| Vertex AI · Gemini structured JSON | Bedrock Converse + structured outputs; open-weight in-region, or Claude via mantle | Yes, with In-Region/Geo/Global caveats | 12–20 | **HIGH** |
| Vertex AI embeddings | Titan Text Embeddings V2 | Yes | 3–5 + full re-index | LOW |
| Firebase Auth (token verify) | Cognito user pools + `aws-jwt-verify` | Yes | 10–15 | **HIGH** |
| Firebase Cloud Messaging | Keep FCM (independent of auth) or SNS push | n/a | 0–3 | LOW |
| Cloud SQL for PostgreSQL 16 | RDS for PostgreSQL, `db.t4g.small` Multi-AZ + gp3 | Yes | 4–6 | LOW |
| Memorystore Redis | ElastiCache for Valkey, `cache.t4g.micro` | Yes | 2–3 | LOW |
| Cloud Run · api | ECS Fargate + ALB | Yes | 6–10 | MEDIUM |
| Cloud Run · worker | ECS Fargate consuming SQS | Yes | 5–8 | MEDIUM |
| Cloud Tasks (HTTP + OIDC) | SQS + worker consumer | Yes | 4–8 | **HIGH** |
| Secret Manager | Secrets Manager ($0.40/secret) + SSM for config | Yes | 1–2 | LOW |
| Cloud KMS (contact encryption) | KMS CMK + envelope encryption | Yes | 3–5 | MEDIUM |
| Cloud Build + Artifact Registry | CodeBuild + ECR, or GitHub Actions with OIDC | Yes | 3–5 | LOW |
| GCP DPA / asia-south1 residency | Region-scoped AWS resources + AWS DPA | ap-south-1 | 2–4 (legal) | MEDIUM |

---

## 6. Phases and stories

### Phase 1 — Substrate (34 dev-days) · Track A
| ID | Story | dd |
|---|---|---|
| A1 | AWS account baseline: IAM user/roles, MFA, budget alarm, credits confirmed | 1 |
| A2 | Apply Terraform beta stack (VPC, RDS, ElastiCache, S3, KMS, ECR, ECS, ALB, SQS) | 3 |
| A3 | Container builds + CI to ECR with GitHub Actions OIDC | 4 |
| A4 | Prisma migrate + seed against RDS | 2 |
| A5 | API on ECS Fargate behind ALB, `/health` green | 5 |
| A6 | Worker on ECS + **SQS consumer** replacing the OIDC HTTP endpoint | 7 |
| A7 | Redis cutover (config only — ElastiCache is wire-compatible) | 2 |
| A8 | Secrets Manager wiring + KMS envelope encryption for emergency contacts | 4 |
| A9 | S3 uploads adapter with presigned PUT + SSE-KMS | 4 |
| A10 | Observability: log groups, alarms, cost anomaly detection | 2 |

### Phase 2 — Embeddings (8 dev-days) · Track A
| ID | Story | dd |
|---|---|---|
| B1 | Titan V2 embeddings behind the existing interface | 3 |
| B2 | Full re-index of stored summaries (vectors are not comparable across models) | 5 |

### Phase 3 — Cutover (8 dev-days) · Track A
| ID | Story | dd |
|---|---|---|
| C1 | DNS + domain cutover with dual-run and rollback | 4 |
| C2 | Point the Android app at the new host; fix the dead URL and its test | 1 |
| C3 | DPDP/DPA documentation update | 2 (legal) |
| C4 | Decommission GCP resources | 2 |

**Track A total: 50 dev-days → AWS-hosted, Play Store unblocked, no model decision made yet.**

### Phase 4 — Inference (19 dev-days) · Track B
| ID | Story | dd |
|---|---|---|
| D1 | Eval harness: replay the 3 safety-critical prompts across candidates | 5 |
| D2 | Run comparison: Gemini baseline vs Mistral Large 3 / Qwen3 235B / Kimi K2.5 in-region vs Claude via mantle | 3 |
| D3 | **Clinical acceptance decision** — Shubhangi signs the quality bar | 2 (external) |
| D4 | Bedrock hardening: structured outputs, guardrails, `data_retention_mode: none` | 6 |
| D5 | Flip `OKUVU_LLM_PROVIDER=bedrock` in production | 3 |

### Phase 5 — Identity (19 dev-days) · Track B, only if you want off Google entirely
| ID | Story | dd |
|---|---|---|
| E1 | Cognito user pool + Terraform | 5 |
| E2 | Flutter auth migration | 6 |
| E3 | Portal NextAuth → Cognito | 5 |
| E4 | Forced password reset: comms and flow | 3 |

**Full programme: 88 dev-days.** Track A alone: 50.

---

## 7. Calendar and the critical path

| Date | Milestone |
|---|---|
| **28 Oct** | I have AWS credentials → Phase 1 begins. Terraform applies against your account |
| **~4 Nov** | RDS, ECS API and worker live; `/health` returns 200 on an AWS hostname |
| **~7 Nov** | **Staging URL live on AWS.** Android app can point at it. **Closed-test clock can start** |
| **~14 Nov** | Track A complete: S3, KMS, secrets, observability, worker consuming SQS |
| **~21 Nov** | Titan embeddings shipped, re-index complete |
| **~24 Nov earliest** | Play Console production access (see §10 — this is their clock, not ours) |
| **~5 Dec** | Track B decision made with evidence; Bedrock flip if it passes |
| **~mid Dec** | GCP decommissioned, if identity migrated too |

**The critical path is not engineering. It is Google's 14-day testing clock and your AWS credentials.** One of those I can compress. The other I cannot.

---

## 8. Cost on AWS (ap-south-1, verified pricing)

| Item | Monthly |
|---|---|
| RDS PostgreSQL `db.t4g.small` Multi-AZ, 100 GB gp3 | ~$88 |
| ElastiCache Valkey `cache.t4g.micro` × 2 | ~$12–23 |
| ECS Fargate, 2 services + 2 ALBs | ~$56–73 |
| Secrets Manager, ~10 secrets | ~$4 |
| KMS CMK × 3 | ~$3 |
| S3 + CloudWatch + SQS | ~$10–20 |
| **Infrastructure subtotal** | **~$175–210/month** |
| Inference (in-region open-weight, light beta volume) | ~$20–60 |
| Inference (Claude via mantle) | Marketplace rates, **not credit-eligible** |

Your credits cover the infrastructure line comfortably for a beta. They do **not** cover Claude on Bedrock. That asymmetry is the single most important commercial fact in this document.

---

## 9. Inputs and dependencies — what I need, and from whom

Ordered by what blocks first. Nothing in Phase 1 starts without item 1.

### From you — blocking
1. **AWS account access.** An IAM user with programmatic credentials (access key + secret) and MFA, or an SSO profile I can assume. Needs permissions to create VPC, RDS, ECS, ECR, S3, KMS, SQS, IAM, Secrets Manager, CloudWatch, Budgets. Without this, `terraform apply` cannot run — it has been validated but never applied.
2. **Confirmation of the credits**, in writing: which programme (AWS Activate?), the amount, and its expiry. This determines whether Multi-AZ RDS and a NAT gateway are affordable from day one or whether the stack starts cheaper.
3. **Google Play Console account** — created, identity-verified, payment profile complete. And one line: **personal or organisation?** Personal means the 12-tester / 14-day clock applies. Organisation does not.
4. **`google-services.json`** from the production Firebase project. Gitignored by design, so it is not in the repo, and its own example file says "get the real file from the Senior Engineer". **This single file is what currently blocks the AAB build.**
5. **12+ tester Gmail addresses** for closed testing. Real people, opted in continuously for 14 days.
6. **Upload keystore custody decision.** I generated a placeholder key so the signing path could be proven. Before the first upload you must regenerate it with your own password and store it offline — losing an upload key costs a support ticket to Google; losing a signing key without Play App Signing costs the listing.
7. **A live privacy policy URL** on your own domain. The current value in the app config is a Google Docs publish link, which is not acceptable for a Play listing.
8. **Domain/DNS access** for `okuvu.in` at Spaceship, for the cutover.

### From Dr Shubhangi Goswami — blocking Track B only
9. **The model acceptance bar** in writing: what quality threshold the safety-critical prompts must clear before an in-region open-weight model may replace Gemini. Without a signed threshold, D2 has no pass/fail criterion and the migration stalls at the last gate.
10. **Sign-off on the crisis copy and helpline numbers**, still outstanding from the clinical packet. This gates what the app may display in the store listing and in the crisis overlay.

### From you — needed later, not blocking week 1
11. **LLM vendor choice for the bridge**: OpenRouter key or Gemini API key. One of them must exist before the app can serve a real turn on AWS.
12. **Residency tolerance, in writing.** If Claude is required, inference becomes India-geo (Mumbai + Hyderabad) rather than Mumbai-only. Defensible under DPDP as "India"; indefensible against the README's "asia-south1 only" claim. Choose explicitly.
13. **Invite-email sender** (SES or Brevo) so the API can send therapist invites.
14. **Voice vendor** (Sarvam key) if A13 voice ships in this release — otherwise it stays unavailable, as it is today.

---

## 10. Play Store: it is an AAB, not an APK

One correction to the brief. **Google Play has not accepted a plain APK for new apps since August 2021.** New apps publish an Android App Bundle (`.aab`), and you must be enrolled in Play App Signing. An APK is for direct install and internal testing only — useful for giving someone a file to sideload, not for the store.

Verified today, from Google's own documentation:

- **AAB required** for new apps; APK uploads survive only for legacy apps created before August 2021.
- **Target API 36 (Android 16) is mandatory for new apps and updates from 31 August 2026.** The repo now pins `targetSdk 36` — it was below the requirement.
- **Personal accounts created after 13 Nov 2023: 12 testers opted in continuously for 14 days** before you may apply for production. Opting out mid-way resets the clock; the 14 days must be consecutive; 12 must still be opted in at the moment you apply. Organisation accounts skip this.
- **Before review you need**: privacy policy URL, Data safety form, content rating questionnaire, app-access instructions, ads declaration, target audience, 512² icon, 1024×500 feature graphic, at least 2 screenshots.

### The three things standing between the repo and an uploaded AAB

1. **`google-services.json` is missing.** Build fails with `File google-services.json is missing`. Everything else works — proven by building a signed 60.7 MB AAB with a temporary placeholder.
2. **The production backend URL in the app is dead.** `backend-971397352159.asia-south1.run.app` returns 404 on `/health`, `/v1/health`, `/api/health` and `/ws`. Two Flutter tests fail because the test expects a *third*, older host. Shipping as-is points users at nothing. Phase C2 fixes this, and it is one of the reasons AWS staging must land first.
3. **No real upload key**, and `--dart-define=FLAVOR=prod` is required at build time or the app throws `FlavorNotSpecifiedException` at launch — a trap that would have shipped a crashing app.

---

## 11. Risks and kill criteria

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | No AWS credentials → nothing can be applied | High | Blocks everything | Terraform is written and validated; needs only credentials |
| R2 | In-region models fail the clinical bar and Claude is Marketplace-billed | Medium | The credits argument collapses for the biggest cost line | Bridge keeps the LLM on an API key; decide with data in D2/D3 |
| R3 | Residency claim weakens to India-geo if Claude is used | Medium | DPDP position changes | Written residency decision (§9.12) before any flip |
| R4 | 14-day Play clock means store release cannot be pulled forward | Certain | ~4 weeks minimum | Start the clock the day staging is live |
| R5 | Forced password resets if Cognito migration happens post-launch | Certain if deferred | Churn | Do identity migration before public launch, or never |
| R6 | Model-quality regression is invisible because recall is unmeasured | High | Safety | D1/D2 require an eval set; this is the same gap flagged in the agent evaluation |

**Kill criteria.** Stop the migration and revert to GCP if: AWS credits turn out to exclude Bedrock inference *and* in-region open-weight models fail the clinical bar *and* you decline Marketplace billing. In that case the credits buy you infrastructure you do not need while the model — the thing that costs money at scale — stays outside them.

---

## 12. What this plan does not claim

- **Nothing has been deployed.** The Terraform validates; it has never been applied, because there are no AWS credentials on the build host.
- **No Bedrock call has ever succeeded against a live endpoint.** The client is written and its tests mock the SDK; a real call without credentials fails closed with a fallback, which is the correct behaviour but is not a demonstration.
- **The migration is not seven days.** Track A is 50 dev-days; the full programme is 88. The seven-day build plan is superseded by this document.
- **The Android app has never run against a live backend**, because the configured backend is dead. 209 Flutter tests pass; 2 fail on that stale URL.
- **Classifier recall is still unmeasured**, in both codebases. Adding agents and moving clouds does not make the pipeline safer; only measurement does.

---

*Prepared 27 October 2026. Every figure in this document was produced by running something today: `terraform validate`, the four test suites, a signed AAB build, HTTP probes against the production host, and AWS documentation pages cited in `GCP-to-AWS-mapping-ap-south-1.md`.*
