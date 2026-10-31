# Okuvu beta — on-call runbook and escalation path

**Stack:** `evia-beta` · AWS account `562654496378` · region `ap-south-1` (the only region the
Terraform allows — DPDP residency).
**Scope:** the four failure classes the launch depends on — api down, model throttling, database
restore, secret rotation — plus the clinical escalation route.
**Written:** 2026-10-29. Every command in this file was run against the live account on that date
(transcript and UTC timestamps in `evidence/E20-S2.md`). Resource names, ARNs and IDs are copied from
`aws describe-*` output, not from Terraform source or memory.
**Owner:** ops on-call. Clinical content (§6) is owned by the clinical owner, not by ops.

> ## Approval status
>
> §6 — *Clinical escalation route and helpline block* — is marked
> **UNAPPROVED-PENDING-CLINICAL-OWNER**.
> The route and the helpline block are documented and technically accurate as of this commit, but the
> launch backlog (E20-S2) requires the clinical owner's written approval of that section, and **no such
> approval exists**. The related clinical sign-off, E17-S7, is `not_started` in `plan/run-ledger.psv`.
> Nothing in this document may be cited as evidence that Okuvu is clinically reviewed. See §6.6.

---

## 0. First five minutes

```bash
export AWS_REGION=ap-south-1
export ACCOUNT=562654496378
export CLUSTER=evia-beta
export API_TG=arn:aws:elasticloadbalancing:ap-south-1:562654496378:targetgroup/evia-beta-api-tg/7de5e7f973e79f4a
export PORTAL_TG=arn:aws:elasticloadbalancing:ap-south-1:562654496378:targetgroup/evia-beta-portal-tg/713547dbcab9b3b7
export ALB=app/evia-beta-alb/b206473f7e05ebc2
export OPS_TOPIC=arn:aws:sns:ap-south-1:562654496378:evia-beta-ops-alerts

aws sts get-caller-identity          # must print 562654496378
date -u +%FT%TZ                     # every note you write gets this
```

**Nobody is being paged by email.** Before relying on an alarm, read §1 — it changes how you find out
something is broken.

**The public surface, as verified today:**

| URL | Backed by | Healthy response |
| --- | --- | --- |
| `https://api.okuvu.in/health` | `evia-beta-api` via `evia-beta-api-tg` | `{"status":"ok","timestamp":"…","commit":"<12-char sha>"}` |
| `https://portal.okuvu.in/api/health` | `evia-beta-portal` via `evia-beta-portal-tg` | HTTP 200 |
| `https://okuvu.in/auth` | `evia-beta-portal` (host rule, priority 10) | HTTP 200 |

`GET /health` deliberately touches **no** dependency: it does not query Postgres, Redis or Bedrock. A
200 from `/health` therefore means *the process is up and the target group can reach it*, not that the
product works. Never close an incident on a green `/health`.

---

## 1. Paging path — as it actually is

Nine resources, one honest conclusion: **alarm delivery works; nobody is woken up.**

**CloudWatch alarms (8, all in `OK` state when checked):**

| Alarm | Metric | Threshold | Missing data |
| --- | --- | --- | --- |
| `evia-beta-api-unhealthy-hosts` | `AWS/ApplicationELB UnHealthyHostCount` (LB + api TG) | ≥ 1 for 2×60s | `notBreaching` |
| `evia-beta-api-target-5xx` | `AWS/ApplicationELB HTTPCode_Target_5XX_Count` (LB) | > 10 per 300s | `notBreaching` |
| `evia-beta-api-running-tasks-low` | `ECS/ContainerInsights RunningTaskCount` | < 1 for 3×60s | **`breaching`** |
| `evia-beta-worker-running-tasks-low` | same, worker | < 1 for 3×60s | **`breaching`** |
| `evia-beta-portal-running-tasks-low` | same, portal | < 1 for 3×60s | **`breaching`** |
| `evia-beta-portal-unhealthy-hosts` | `UnHealthyHostCount` (LB + portal TG) | ≥ 1 for 2×60s | `notBreaching` |
| `evia-beta-rds-connections-high` | `AWS/RDS DatabaseConnections` | > 80 for 2×300s | `notBreaching` |
| `evia-beta-rds-free-storage-low` | `AWS/RDS FreeStorageSpace` | < 5 368 709 120 bytes for 2×300s | `notBreaching` |

All eight have the **same** action, `arn:aws:sns:ap-south-1:562654496378:evia-beta-ops-alerts`, on both
`ALARM` and `OK`. There is no `OKActions` fan-out to a second channel and no composite alarm.

**The topic's subscriptions, as they are today:**

| Protocol | Endpoint | Status | Consequence |
| --- | --- | --- | --- |
| `sqs` | `arn:aws:sqs:ap-south-1:562654496378:evia-beta-ops-alerts-sink` | **Active** | Delivery is proven: the queue held 8 messages, one of them the channel test *"If you can read this in the sink queue, alarm delivery works."* (published 2026-10-28T15:02:12Z). Nothing consumes the queue — it is a sink, not a pager. |
| `email` | `r***@suvoksystem.com` | **PendingConfirmation** | SNS has sent a confirmation link that was never clicked. **No email is delivered for any alarm.** |

So: an alarm fires, SNS accepts it, the SQS sink records it, and the human path stops there. Until the
email subscription is confirmed (owner action: find the SNS confirmation mail in that mailbox and click
it, or `aws sns subscribe --protocol email --topic-arn "$OPS_TOPIC" --notification-endpoint <address>`
to re-send), on-call is found by a human or not at all. The mailbox belongs to the product owner named
in `plan/ORCHESTRATION-v1.md` §6 — so this is his one click, not an engineering change. Read the sink as
the page:

```bash
aws sqs get-queue-attributes --region "$AWS_REGION" \
  --queue-url https://sqs.ap-south-1.amazonaws.com/562654496378/evia-beta-ops-alerts-sink \
  --attribute-names ApproximateNumberOfMessages --output text
```

A rising count with nobody watching is the *expected* current state, not a second incident.

**There is no alarm on:** Bedrock throttling; RDS **availability** (only connection count and free
storage are watched); latency; the WebSocket path; or anything the worker does — a worker failure is
invisible to CloudWatch beyond its `RunningTaskCount`. Application 5xx that the ALB sees *will* appear
in `evia-beta-api-target-5xx`; a route that fails without ever reaching the ALB will not. §3.5 and §7
list the gaps this leaves.

---

## 2. Failure class 1 — api down, 5xx, or target group unhealthy

### 2.1 Identify (target: 2 minutes)

Work down this list; each step narrows the layer.

