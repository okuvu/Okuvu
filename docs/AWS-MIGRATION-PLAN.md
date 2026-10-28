# Okuvu — AWS Migration and Android Release Plan

**Version 3.0 · 27 October 2026**
> **STATUS — 27 Oct 2026, later the same day: Track A is done in code, not just scaffolded.**
> The provider seams described in §2 (`OKUVU_LLM_PROVIDER`, `OKUVU_QUEUE_PROVIDER`,
> `OKUVU_SECRETS_PROVIDER`) have been **collapsed to single AWS implementations** and the
> GCP branches deleted — see `docs/AWS-CUTOVER-SPEC.md` and ADR-016. Identity moved from
> Firebase to two Cognito pools (`infrastructure/aws/evia-beta/cognito.tf`), the mobile app
> talks to Cognito over plain HTTPS, the portal uses NextAuth's Cognito provider, and the
> `firebase_uid` column is now `auth_subject`. Cloud Build became `buildspec.yml`.
> Verified: api 1135 tests, worker 90, portal 91 (+`next build`), test-harness 302,
> Flutter 231 + clean `flutter analyze`, `terraform validate` Success.
> Still outside code (unchanged by the cutover): TRAI DLT registration for SMS,
> Cognito therapist provisioning, Bedrock quota in the target account, and the
> DPDP review of the AWS DPA.


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

### 3.1 The AI layer, revised: Qwen3 32B is in-region, credit-eligible and measured

**Superseded 28 Oct 2026** (DeepSeek V3.2, 27 Oct). Two things moved the decision. First, **forced strict tool use works on Qwen3 32B**, so `bedrock.ts` constrains schema exactly as it does today — DeepSeek would have forced a rewrite of the JSON mechanism *on the safety path*. Second, the A1/A9-post case set has now been run **against the live in-region endpoint** and came back clean (§3.1.1). The original version of this section assumed a Claude- or Gemini-class model was required; that premise is long gone.

Verified against the Bedrock region-compatibility matrix, the AWS Price List API (`AmazonBedrock`, ap-south-1, publication date **2026-10-28T03:41:18Z**), `bedrock list-foundation-models` and a live `converse` call from account 562654496378:

| Model | In-Region `bedrock-runtime` | In-Region `bedrock-mantle` | Context / max output | Mumbai price (per 1M tokens) |
|---|---|---|---|---|
| **Qwen3 32B** (`qwen.qwen3-32b-v1:0`) | **Yes** | **Yes** | 32K / 8K | **$0.18 in · $0.71 out** |
| Qwen3 Next 80B A3B (`qwen.qwen3-next-80b-a3b`) | Yes | Yes | — | $0.17 in · $1.44 out |
| Qwen3 235B A22B 2507 (`qwen.qwen3-235b-a22b-2507-v1:0`) | Yes | Yes | — | $0.26 in · $1.04 out |
| Qwen3 Coder 480B A35B / 30B A3B, Qwen3 VL 235B | Yes | Yes | — | coder / vision SKUs, wrong shape for clinical classification |

Geo and Global inference profiles are *not* offered for any Qwen3 model here, which is the good outcome: there is no cross-region path to accidentally use, so traffic cannot silently leave India.

Service tiers, same region: **flex and batch are 50% of standard**, **priority is 1.75×**. Standard is the default and what the figures below assume.

**The trap in this swap, recorded so it is not re-learned.** The arm that scored perfectly on OpenRouter was `qwen/qwen3.5-9b` — a 9B model that **does not exist on Bedrock**. Mumbai's smallest Qwen3 is 32B. So the OpenRouter result is evidence about a model we cannot buy, and the SKU that ships here had to be measured separately. It was (§3.1.1).

**Credit eligibility — the decisive point.** Qwen rows sit in `AmazonBedrock/ap-south-1/index.csv` with `serviceCode: AmazonBedrock` and `serviceName: Amazon Bedrock`, alongside Mistral, OpenAI, Moonshot, Google and xAI. Anthropic Claude has **zero** rows in that file. That distinction is the whole answer:

- Qwen is an ordinary AWS service charge, so promotional credit applies to it like RDS or Fargate, subject only to the credit's own "Applicable products" list.
- Claude is Marketplace-billed, and the AWS Promotional Credit Terms (last updated 24 Sep 2026) put AWS Marketplace among the Ineligible Services "unless authorized by us."

**Correction to what this document previously said.** It claimed credits could never cover Claude. That was too strong. **AWS Activate** terms (last updated 22 Jan 2026) explicitly authorise promotional credit against "fees and charges for AWS Marketplace incurred for the use of third-party foundation models available on Amazon Bedrock" — Bedrock 3P Model Spend. So if these credits are Activate credits, they would have covered Claude too. If they are ordinary promotional credits, they would not. Qwen is covered under *either* reading, which is precisely why it removes the risk instead of shifting it.