```bash
# 1. Which alarms are firing, right now
aws cloudwatch describe-alarms --region "$AWS_REGION" --alarm-name-prefix evia-beta \
  --query 'MetricAlarms[].[AlarmName,StateValue]' --output table

# 2. Does the public endpoint answer, and what commit is serving?
curl -s -m 10 https://api.okuvu.in/health

# 3. Is the ALB able to reach a task? (healthy / unhealthy / draining, and why)
aws elbv2 describe-target-health --region "$AWS_REGION" --target-group-arn "$API_TG" \
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State,TargetHealth.Reason]' \
  --output table

# 4. What does the service think it is doing?
aws ecs describe-services --region "$AWS_REGION" --cluster "$CLUSTER" --services evia-beta-api \
  --query 'services[0].{desired:desiredCount,running:runningCount,
           primary:deployments[?status==`PRIMARY`]|[0].taskDefinition,
           primaryRunning:deployments[?status==`PRIMARY`]|[0].runningCount,
           primaryFailed:deployments[?status==`PRIMARY`]|[0].failedTasks,
           rollout:deployments[?status==`PRIMARY`]|[0].rolloutState}' --output json

# 5. The last ten things ECS did to this service — this is where a crash-loop or a
#    circuit-breaker rollback is visible
aws ecs describe-services --region "$AWS_REGION" --cluster "$CLUSTER" --services evia-beta-api \
  --query 'services[0].events[0:10].message' --output text

# 6. What the container actually said
aws logs tail /ecs/evia-beta/api --region "$AWS_REGION" --since 30m | tail -50
```

Reading the result:

| Symptom | Meaning | Go to |
| --- | --- | --- |
| Target state `unhealthy`, reason `Target.ResponseCodeMismatch` (anything but 200) | The process is up but `/health` is failing, or a proxy in the container is | §2.2 |
| Target state `unhealthy`, `Target.Timeout` / `RequestTimeout` | Task not accepting connections — hung event loop, deadlock, port not bound | §2.2 |
| Target state `unhealthy`, `Target.FailedHealthChecks` | Consecutive failures ≥ 3 (90s at 30s interval) | §2.2 |
| Target state `draining`, reason `Target.DeregistrationInProgress` | **Normal** — a task is being replaced by a deployment. Not an incident unless it is the only target and nothing registers in its place | §2.1 step 4 |
| `primaryRunning: 0`, `rollout: IN_PROGRESS`, `primaryFailed > 0` | A deployment is failing and the circuit breaker is deciding | §2.3 |
| Service events show `deployment … rolled back` | ECS already rolled back on its own — **verify before you touch anything** (§2.4) | §2.4 |
| API healthy, 5xx alarm firing | Application error, not availability. `aws logs tail` for `"level":50` | §2.2 |

One known false alarm to discount: `evia-beta-worker-running-tasks-low` will fire during *every* worker
deploy, because that service has `minimumHealthyPercent: 0` (verified) — the old worker is stopped
before the new one is registered. If the only firing alarm is the worker's and a build is in progress,
look at §2.5 before doing anything.

### 2.2 Decide: roll back, or fix forward

Roll back when **all** of these are true:

- the previous revision was serving traffic successfully before the change (check `/health`'s `commit`
  against the image tag of that revision, below);
- the failure started at or after a deploy (compare `GIT_COMMIT` on `/health` with the time the
  incident began);
- you do not already know the cause.

**Do not roll back** to "fix" a failure whose cause is configuration or data that both revisions share:
a rotated database password that was not written to `evia-beta/database` (§5.1), a migration that has
already run (`prisma migrate deploy` runs in every build's `post_build` and is not reversed by a
rollback), or an AWS-side dependency outage (Bedrock, RDS, Cognito). Rolling back will produce a second
red deployment and cost you the 5–10 minutes the rollback needs.

### 2.3 Roll the service back to the previous task definition

Task definitions are immutable and every build registers a new revision, so **derive** the rollback
target; never hard-code a revision number. When this section was first drafted the families were at
`api:25`, `worker:25`, `portal:23`; ten minutes later a `develop` build had moved them to `api:26`,
`worker:26`, `portal:24` (recorded in `evidence/E20-S2.md` §2.2). The numbers move; the derivation does
not.

```bash
# What exists, newest first. [0] is live, [1] is the rollback target.
aws ecs list-task-definitions --region "$AWS_REGION" --family-prefix evia-beta-api --sort DESC \
  --query 'taskDefinitionArns[0:5]' --output text

# Pin the target and LOOK AT IT before deploying it: the image tag is the commit.
PREV=$(aws ecs list-task-definitions --region "$AWS_REGION" --family-prefix evia-beta-api \
        --sort DESC --query 'taskDefinitionArns[1]' --output text)
echo "$PREV"
aws ecs describe-task-definition --region "$AWS_REGION" --task-definition "$PREV" \
  --query 'taskDefinition.containerDefinitions[0].{image:image,commit:environment[?name==`GIT_COMMIT`].value}' \
  --output json
```

The image must still exist in ECR — `evia-beta/api` has **no lifecycle policy** (verified:
`lifecyclePolicyText: null`), so old tags are retained and a rollback target from any recent build is
pullable. If the image were missing the deployment would fail its pull and roll back again.

```bash
aws ecs update-service --region "$AWS_REGION" --cluster "$CLUSTER" \
  --service evia-beta-api --task-definition "$PREV"
```

`update-service` with a *different* revision starts a new deployment by itself. `--force-new-deployment`
is only for restarting **the same** revision (e.g. to re-read a rotated secret, §5.1) — do not add it
here, and do not use it as a substitute for a rollback.

Wait for the deployment to settle — but read §2.4 first, because the success of this wait is not the
answer you want:

```bash
aws ecs wait services-stable --region "$AWS_REGION" --cluster "$CLUSTER" --services evia-beta-api
```

The same three commands work unchanged for the other two services (`evia-beta-worker`,
`evia-beta-portal`) and their own `--family-prefix` values (`evia-beta-worker`, `evia-beta-portal`).

### 2.4 Confirm the rollback — and why `wait services-stable` is not proof

**`aws ecs wait services-stable` returns exit code 0 after a rollback.** A deployment that fails and is
rolled back by the circuit breaker is *stable* — that is the whole point of the breaker — so the waiter
cannot distinguish "the new revision is serving" from "the new revision died and ECS put the old one
back". The build pipeline knows this and refuses to trust the waiter; `buildspec.yml` `post_build`
(lines 162–230) records the ARN it registered for each workload and then compares it with the service's
PRIMARY deployment, failing the build on a mismatch:

```
ROLLED BACK api: expected arn:…:evia-beta-api:26, serving arn:…:evia-beta-api:25
=== A deployment rolled back. The build FAILS so old code is never reported as deployed. ===
```

Do the same check manually. This is the authoritative confirmation (the transcript in
`evidence/E20-S2.md` shows this check returning `NOT ROLLED BACK — investigate` while a `develop` build
was mid-rollout to `api:26`: the check reports what is *actually* serving, which is the whole point — a
`PREV` you derived before a concurrent build landed is already stale by the time you deploy it):