The remaining check is administrative, not technical: the **Credits** page in the AWS Billing console shows each credit's Credit type, Expiration date and Applicable products. That page decides it in writing.

### 3.1.1 What it measured, on the endpoint that will serve it

The 31-case set (16 A1 intake classifications + 15 A9-post reply reviews, ground truth quoted from the rubric inside the prompt) was run against `qwen.qwen3-32b-v1:0` in ap-south-1 through **Converse with a forced strict tool use** — the same mechanism `bedrock.ts` uses, so the harness measured the production call shape rather than a lookalike.

| Run | A1 exact | A1 dangerous under-escalations | A1 over-escalations | A9-post correct | A9 dangerous approvals | A9 fail-closed |
|---|---|---|---|---|---|---|
| 1 | 16/16 | 0 | 0 | 15/15 | 0 | 0 |
| 2 | 16/16 | 0 | 0 | 15/15 | 0 | 0 |
| 3 | 16/16 | 0 | 0 | 15/15 | 0 | 0 |

Every one of the 93 calls came back `stopReason: tool_use`, never `length` — i.e. the 2048-token cap was never consumed by a hidden thinking trace. Schema-valid rate was 16/16 in all runs because the tool schema constrains it, not because the model was asked nicely. Latency: 280 ms per Converse call as reported by Bedrock (`metrics.latencyMs`); 1.78 s median end-to-end in the harness, which includes an AWS CLI process spawn per call.

This is the same result the OpenRouter 9B arm produced on the same answer key — with the difference that this SKU exists in Mumbai and can be bought.

**What it does not prove.** 31 cases with three Indian-language items shows feasibility, not clinical readiness: the set has to widen to ~60 weighted to Hinglish/Devanagari before a clinician reads it, and A2 (the live conversational turn) is not in this set at all. Both leaders are level on 30 of 31 cases, so "Qwen beats DeepSeek" is not a claim this evidence supports — the claim it supports is "Qwen3 32B is not worse than the bar we already accepted, and it needs no code change to serve."

### 3.1.2 What Qwen3 32B costs at Okuvu's shape

Modelled per client turn as four model calls — A1 classify, A2 converse, A9 pre-gate, A9-post review — at roughly 7,700 input and 1,250 output tokens:

| Volume (turns/month) | Model cost | + infra ~$200 | Total | $5,000 of credits lasts |
|---|---|---|---|---|
| 5,000 | $11 | $211 | $211 | 23.7 months |
| 10,000 | $23 | $223 | $223 | 22.4 months |
| 25,000 | $57 | $257 | $257 | 19.5 months |
| 50,000 | $114 | $314 | $314 | 15.9 months |
| 100,000 | $227 | $427 | $427 | 11.7 months |
| 250,000 | $568 | $768 | $768 | 6.5 months |

Cost per turn at standard tier is **$0.00227** — 3.7× cheaper than DeepSeek V3.2, and ~26× cheaper than Nova Pro, which was the previous default. The crisis path stays on standard or priority; A10 insights, A11 learning and session summarisation can run on batch/flex at half price because nothing waits on them.

Consequence for the programme: **the model line does not sit outside the credits**, so the two-track split in §4 is not a cost necessity. Track B's model comparison survives only as a quality gate, not as a vendor decision.

### 3.1.3 Three engineering constraints that come with Qwen3 32B

1. **Forced tool use is the schema mechanism, and it works — no code change.** Qwen3 32B lists both *client-side tool calling* and *structured outputs* as supported on `bedrock-runtime`, and a live `converse` call with `toolSpec.strict: true` returned a conforming tool input on all 93 calls of the three runs above. This is the constraint DeepSeek would have broken (tool calling only on `bedrock-mantle`), and the reason the swap is a config change rather than a safety-path rewrite.
2. **Thinking is off by default — do not turn it on casually.** On Converse this model spends nothing on a reasoning trace unless asked. If a future prompt does enable reasoning, it must get its own token budget: with the production 2048-token cap, a thinking model can burn the whole budget before emitting JSON, return `finish_reason: length`, and be failed closed to S2 by the validator — which is exactly how `qwen3.5-9b` silently downgraded four suicide-risk messages to moderate in the OpenRouter eval.
3. **32K context / 8K max output.** The A1 system prompt plus conversation history must stay under 32K tokens; only three models in this family reach 164K-class context and none of them are the cheap one. Production `max_tokens` of 2048 is far inside the 8K output limit.