```bash
SERVING=$(aws ecs describe-services --region "$AWS_REGION" --cluster "$CLUSTER" \
  --services evia-beta-api \
  --query 'services[0].deployments[?status==`PRIMARY`]|[0].taskDefinition' --output text)
echo "expected: $PREV"
echo "serving : $SERVING"
[ "$SERVING" = "$PREV" ] && echo "ROLLBACK CONFIRMED" || echo "NOT ROLLED BACK — investigate"
```

Then three independent confirmations, in order of how much they actually prove:

```bash
# a) the process is answering, and from which commit (image tag == GIT_COMMIT == /health commit)
curl -s -m 10 https://api.okuvu.in/health

# b) the ALB agrees
aws elbv2 describe-target-health --region "$AWS_REGION" --target-group-arn "$API_TG" \
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output text

# c) the error rate has stopped climbing (5xx per 5 min, LB dimension only)
aws cloudwatch get-metric-statistics --region "$AWS_REGION" --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count --dimensions Name=LoadBalancer,Value="$ALB" \
  --start-time "$(date -u -d '-30 min' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --period 300 --statistics Sum --output table
```

`/health`'s `commit` is the acceptance test: it is `GIT_COMMIT` from the task definition, which the
pipeline sets to the image tag, which is the 12-character commit SHA (`api:25` → `0f54ff687210`,
`api:24` → `2d76ea514b64`, verified). If `/health` reports the commit of the revision you rolled *off*,
the rollback did not take effect, whatever the waiter said.

Finally: an incident is not over until the **cause** is known. A rollback restores service; it does not
explain the failure, and the next `develop` push will deploy the same broken commit again. Record the
failing revision ARN and the log window in the incident note, and open a ticket that names them.

### 2.5 The worker trap (read before rolling back api)

`evia-beta-worker` deploys with `maximumPercent: 100, minimumHealthyPercent: 0` (verified) — during a
worker rollout **the only worker task is stopped before the replacement is registered**. The api asserts
at startup that the worker is reachable (`http://worker.evia-beta.local:8080/health`), so api tasks
started in that window exit 1 with:

```
Failed to start server: Error: FATAL: worker is not reachable at http://worker.evia-beta.local:8080/health
```

The service converges once the new worker is up (observed in `evidence/E16-S4.md` §6), so this looks
like an api outage in the target group while it is really a worker-rollout artefact. Do not "fix" it by
rolling api back; check whether a build is running first:

```bash
aws codebuild list-builds-for-project --region "$AWS_REGION" --project-name evia-beta-build \
  --query 'ids[0:3]' --output text
aws codebuild batch-get-builds --region "$AWS_REGION" \
  --ids $(aws codebuild list-builds-for-project --region "$AWS_REGION" \
          --project-name evia-beta-build --query 'ids[0:3]' --output text) \
  --query 'builds[].[id,buildStatus,startTime,endTime]' --output text
```

Also: the ALB has `healthCheckGracePeriodSeconds: 30` on api and `60` on portal. A new task that needs
longer than that to boot will be killed and counted as failed before its first successful check.

---

## 3. Failure class 2 — model throttling / Bedrock failure

### 3.1 What the user sees: a calm reply, not an error

When Bedrock throttles or fails, **the turn still succeeds from the client's point of view**. The
WebSocket returns a normal `AGENT_TURN` frame with `fallback: true`; the text is a governed constant,
never an exception:

| Condition | Text the client receives | `safetyNotice.code` |
| --- | --- | --- |
| A2 could not write a reply (throttle/timeout/error), state not S2 | `MODEL_UNAVAILABLE_RESPONSE` — *"I'm here with you, and I'm listening. Something on my side isn't working properly just now, so I don't want to answer you with words I can't stand behind. If it's feeling heavy in the meantime, please reach one of these: Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai: 044-24640050 iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm. Say it again whenever you're ready — I'll still be here."* | `MODEL_THROTTLED` or `MODEL_UNAVAILABLE` |
| …and the state **is** S2 (elevated risk) | `A9_POST_S2_FALLBACK` — *"I'm right here with you, and I'm not going anywhere. Take this at your own pace — I'm listening."* | as above |
| A1 (the safety classifier) itself failed | `SAFETY_UNAVAILABLE_RESPONSE` (fail-closed: no model prose, helplines named) | `SAFETY_UNAVAILABLE` |

The pipeline does **not** forward the model client's `SAFE_FALLBACK` sentinel
(`"I'm here to support you. Could you tell me more about how you're feeling?"`) — it discards the
sentinel text and substitutes the governed copy above (`apps/api/src/pipeline/orchestrator.ts` §A2
result handling; `apps/api/src/pipeline/fallbacks.ts`). `SAFE_FALLBACK` still exists in
`lib/canned-response.ts` as the raw client-level sentinel and is what appears in unit tests; it is not
what a beta user sees on the throttled path.

**This is the intended degradation, and it is the promise that must hold:** a Bedrock outage makes
Okuvu sound vague and slightly broken. It must never make it error, hang, or (worse) answer without a
safety decision. If you are seeing 5xx or `TURN_FAILED` on the wire, that is *not* throttling — go to
§2.

### 3.2 Confirm it from the logs (one command)

Every completed turn writes one JSON line to `/ecs/evia-beta/api` with `outcome`, `fallback_source`
and `safety_code`. Bedrock failures also log `"Bedrock call failed"` with `failureKind`
(`throttled` | `timeout` | `unavailable`).

```bash
# Counts by outcome / fallback source over the last 24h
aws logs start-query --region "$AWS_REGION" --log-group-name /ecs/evia-beta/api \
  --start-time "$(date -u -d '-24 hours' +%s)" --end-time "$(date -u +%s)" \
  --query-string 'fields outcome, fallback_source, safety_code
                  | filter ispresent(outcome)
                  | stats count() as n by outcome, fallback_source, safety_code' \
  --query queryId --output text
# then: aws logs get-query-results --region ap-south-1 --query-id <id> --output json
```

A throttling episode looks like `fallback_source = "model_throttled"` with a non-zero count and a
climbing share of `n`. To see the raw lines instead:

```bash
aws logs filter-log-events --region "$AWS_REGION" --log-group-name /ecs/evia-beta/api \
  --filter-pattern '{ $.msg = "Bedrock call failed" }' \
  --start-time $(( ($(date -u +%s) - 3600) * 1000 )) \
  --query 'events[].message' --output text
```

An empty result on both is the healthy state; the queries above were run against this stack and
returned zero rows, which is consistent with a model that was answering normally at the time.

The same failure is visible in the audit chain — every completed turn writes one `AuditEvent` row, and
a throttled turn is recorded as `MODEL_UNAVAILABLE_FALLBACK` rather than `TURN_COMPLETED`
(`orchestrator.ts`, `auditAction`). That row is the durable record after logs age out (14 days).