Qwen has **no embedding model**, so Titan Text Embeddings V2 at 768 dimensions remains the embedding target, unchanged.

### 3.1.4 Code state

Done on 28 Oct 2026, on `feat/aws-migration`: `DEFAULT_BEDROCK_MODEL_ID = 'qwen.qwen3-32b-v1:0'` in both `apps/api/src/lib/provider-config.ts` and `apps/worker/src/lib/provider-config.ts`, the same default in the Terraform `bedrock_model_id` variable, `BEDROCK_MODEL_ID` in the harness `.env.example`, and the harness pricing table now carries the Qwen rate ($0.18/$0.71) alongside Nova Pro for historical runs. Unit tests that pinned the old literal were updated with it.

Still open: nothing on the IAM side is required for the swap. The ECS task roles already allow `bedrock:InvokeModel` on `arn:aws:bedrock:ap-south-1::foundation-model/*` (`iam.tf`, two statements), and model access for the Qwen models is already enabled on account 562654496378 — proven by 93 successful `converse` calls on 28 Oct. The deploy role had no Bedrock permission at all, so a test-scoped inline policy (`keel-deploy-bedrock-qwen`, `bedrock:InvokeModel` on `arn:aws:bedrock:ap-south-1::foundation-model/qwen.*`) was added to run the eval from this workstation; drop it if the deploy role is meant to stay out of the data plane.


### 3.2 Firebase users cannot be moved to Cognito without forcing password resets

Cognito's import tool accepts BCRYPT, SCRYPT, ARGON2ID and PBKDF2_SHA256 in fixed string formats with no signer-key field. Firebase's modified scrypt depends on a per-project signer key plus a salt separator. The construction does not fit.

**Consequence: 100% of users must reset passwords.** Pre-launch with zero real users that is free. Post-launch it is a product event with churn attached. It is a decision, not an engineering detail — and it is why identity migration is sequenced last, not first.

### 3.3 Two services have no drop-in equivalent

- **Cloud Tasks with an OIDC-authenticated HTTP target has no AWS equivalent.** EventBridge Scheduler will not target non-AWS endpoints; Step Functions HTTP tasks authenticate by Basic, OAuth client-credentials or API key, never an OIDC ID token. The replacement is SQS plus a real consumer in the worker — which is why the worker story is the largest single item in Phase 1.
- **AWS App Runner is closed to new customers.** Anyone planning "Cloud Run → App Runner, one-to-one" is planning something that cannot be provisioned. ECS Fargate is the target, and the Terraform already reflects that.

---

## 4. The bridge that gets you off GCP without gambling on models

**Revised 27 Oct 2026.** The original rationale for this bridge was that no credit-eligible in-region model existed, so the model decision had to be deferred while infrastructure moved. Qwen removes that constraint (§3.1): the model is now in-region *and* credit-eligible, so there is no longer any reason to keep an external API key in the loop. What survives from the bridge is only its **sequencing** principle — do not change infrastructure and the safety-path model in the same week.

There is a way to leave GCP infrastructure entirely in about three weeks. It works because **the LLM call today goes through an API-key path, not through GCP infrastructure.** The repo already supports a non-Vertex provider (`LLM_PROVIDER=openrouter|gemini`).

So:

- **Move compute, database, cache, storage, queue, secrets and encryption to AWS now.** These are the billable, residency-relevant, lock-in parts.
- **Keep the LLM call on an API key for the bridge week only** (existing OpenRouter key), so the infra cutover is not also a model cutover.
- **Move embeddings to Titan on Bedrock** (§3.1), because embedding quality risk is low and it is in-region and credit-eligible.
- **Then flip to Qwen3 32B on Bedrock** once D2 signs the bar off. The model id is already the default in code (§3.1.4), so the flip is `LLM_PROVIDER=bedrock` plus model access in the account, not a code change.

That gives two tracks: Track A gets you hosted on AWS and unblocks the Play Store; Track B swaps the model behind a measured gate. Neither blocks the other, and both are now inside the credits.

---

## 5. Service mapping, verified

| GCP today | AWS target | In ap-south-1 | Effort (dev-days) | Risk |
|---|---|---|---|---|
| Vertex AI · Gemini structured JSON | Bedrock Converse + forced strict tool use on **Qwen3 32B** (`qwen.qwen3-32b-v1:0`), in-region Mumbai | Yes — In-Region, no Geo/Global profile exists | 2–3 | LOW |
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
| D2 | Run comparison: current baseline (Llama 3.1 8B via OpenRouter) vs **Qwen3 32B** vs Qwen3 Next 80B A3B, in-region on Bedrock, against the widened (~60 case) set | 3 |
| D3 | **Clinical acceptance decision** — Shubhangi signs the quality bar | 2 (external) |
| D4 | Bedrock hardening: guardrails, `data_retention_mode: none`, timeout/p95 tuning on the forced-tool path | 6 |
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
| Inference — **Qwen3 32B in ap-south-1**, 10k turns/month | **~$23** |
| Inference — same, at 50k turns/month | ~$114 |