### 3.3 Check the quota

Bedrock's runtime metrics are in CloudWatch namespace `AWS/Bedrock`, dimension `ModelId`
(`qwen.qwen3-32b-v1:0`). This account publishes `Invocations`, `InvocationLatency`,
`InvocationClientErrors`, `InputTokenCount`, `OutputTokenCount` and `EstimatedTPMQuotaUsage` — the last
one was present in the namespace and had reported within the hour when checked. These are emitted per
successful request, so a **quiet** model and a **throttled** model both look like "no new datapoints";
an empty table is not evidence either way.

```bash
# what is actually being published for this model
aws cloudwatch list-metrics --region "$AWS_REGION" --namespace AWS/Bedrock \
  --query 'Metrics[].MetricName' --output text | tr '\t' '\n' | sort -u

# quota pressure, per minute, last 3h (a token count, not a percentage)
aws cloudwatch get-metric-statistics --region "$AWS_REGION" --namespace AWS/Bedrock \
  --metric-name EstimatedTPMQuotaUsage \
  --dimensions Name=ModelId,Value=qwen.qwen3-32b-v1:0 \
  --start-time "$(date -u -d '-3 hours' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --period 60 --statistics Sum --output table

# invocations, to see whether the traffic is even arriving
aws cloudwatch get-metric-statistics --region "$AWS_REGION" --namespace AWS/Bedrock \
  --metric-name Invocations --dimensions Name=ModelId,Value=qwen.qwen3-32b-v1:0 \
  --start-time "$(date -u -d '-3 hours' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --period 300 --statistics Sum --output table
```

Two honest caveats, both from AWS's own metric documentation:

- `EstimatedTPMQuotaUsage` is an **estimate of consumed quota after completion**, and AWS says
  explicitly it must not be the sole indicator: throttling is decided on the *upfront reservation* of
  `input tokens + max_tokens`. A model configured with a large `max_tokens` throttles while this metric
  looks low. Treat a rise here as a warning, not as the cause.
- `InvocationThrottles` is not among the series this account publishes; runtime metrics describe
  *successful* calls. The application log line in §3.2 is therefore the authoritative signal for
  "we were throttled", not CloudWatch.

**The quota itself is not readable by the deploy role.** The identity this runbook's commands run as
is denied `servicequotas:ListServiceQuotas`:

```
An error occurred (AccessDeniedException) when calling the ListServiceQuotas operation:
User: …:assumed-role/keel-deploy/… is not authorized to perform: servicequotas:ListServiceQuotas
```

Read the limit in the console with an identity that has it:

**Console path:** AWS Console → region **ap-south-1** → **Service Quotas** → **AWS services** →
**Amazon Bedrock** → filter for the `qwen.qwen3-32b-v1:0` on-demand **tokens-per-minute** quota
(and the account-level **tokens-per-day** quota on the same page).
Direct link: `https://ap-south-1.console.aws.amazon.com/servicequotas/home/services/bedrock/quotas`
→ **Request quota increase** on that row. Increases for Bedrock are usually granted within minutes to
hours; there is no self-service API path this role can use.

### 3.4 What to do

1. **Confirm before acting**: §3.2 must show `model_throttled`, otherwise this is not a quota problem
   and the runbook's other sections apply.
2. **Do not restart anything.** Throttling is per-call and per-minute; restarting the api drops live
   WebSocket sessions, loses in-flight turns, and changes nothing about the quota.
3. **If it is sustained** (minutes, not a burst): file the quota increase (§3.3). That is the only
   lever that exists in this stack — the live task definition pins exactly one model
   (`BEDROCK_MODEL_ID=qwen.qwen3-32b-v1:0`, `LLM_PROVIDER=bedrock`) and there is no alternate model,
   provider fallback, or provisioned throughput configured. Changing the model means registering a new
   task-definition revision (new `BEDROCK_MODEL_ID`) and is a *code/config* change with a clinical
   review attached to the copy — not an on-call action.
4. **Tell the clinical owner if the degradation is visible to users for more than a few minutes**: the
   substitute replies are governed copy, and a prolonged period of them is a product-quality event, not
   just an infrastructure one (§6.1, category E5).

### 3.5 What is missing (state it plainly in the incident note)

There is **no alarm** on Bedrock throttling, on `EstimatedTPMQuotaUsage`, or on the
`fallback_source = "model_throttled"` rate. A total model outage degrades every turn to the substitute
reply while all eight CloudWatch alarms stay green, because the api is healthy and returning 200s. Until
an alarm exists, this failure is found by reading logs, not by being paged.

---

## 4. Failure class 3 — database restore

**The procedure is `docs/RESTORE-RUNBOOK.md`, which is measured, drilled and current. Follow it; this
section is the on-call index to it, not a second copy.**

### 4.1 The numbers that matter when you are under pressure

| Fact | Value |
| --- | --- |
| Instance | `evia-beta-postgres`, PostgreSQL 16.13, `db.t4g.micro`, 20 GiB gp3, encrypted, single-AZ, private subnets, `DeletionProtection: true` |
| **Pre-migration snapshot (the recorded one)** | **`evia-beta-premigrate-202610281906`** — manual, created 2026-10-28T19:06:20Z, still `available` |
| Automated snapshots | `rds:evia-beta-postgres-<YYYY-MM-DD-HH-MM>`, daily in the **19:00–19:30Z** backup window, 7-day retention |
| **Measured restore time — manual snapshot** | **9m 57s** to `available` (3m 05s to data-in-place) |
| **Measured restore time — automated snapshot** | **5m 17s** to `available` (2m 51s to data-in-place) |
| Plan / budget | plan for **6–10 minutes**, budget **15 minutes** of wall clock including teardown |
| Cost of a drill | ≈ $0.01 (24.3 instance-minutes, measured) |
| Point-in-time recovery | **not drilled**; `LatestRestorableTime` is continuously updated (2026-10-29T15:25Z when checked) |

Why the two figures differ is fully explained in `docs/RESTORE-RUNBOOK.md` §4: the 9m57s run carried
`--db-parameter-group-name evia-beta-postgres16` (a post-restore parameter change plus a reboot) and
inherited 7-day backup retention (an immediate 20 GiB backup). The data copy itself took 3m05s and
2m51s. **Use the flags from `docs/RESTORE-RUNBOOK.md` §3.2, not the 9m57s run's flags**, and you will
land near 5 minutes.

### 4.2 Procedure (exact commands)

`docs/RESTORE-RUNBOOK.md` §3.1 → §3.5, in order: preflight, `restore-db-instance-from-db-snapshot`
into `evia-restore-drill-<utcstamp>`, poll to `available` with timestamps, verify, delete with
`--skip-final-snapshot --delete-automated-backups`, prove `DBInstanceNotFound`.

The one thing to carry in your head: the restore target is a **scratch instance**, never production.

```bash
# the whole class of mistakes this runbook forbids, in one line:
#   --db-instance-identifier evia-beta-postgres          ← NEVER for a restore
#   restore-db-instance-to-point-in-time on production   ← NOT COVERED (see §4.4)
```

Restored instances inherit the master credentials from the snapshot, so `evia-beta/database` still
authenticates against them — do not reset the password mid-drill.

### 4.3 Post-restore verification (what "the data arrived" means here)

Run the drill's own comparison, inside the VPC (`scripts/in-vpc-db-task.sh` +
`scripts/restore-drill-counts.js`) against both production and the restored instance, and require:

| Check | Pass condition |
| --- | --- |
| public tables | **38** (37 Prisma models + `_prisma_migrations`) |
| migrations | **43 of 43** applied, 0 failed |
| schema fingerprint | **340** columns / **86** indexes / **70** constraints / **12** enums — identical on both sides |
| per-table counts | identical to production within the §5 tolerance of `docs/RESTORE-RUNBOOK.md` |
| content digests | identical (`ToolRegistryEntry` = `c3180e604fc377a24e91674dbe1b8537`, `CrisisResource` = `eac54a3228aca55ee5d876e965545f47` at the time of the drill) |
| `TARGET_HOST` line | names the **scratch** endpoint. If it names `evia-beta-postgres…` your host rewrite failed and you are comparing production with production. |

A shortfall on a clinical table that cannot be explained by writes after `SnapshotCreateTime` is a
**failed restore** — keep the instance (it is the evidence) and escalate before deleting it.

### 4.4 What this does not cover — escalate instead of improvising

- Restoring **over** production, renaming a scratch instance into the production identifier, or
  repointing `DATABASE_URL` at a restored instance. All are deliberate production changes, none has
  been drilled.
- **PITR** (`restore-db-instance-to-point-in-time`). Never measured. If you need a specific minute, say
  so explicitly rather than assuming the snapshot path covers it.
- Restoring **real clinical data at volume**: beta holds no client clinical rows yet, so every drilled
  comparison was exact-equality on an almost-empty database. The tolerance rule exists; it has not been
  exercised.
- Cross-region / cross-account recovery: no snapshot copies exist.

If the database is gone and none of the above is available, that is an incident for the on-call owner
and the clinical owner — §6 — not a solo restore.

---

## 5. Failure class 4 — secret rotation

Four kinds of credential sit in this stack. Only the first requires a redeploy; the table is the short
version, the sections are the commands.

| Credential | Stored in | Rotation touches | Redeploy? |
| --- | --- | --- | --- |
| RDS master password (`evia_app`) | `evia-beta/database` (JSON: `username`, `password`, `host`, `port`, `dbname`, `engine`, `database_url`) | RDS + secret payload | **Yes — api, worker, portal** |
| Google OAuth client secret (leaked in git history) | nowhere in AWS; the GCP OAuth client | Google Cloud console only | **No** — verified not referenced by any live task definition |
| Therapist sign-in passwords (3) | `/evia-beta/therapists/<slug>/password` (SSM `SecureString`) + Cognito | SSM + Cognito user pool | **No** — the portal authenticates through Cognito, nothing reads the SSM parameter at runtime |
| Portal secrets: `evia-beta/portal-nextauth-secret`, `evia-beta/portal-cognito-client-secret`, `evia-beta/brevo-api-key`, `evia-beta/worker-internal-auth`, `evia-beta/android-upload-keystore` | Secrets Manager (names only; values never in this document) | their own issuer/console | portal restart for the first three; worker+api restart for `worker-internal-auth` |

Secrets Manager has **no rotation schedule configured** on any of them (`RotationEnabled: null` on
`evia-beta/database`, verified). Rotation is manual, and this section is the definition of done.

### 5.1 RDS master password — rotate, then redeploy all three services

Order matters: RDS first, secret second, redeploy third. Doing the secret first gives you a window
where the tasks cannot authenticate and every request fails — and `--apply-immediately` on RDS closes
that window from the other side too, so keep the two steps back to back and expect a brief error burst.

```bash
# 1. generate (alphanumeric only: the value is embedded in a URI and in a JSON secret)
NEWPW="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"

# 2. set it on the instance. No old password needed; the deploy role can do this.
aws rds modify-db-instance --region "$AWS_REGION" \
  --db-instance-identifier evia-beta-postgres \
  --master-user-password "$NEWPW" --apply-immediately \
  --query 'DBInstance.DBInstanceStatus' --output text        # -> modifying

# 3. wait for the instance to be available again before touching the secret
until [ "$(aws rds describe-db-instances --region "$AWS_REGION" \
           --db-instance-identifier evia-beta-postgres \
           --query 'DBInstances[0].DBInstanceStatus' --output text)" = "available" ]; do
  date -u +%FT%TZ; sleep 15
done
```

Update **both** fields of the secret, in one `put-secret-value`. `database_url` is what the ECS
containers consume (`valueFrom: …:database_url::`), while `password` is what `buildspec.yml`'s
`post_build` recomposes the migration URL from — rotating one and not the other leaves the next build
unable to run `prisma migrate deploy`:

```bash
umask 077                                    # the payload files are 0600, never world-readable
aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id evia-beta/database \
  --query SecretString --output text > /tmp/dbsecret.json

NEWPW="$NEWPW" python3 - <<'PY'
import json, os, urllib.parse as up
cur = json.load(open("/tmp/dbsecret.json"))
pw = os.environ["NEWPW"]                     # passed by env, never on the command line
q = lambda v: up.quote(str(v), safe="")
cur["password"] = pw
cur["database_url"] = "postgresql://%s:%s@%s:%s/%s?sslmode=require" % (
    q(cur["username"]), q(pw), q(cur["host"]), cur["port"], q(cur["dbname"]))
with open("/tmp/dbsecret.new.json", "w") as f:
    json.dump(cur, f)
print("payload written; keys:", sorted(cur))  # key names only — values are never printed
PY

aws secretsmanager put-secret-value --region "$AWS_REGION" \
  --secret-id evia-beta/database \
  --secret-string file:///tmp/dbsecret.new.json \
  --query 'VersionId' --output text

shred -u /tmp/dbsecret.json /tmp/dbsecret.new.json 2>/dev/null || rm -f /tmp/dbsecret.json /tmp/dbsecret.new.json
```

(The rewrite logic above was dry-run against the live secret: it parses, preserves host, database name
and `sslmode=require`, and round-trips the new password through the URI. Only the `put-secret-value`
was not executed.)

`sslmode=require` is the live query string (verified) and must be preserved: the runtime normalises it,
and dropping it changes TLS behaviour rather than just the password. Do **not** "fix" a TLS error by
removing `sslmode` — that is the E16-S4 defect, which took production down once already
(`evidence/E16-S4.md` §7).