**Credit position, corrected.** Qwen on Bedrock is billed as `serviceCode: AmazonBedrock` — an ordinary AWS charge, not a Marketplace charge — so promotional credit applies to the model line as well as the infrastructure. At beta volumes the whole stack (infra + model) runs **under $240/month**, so $5,000 of credits covers roughly 22 months at 10k turns/month.

What was previously described here as "the single most important commercial fact" — that credits could not cover the model — is no longer true under Qwen. The one caveat that remains is administrative: confirm the credit's **Applicable products** on the Billing console Credits page, because a credit can be narrowed by the programme that issued it. See §3.1.

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
9. **The model acceptance bar** in writing: what quality threshold the safety-critical prompts must clear before Qwen3 32B replaces the current Llama 3.1 8B baseline. Without a signed threshold, D2 has no pass/fail criterion and the migration stalls at the last gate.
10. **Sign-off on the crisis copy and helpline numbers**, still outstanding from the clinical packet. This gates what the app may display in the store listing and in the crisis overlay.

### From you — needed later, not blocking week 1
11. **LLM route for the bridge**: either keep the existing OpenRouter key for the bridge period, or go straight to Bedrock Qwen3 32B. The direct Bedrock route is now the better choice — it removes a third-party sub-processor from the DPDP chain and is credit-eligible, so there is no cost reason to keep an external API key. One of the two must exist before the app can serve a real turn on AWS.
12. **Residency: resolved, not a choice.** Qwen3 32B on Bedrock has no Geo or Global inference profile — only In-Region. Inference stays in Mumbai, so the README's residency claim translates to "ap-south-1 only" without weakening. No written residency decision is needed while Qwen is the model. This reverses the earlier §9.12 item, which assumed Claude's India-geo profile would be unavoidable.
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
| R2 | Qwen3 32B fails the clinical bar on crisis classification | Medium | If it fails there is no credit-eligible in-region fallback of comparable class | First pass is clean (16/16 A1, 15/15 A9-post, three runs — §3.1.1), but it is 31 cases: run D2 on the widened set before the flip; keep the API-key path one env var away |
| R3 | Credits are a narrowed programme that excludes Bedrock inference | Low | Model line bills outside the credit | Check Applicable products on the Billing console Credits page before Phase 1; infra is only ~$200/mo worst case |
| R4 | 14-day Play clock means store release cannot be pulled forward | Certain | ~4 weeks minimum | Start the clock the day staging is live |
| R5 | Forced password resets if Cognito migration happens post-launch | Certain if deferred | Churn | Do identity migration before public launch, or never |
| R6 | Model-quality regression is invisible because recall is unmeasured | High | Safety | D1/D2 require an eval set; this is the same gap flagged in the agent evaluation |

**Kill criteria.** Stop the migration and revert to GCP if: AWS credits turn out to exclude Bedrock inference (ruled unlikely — Qwen is billed as an ordinary AWS service charge) *and* Qwen3 32B fails the clinical bar *and* you decline to fund the model line outside the credits. With Qwen those three conditions now have to fail together, which is a materially weaker case for abandoning the migration than this document originally described — the model line at beta volume is under $25/month.

---

## 12. What this plan does not claim

- **Nothing has been deployed.** The Terraform validates; it has never been applied, because there are no AWS credentials on the build host.
- **No Bedrock call has ever succeeded against a live endpoint.** The client is written and its tests mock the SDK; a real call without credentials fails closed with a fallback, which is the correct behaviour but is not a demonstration.
- **The migration is not seven days.** Track A is 50 dev-days; the full programme is 88. The seven-day build plan is superseded by this document.
- **The Android app has never run against a live backend**, because the configured backend is dead. 209 Flutter tests pass; 2 fail on that stale URL.
- **Classifier recall is still unmeasured**, in both codebases. Adding agents and moving clouds does not make the pipeline safer; only measurement does.

---

*Prepared 27 October 2026. Every figure in this document was produced by running something today: `terraform validate`, the four test suites, a signed AAB build, HTTP probes against the production host, and AWS documentation pages cited in `GCP-to-AWS-mapping-ap-south-1.md`.*