Redeploy — `force-new-deployment` is correct **here**, because the task definition does not change but
the secret it resolves at startup does:

```bash
for s in evia-beta-api evia-beta-worker evia-beta-portal; do
  aws ecs update-service --region "$AWS_REGION" --cluster "$CLUSTER" \
    --service "$s" --force-new-deployment >/dev/null && echo "rolling $s"
done
aws ecs wait services-stable --region "$AWS_REGION" --cluster "$CLUSTER" \
  --services evia-beta-api evia-beta-worker evia-beta-portal
```

Verify with something that actually opens a connection, then with the service's own log line:

```bash
# a) the secret authenticates against the rotated instance (throwaway Fargate task, ~1 min, ~$0.01)
scripts/in-vpc-db-task.sh --sql 'select current_user, now();'

# b) the containers picked the new value up
aws logs tail /ecs/evia-beta/api --region "$AWS_REGION" --since 10m | grep -E 'Database connection established|password authentication failed'
```

`password authentication failed` after the roll means the secret did not reach the container: check the
task definition's `secrets` reference still points at `evia-beta/database:database_url` and that the
secret's `AWSCURRENT` version is the one you wrote.

Rollback if the rotation goes wrong: the **old password is gone** (RDS does not keep it), so the way
back is to rotate again with a fresh value and update the secret to match — not to "restore" a previous
secret version, which would point at a password the database no longer accepts.

### 5.2 The leaked Google OAuth client secret — still to be rotated

**State of the finding:** a 35-character Google OAuth client secret (`GOCSPX-…`) was committed in
`apps/test-harness/.env.example` in `0a724b0` (2026-09-06), removed in `06424dc` (2026-10-28), present
in the history of every ref — and **`okuvu/Okuvu` is a public repository** (verified 2026-10-29:
GitHub API returns `"private": false`, `"visibility": "public"`, default branch `develop`). Anyone can
read that commit. It has been exposed for ~7 weeks.

**What it is not:** it is not used by the live stack. Verified today — none of `evia-beta-api:26`,
`evia-beta-worker:26`, `evia-beta-portal:24` carries a `GOOGLE_*` environment variable or secret, and
`grep -rn "GOOGLE_CLIENT"` across the repo finds no code that consumes it. The GCP/Firebase stack it
belonged to was removed in `e224874`.

**Rotation is a Google-side action with no AWS component:**

1. Console path: **Google Cloud console → APIs & Services → Credentials** → the OAuth 2.0 Client ID
   belonging to project **`971397352159`** (the client-id prefix) → **Reset secret** (or delete the
   client if the flow is gone for good).
2. That invalidates the value in git history. Nothing is redeployed; nothing in AWS changes.
3. Record who did it and when in the incident/rotation log, and note that the old value stays in git
   history forever — deletion from history is a separate decision, and a rewritten public history is
   itself disruptive.

Until step 1 happens, treat the secret as live. There is no AWS-side mitigation: the credential is not
in Secrets Manager, so it cannot be "rotated" in this account.

**Owner action, not on-call's:** this needs a Google Cloud login held by the product owner. If you are
on call and find it unrotated, escalate it — do not attempt it.

### 5.3 Therapist sign-in passwords (three, SSM + Cognito)

The three beta therapists exist in Cognito user pool **`ap-south-1_eaJaK7g4g`** (`evia-beta-therapists`,
3 users, all `CONFIRMED`, all `Enabled` — verified). Their passwords are recorded in SSM as
`SecureString` at `/evia-beta/therapists/<slug>/password` for slugs `ananya.rao`, `priya.nair`,
`rohan.mehta`. The SSM parameter is an **operations record**, not a runtime input: `scripts/provision-therapists.mjs` writes it and sets the Cognito password from it, and no application code reads it at
request time (checked across `apps/`, `packages/`, `scripts/`).

So rotation is two writes and **no redeploy**:

```bash
export TH=ananya.rao                          # or priya.nair, rohan.mehta
export POOL=ap-south-1_eaJaK7g4g
NEWPW="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 24)"

# 1. the record ops reads
aws ssm put-parameter --region "$AWS_REGION" \
  --name "/evia-beta/therapists/${TH}/password" \
  --type SecureString --value "$NEWPW" --overwrite \
  --query 'Version' --output text

# 2. the credential the portal actually checks
aws cognito-idp admin-set-user-password --region "$AWS_REGION" \
  --user-pool-id "$POOL" --username "${TH}@okuvu.in" \
  --password "$NEWPW" --permanent
```

Two details that will bite:

- The pool's sign-in attribute is **email** (`UsernameAttributes: ["email"]`, verified), which is what
  the therapist types. `list-users` returns an internal UUID as `Username` — if the email form above
  errors, resolve it and use the UUID:
  `aws cognito-idp list-users --region ap-south-1 --user-pool-id ap-south-1_eaJaK7g4g --query "Users[?Attributes[?Name=='email']|[0].Value=='${TH}@okuvu.in'].Username" --output text`
- `--permanent` matters. Without it Cognito issues a `FORCE_CHANGE_PASSWORD` state and the therapist
  lands on a change-password challenge they were not told about.

Verify by signing in as that therapist through the portal (`https://okuvu.in/auth`) — the only check
that proves the whole path. `scripts/verify-therapist-login.py` exists in the repo for scripted
verification.

The therapist **email addresses are personal data**: they appear nowhere in this document, and must not
be pasted into a ticket, a log line or this runbook. The SSM parameter names (`ananya.rao`, …) are the
identifiers to use.

### 5.4 If you rotate any of the other secrets

`evia-beta/portal-nextauth-secret` and `evia-beta/portal-cognito-client-secret` are consumed by the
portal task only (`valueFrom` references verified on `evia-beta-portal:24`); rotate at the issuer
(Cognito app client `7bcn376flgj7rt35a05a14pk7g` for the latter), write the new value with
`aws secretsmanager put-secret-value --secret-id <name> --secret-string file://…` (never on the command
line), then `--force-new-deployment` on `evia-beta-portal` alone. Rotating `NEXTAUTH_SECRET` signs every
therapist out; that is expected, not an incident. `evia-beta/brevo-api-key` (invite email) and
`evia-beta/worker-internal-auth` (api↔worker shared secret, consumed by **both** api and worker) follow
the same pattern with their respective restarts.

---

## 6. Clinical escalation route and helpline block

> # ⚠ UNAPPROVED-PENDING-CLINICAL-OWNER
>
> **Approval status: NOT APPROVED.** The launch backlog's clause for this runbook reads
> *"the clinical escalation route including the helpline block is documented **and approved by the
> clinical owner**"*. The route and the block are documented below and are accurate as of this commit;
> **the approval does not exist**, and no one in engineering can supply it. The clinical owner must
> read §6.1–6.5 and sign §6.6 before this section is in force.
>
> Related, and also open: **E17-S7** (clinical sign-off on agent copy and technique list) is
> `not_started` in `plan/run-ledger.psv`, and the contact table in
> `docs/supervised-beta/01-escalation-plan.md` §2 has never had names filled in. Until both are done,
> the honest statement is: *Okuvu has an escalation route that engineers can execute, and no clinical
> review of it.*

### 6.1 Categories and thresholds

Reused verbatim from `docs/supervised-beta/01-escalation-plan.md` (the supervised-beta plan), because
two escalation vocabularies in one product is how incidents get mis-triaged. Categories E1–E4 are the
clinical owner's; **E5 is added here** because it is what on-call actually sees first in this stack and
has no home in the original plan.

| # | Category | Trigger | First action |
| --- | --- | --- | --- |
| **E1** | Client in active crisis during a session | A crisis moment in a session, or the crisis path failing — crisis screen does not render, helpline call does not complete, or A1 clearly missed the client's distress | On-call notifies the clinical owner **by voice** immediately; the supervising therapist follows their own clinical protocol with the client. Never route the client to a ticket |
| **E2** | A2 produced clinically inappropriate content (encouraging harm, dismissing distress, fabricated clinical instruction) | Any single occurrence | **Stop that pair's sessions immediately.** Same-day escalation to the clinical owner. Preserve the turn (session id, turn number, text) from `Turn` — not from logs (no message text is logged, by standard) |
| **E3** | A1 safety-classification failure — false negative, or a false positive that blocks a benign turn | Any occurrence | Pause the affected pair; escalate to the clinical owner. A1 is the safety gate; a false negative is stop-ship for that participant |
| **E4** | App crash / session failure / WebSocket drop / turn loss breaking the session flow | Any P0 | Technical incident (§2). Fix and redeploy **before** further sessions for that pair |
| **E5** | **Sustained degraded service** — every turn served by a substitute constant (`MODEL_THROTTLED`, `MODEL_UNAVAILABLE`, `SAFETY_UNAVAILABLE`, `BUDGET_PAUSED`) while the platform looks healthy | More than a few minutes of `fallback_source != "none"`, or any `SAFETY_UNAVAILABLE_FALLBACK` at all | §3 diagnosis, then inform the clinical owner: a user in distress is receiving generic copy, and only the clinical owner may judge whether that is acceptable |

E5 exists because of §3.5: an api that is serving `MODEL_UNAVAILABLE_RESPONSE` looks perfect to every
alarm and to `/health`.

### 6.2 Route

```
user in distress / safety event
        │
        ├─(in-product, always available)──► HELPLINE BLOCK (§6.3) — served by the crisis path,
        │                                    the substitute constants, and the mobile CrisisOverlay,
        │                                    which renders offline
        │
        └─(observed)──► on-call engineer
                          │  1. open the incident, timestamp it (`date -u`), classify E1–E5 (§6.1)
                          │  2. for E1/E2/E3: notify the clinical owner immediately, by voice
                          │  3. for E1: the supervising therapist is the clinical actor — engineering
                          │     does not counsel, interpret, or advise the client
                          │  4. record: session id, turn id, safety_state, what the user received
                          ▼
                     clinical owner
                          │  decides: pause the pair / pause the beta / continue
                          ▼
                  resume requires: cause identified, fix deployed and verified,
                  pairs re-briefed, clinical owner's sign-off recorded
```

"What on-call may do" and "what on-call may not do" — this distinction is the point of the route:

| May | May not |
| --- | --- |
| Restore service (§2–§5), pause a pair's sessions at the clinical owner's instruction | Give clinical advice, interpret a user's risk, or reassure a distressed user personally |
| Read `SafetyState`, `SessionLog`, `Turn`, `AuditEvent` to establish what happened | Change the governed copy in `apps/api/src/pipeline/fallbacks.ts` — that is a review event, not an edit |
| Serve the existing substitute constants; they already name the helplines | Claim, imply, or write anywhere that the product or its copy is clinically reviewed |
| Escalate and wait | Delete or edit clinical rows to "clean up" — the audit chain is the record |

### 6.3 The helpline block (the thing being approved)

**Corrected 31 Oct 2026 by the clinical owner's signed sign-off (E17-S7).** The list below replaced the
earlier one on that date. The retired number 1860-2662-345 is gone everywhere, NIMHANS is no longer in
the approved set, and "Snehi" was the pack's misspelling of **Sneha, Chennai**. Tele-MANAS leads because
iCall is not 24×7 and must not be the first choice in a crisis.

| # | Service | Number | Notes |
| --- | --- | --- | --- |
| 1 | Tele-MANAS | **14416** | Toll-free, 24×7; also 1-800-891-4416 |
| 2 | Vandrevala Foundation | **+91 9999666555** | |
| 3 | Sneha, Chennai | **044-24640050** | |
| 4 | iCall (TISS) | **9152987821** | Mon–Sat, 8 am–9 pm. Not 24×7. Run by TISS, not IIT Bombay |
| 5 | Emergency Services | **112** | Not on the sign-off's list; served by the medical cards |

The list lives in one constant, `HELPLINE_INLINE` in `apps/api/src/pipeline/fallbacks.ts`, and is
interpolated into every fixed reply. The mobile `CrisisOverlay` is hardcoded (it renders offline,
deliberately, and is not rewired to the table), so it is the one place that must be edited in step with
the API — a test in `apps/api/src/__tests__/approved-copy.test.ts` pins the API side, and
`apps/mobile/test/crisis/crisis_overlay_test.dart` pins the app's names, numbers, order and iCall hours.

When the block is served in-product it is presented with this surrounding copy (the governed constant,
not paraphrasable — signed, and pinned paragraph-for-paragraph by that same test):

> *"I'm really glad you told me. What you are carrying sounds too much to hold alone. Please contact one
> of these right now: Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai:
> 044-24640050 iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm*
> *I would suggest that you let your therapist or someone you trust know."*

And when only a substitute reply is possible (model down, budget exhausted, safety classifier down),
the same four numbers, in the same order, are embedded in `MODEL_UNAVAILABLE_RESPONSE`,
`SAFETY_UNAVAILABLE_RESPONSE` and `BUDGET_PAUSED_RESPONSE`.

**The `CrisisResource` table is not read by any code path** (grep for the model: only its Prisma
definition). It was seeded with the old five rows by migration
`20260912170000_expand_crisis_resource_to_five` and is now stale. Nothing serves it, so nothing is
wrong on screen — but a future reader would take it for the approved list. Open item: correct or drop
the rows before anything is wired to that table.

**Two questions the sign-off leaves with the clinical owner**, both recorded in `evidence/E17-S7.md` and
not decided by the build: whether 112 should appear on the S4 card and the S3 reply at all (her text
names no emergency number, and the previous card did), and the exact iCall hours (she wrote
Mon–Sat 8 am–9 pm; TISS's own page says 10 am–8 pm).

**One copy decision the clinical owner should look at specifically:** the S2 variant of the model-down
reply (`A9_POST_S2_FALLBACK`) names **no** helpline — *"I'm right here with you, and I'm not going
anywhere. Take this at your own pace — I'm listening."* That is deliberate (the constant's comment says
an elevated-risk turn whose reply failed should ask even less of the user, and the crisis path at S4
carries the numbers), but it means an **S2 turn served during a model or quota outage receives a warm
reply and no number at all**. Approving the block as it stands approves that behaviour; if the clinical
owner wants a number on the S2 path, it is a copy change in `apps/api/src/pipeline/fallbacks.ts`, with
the same review weight as any other governed constant.

**What the clinical owner is being asked to approve:** that these five services are the right set for
the beta population, that the numbers are current, that naming them in a substitute reply (rather than
only on a dedicated crisis screen) is clinically appropriate, and the E1–E5 thresholds above. **What is
not being asked, and must not be inferred:** approval of the agent's clinical copy generally (that is
E17-S7), or of any public claim about clinical review (that is E20-S3).

Verify the numbers are still what production serves before relying on this table:

```bash
scripts/in-vpc-db-task.sh --sql \
  'select name, phone, "order" from "CrisisResource" order by "order";'
```

### 6.4 Contact channels

The roles are the supervised-beta plan's, unmodified. **The names in that table were never filled in**
(`docs/supervised-beta/01-escalation-plan.md` §2 lists `—` for all five), so the operational channels
today are:

| Role | Channel as it exists |
| --- | --- |
| Clinical owner (approver of this section; named as the clinical authority in `plan/ORCHESTRATION-v1.md` §6 item 4) | The ops contact sheet, not this document. Personal contact details are deliberately not committed to a public repository |
| On-call engineer | Whoever holds the current on-call rota; alarms do not page (§1) — the rota is a human arrangement |
| Beta therapists (3, seeded, `CONFIRMED`) | `https://okuvu.in/auth`, accounts in pool `ap-south-1_eaJaK7g4g`. Their addresses are personal data and are **masked** everywhere in this repo (`a***@okuvu.in`) |
| Product owner | Via the ops contact sheet; also holds the Google Cloud login needed for §5.2 |

This table is thin because it is. `docs/supervised-beta/01-escalation-plan.md` also predates the AWS
cutover and still names Neon, Cloud Run and GCP Error Reporting as the intervention surfaces; treat its
§3 as stale and use §2–§5 of *this* document for the technical half.

### 6.5 If an E1 happens before approval is signed

The route is unapproved, but a user in distress is not an abstraction:

1. The **in-product helpline block** (§6.3) is already live and does not depend on this approval — it
   is served by the crisis path and by every substitute constant.
2. Notify the clinical owner **today**, by voice, with the incident record.
3. Do **not** improvise clinical guidance to the user, and do not add, remove or reword a helpline.
4. Record the gap in the incident note: *"escalation route unapproved at the time of the incident
   (E20-S2 §6, UNAPPROVED-PENDING-CLINICAL-OWNER)"*. That sentence is the honest record, and it is the
   finding that should block the pilot's go/no-go, not something to paper over.

### 6.6 Sign-off (blank until a human signs)

| Field | Value |
| --- | --- |
| Section | §6 Clinical escalation route and helpline block |
| Status | **UNAPPROVED-PENDING-CLINICAL-OWNER** |
| Clinical owner (name) | — |
| Approved on (date, UTC) | — |
| Signature / written approval reference | — |
| Scope approved | E1–E5 thresholds (§6.1), route (§6.2), helpline set and surrounding copy (§6.3) |
| Explicitly **not** covered by this signature | Agent clinical copy (E17-S7), public clinical claims (E20-S3) |

---

## 7. What this runbook does not cover

1. **Nothing pages a human.** §1. Confirming the SNS email subscription is a one-click owner action
   and the single highest-value fix available today.
2. **No alarm on model degradation** (§3.5) — the failure mode that is invisible to every alarm.
3. **Restoring over production / PITR** (§4.4) — not drilled, not documented, do not improvise.
4. **The therapist portal's own database TLS path.** `apps/therapist-portal/src/lib/prisma.ts` builds
   its pool the same way the api did before the `sslmode` fix; `evidence/E16-S4.md` §7 records it as
   untouched. If the portal starts erroring on queries while `/api/health` stays 200, that is the first
   thing to suspect — and it is a code fix, not a runbook step.
5. **Worker failures.** There is no worker target group and no worker health check in CloudWatch beyond
   `RunningTaskCount`; summary generation can fail silently. `aws logs tail /ecs/evia-beta/worker` is
   the only signal.
6. **Clinical approval** (§6.6). The one clause of E20-S2 that cannot be met by this repository's
   author.
7. **Rollback of a migration.** `prisma migrate deploy` runs in every build; a task-definition rollback
   does not reverse schema changes. If a bad migration shipped, the database path is §4 (restore to a
   scratch instance and compare), and the decision to restore *over* production belongs to the on-call
   owner with the clinical owner informed.

---

## 8. How this document was verified

Every **read-only** `aws` command above was executed against account `562654496378` in `ap-south-1` on
2026-10-29 between 15:28Z and 15:40Z. The mutating commands — `ecs update-service`,
`rds modify-db-instance`, `secretsmanager put-secret-value`, `ssm put-parameter`,
`cognito-idp admin-set-user-password` — were **not** run: pointing them at production to prove a runbook
would itself be an incident. They were checked as commands (argument shapes, derived values, service and
resource names from live `describe-*` output), and the one piece of logic that could silently corrupt a
secret — the URI rewrite in §5.1 — was dry-run against the live payload.

The transcript, including the state that changed underneath the run (a `develop` build rolled api
`25 → 26`, worker `25 → 26`, portal `23 → 24` while the document was being written), is in
`evidence/E20-S2.md`. The URLs were fetched live. The CloudWatch Logs Insights queries were run and
returned zero rows, which is the expected healthy result, not a failure of the query.

Re-verify before trusting §0's identifiers after any Terraform change:

```bash
aws ecs describe-services --region ap-south-1 --cluster evia-beta \
  --services evia-beta-api evia-beta-worker evia-beta-portal \
  --query 'services[].[serviceName,taskDefinition,runningCount]' --output text
aws elbv2 describe-target-groups --region ap-south-1 \
  --query 'TargetGroups[].[TargetGroupName,TargetGroupArn,HealthCheckPath]' --output text
aws cloudwatch describe-alarms --region ap-south-1 --alarm-name-prefix evia-beta \
  --query 'MetricAlarms[].[AlarmName,StateValue]' --output text
aws sns list-subscriptions-by-topic --region ap-south-1 --topic-arn "$OPS_TOPIC" \
  --query 'Subscriptions[].[Protocol,SubscriptionArn]' --output text
```
