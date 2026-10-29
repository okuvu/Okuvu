# Okuvu — Security & DPDP checklist (E16-S7)

Story, verbatim: *"A written checklist confirms TLS-only traffic, secrets in SSM rather than env files,
no personal data in log output, a stated retention period and a deletion path that is exercised once and
observed to remove the record."*

| | |
|---|---|
| Checklist revision | **rev 2 — 2026-10-29T15:46Z**, re-derived against the live stack |
| Supersedes | rev 1 of 2026-10-29T05:15Z, shipped in `99dd1ac` (which recorded FAIL on items 3 and 5) |
| Branch | `feat/E16-S7-dpdp2`, from `origin/develop` `6de0209` |
| Evidence | `evidence/E16-S7.md` — every `[Ex]` below is a section there with the raw command and output |
| Environment | AWS `562654496378`, `ap-south-1`; ECS cluster `evia-beta`; ALB `evia-beta-alb`; hosts `okuvu.in`, `www.okuvu.in`, `portal.okuvu.in`, `api.okuvu.in`, `beta.api.okuvu.in` |
| Exercised | 2026-10-29T15:28:45Z → 15:46:12Z against the live beta stack, deployed image `0f54ff687210` (api `:25`, portal `:23`, worker `:25`) |
| Redaction | No real email, name, phone or client record appears in this file or its evidence. The three seeded therapists are `T1`…`T3` (`a***@okuvu.in` etc.); the synthetic probe is `1111…1111`. |

## Verdict

| # | Requirement | rev 1 | **rev 2** | Basis |
|---|---|---|---|---|
| 1 | TLS-only traffic | PASS | **PASS** | §1, `[E1]`–`[E6]` |
| 2 | Secrets in SSM/Secrets Manager rather than env files | PARTIAL | **PARTIAL** | §2, `[E8]`–`[E11]`: runtime is clean; one real Google OAuth client secret is still in the history of the **public** repo `okuvu/Okuvu` |
| 3 | No personal data in log output | FAIL | **PENDING-DATE** | §3, `[E12]`–`[E16]`: the fix is deployed and every post-fix window scans clean, but the criterion's literal *24-hour zero* cannot hold until the pre-fix events age out — measured expiry **2026-11-12T05:37:37Z** |
| 4 | A stated retention period | PARTIAL | **PARTIAL** | §4, `[E17]`–`[E20]`: both gaps named in rev 1 are closed below; clinical records still have no retention period |
| 5 | Deletion path exercised once, record observed removed | FAILED | **PASS** | §5, `[E21]`–`[E30]`: 24 probe rows across 22 tables → 0 left, tombstone stripped of every direct identifier, baseline restored |

**Story-level status: PARTIAL.** Two of rev 1's three failing items are closed. The open clauses, without
softening:

1. **Item 2 — a real credential in public git history.** `GOOGLE_CLIENT_SECRET="GOCSPX-…"` sits in
   `apps/test-harness/.env.example` at `0a724b0`, in every ref of `okuvu/Okuvu`, and the repository is
   **public** (`"private": false`) `[E11]`. Rev 1 recorded this; rev 2 confirms it is unchanged and now
   worse by context. The fix (revoke in GCP, then rewrite-or-accept) is E16-S8 and is a console action,
   not a repo change.
2. **Item 3 — the literal 24-hour zero.** Measured, not estimated: the newest personal-data event still
   inside the 14-day window is at `2026-10-29T05:37:37Z`, so `--hours 24` returns hits until
   **2026-11-12T05:38Z**. PENDING-DATE, not PASS.
3. **Item 4 — clinical retention.** No code ages out `Turn`, `SessionSummary`, `JournalEntry`,
   `TherapistNote`, `MoodLog` or `Appointment`. The privacy page says so in as many words. That is a
   clinical/legal decision, not an engineering one.

Everything else rev 1 failed is now fixed and observed on the live stack, not argued from source.

---

## 1. TLS-only traffic — **PASS**

Re-confirmed rather than copied: listeners read fresh, and a TLS 1.1 handshake attempted from this host at
`15:28Z`.

- [x] Exactly two listeners on `evia-beta-alb`: **443/HTTPS** with `ELBSecurityPolicy-TLS13-1-2-2021-06`
      and default action `forward`; **80/HTTP** whose only default action is `redirect` `[E1]`.
- [x] The HTTP listener has no forward action and no rules, so nothing can be served in plaintext `[E1]`.
- [x] HTTP→HTTPS is `301` with the host preserved on **5/5** names — `okuvu.in`, `www.okuvu.in`,
      `portal.okuvu.in`, `api.okuvu.in`, `beta.api.okuvu.in` `[E5]`.
- [x] **TLS 1.1 is refused** on `api.okuvu.in`, `okuvu.in` and `portal.okuvu.in`:
      `tlsv1 alert protocol version`, `SSL alert number 70`, no certificate returned `[E6]`.
- [x] TLS 1.2 connects (`ECDHE-RSA-AES128-GCM-SHA256`) and TLS 1.3 connects
      (`TLS_AES_128_GCM_SHA256`), so the refusal is policy, not an outage `[E6]`.
- [x] One ACM certificate (`CN=okuvu.in`, Amazon RSA 2048 M04, valid 2026-10-28 → **2027-05-13**) carries
      all five SANs; the 443 listener is the only TLS endpoint `[E3]`.
- [x] On the 443 listener a priority-10 host rule (`okuvu.in`, `www.okuvu.in`, `portal.okuvu.in`) forwards
      to the portal and the default action forwards to the API, so both services share the one TLS
      endpoint `[E2]`. All five names resolve to exactly the load balancer's two IPs and nothing else —
      nothing sits in front of it `[E4]`.
- [ ] **Not satisfied (hardening, unchanged):** no `Strict-Transport-Security` header on `okuvu.in`,
      `portal.okuvu.in` or `api.okuvu.in` `[E7]`. TLS-only at the listener is met; a first visit over
      `http://` still relies on the 301. Low severity — recorded, not glossed.

## 2. Secrets in SSM/Secrets Manager rather than env files — **PARTIAL**

- [x] Six secrets in **AWS Secrets Manager**, listed by name with rotation state and no value read:
      `evia-beta/{database, brevo-api-key, portal-nextauth-secret, portal-cognito-client-secret,
      worker-internal-auth, android-upload-keystore}`; `RotationEnabled = None` on all six `[E8]`.
- [x] Three therapist passwords are SSM **`SecureString`** under
      `/evia-beta/therapists/{name}/password` `[E8]`.
- [x] Every credential-shaped variable in the three live task definitions arrives through
      `secrets[].valueFrom`, never `environment[]` `[E9]`:
      `DATABASE_URL`, `WORKER_INTERNAL_AUTH_SECRET` (api `:25`, worker `:25`);
      `DATABASE_URL`, `NEXTAUTH_SECRET`, `COGNITO_THERAPIST_CLIENT_SECRET`, `BREVO_API_KEY` (portal `:23`).
- [x] `environment[]` holds configuration and identifiers only. Two spot-checked again this run:
      `REDIS_URL = rediss://master.…:6379` (no userinfo, no password) and `CONTACTS_KMS_KEY_ARN` is an
      ARN, not a key `[E9]`.
- [x] No `.env` with real values in the tree — three `.env.example` files; `git grep` for `GOCSPX-` over
      `origin/develop`'s tree hits only documentation that mentions the pattern, never a live value `[E10]`.
- [ ] **FAILED (rev 1, unchanged):** git history contains a **real Google OAuth client secret** —
      `GOOGLE_CLIENT_SECRET="GOCSPX-…"` (35 chars) with its client id, added at `0a724b0` (2026-09-06)
      and deleted at `06424dc` (2026-10-28). It survives in `develop`, every branch and every clone.
      **The repository `okuvu/Okuvu` is public** — the GitHub API returns
      `{"private": false, "visibility": "public"}` `[E11]`. Nothing in the repo shows the credential was
      revoked `[E11]`.
- [ ] **Not satisfied (hardening):** no rotation on any of the six secrets `[E8]`.
- [ ] **Not satisfied (hardening):** Redis has no AUTH token; reachable only from the VPC security group
      over `rediss://`, so defence-in-depth `[E9]`.

**Why this cannot be closed from the repo:** revoking the OAuth client is a GCP console action, and a
history rewrite changes every commit hash of a public repository — both are E16-S8. This checklist states
the exposure rather than papering over it.

## 3. No personal data in log output — **PENDING-DATE**

The code fix is deployed (log redaction in `53b9860`, live in image `0f54ff687210`) and the criterion's
*behaviour* is met on every post-fix window. The *literal* 24-hour zero is a calendar problem: CloudWatch
still holds the pre-fix events, and no code change can remove them early without destroying the audit trail.

| Window | Events | Result |
|---|---|---|
| Pre-fix residue, `--hours 24` at 15:31Z | 17,952 | **53 hits** — 24 portal sign-in lines + 3 api probe rows (email/name/phone) `[E13] [E14]` |
| Fresh window with real activity, 15:29:30 → 15:30:20Z | 16 | **0 hits**, exit 0 `[E16]` |
| Full probe window, 15:28:30 → 15:46:12Z (3 therapist sign-ins, 10 in-VPC SQL runs, one 401 and one 200 on `/account/delete`) | **388** | **0 hits**, exit 0 `[E16]` |

- [x] Portal sign-in no longer writes the address. Three real sign-ins at `15:29:44Z`/`:48Z`/`:51Z`
      produced exactly
      `[AUTH] Successful sign-in therapist=t_e9416a7dc315` (and `t_6b3364c90154`, `t_7d4ab909bc04`) —
      reference tokens, stable per therapist, no address and not even the domain `[E12]`.
- [x] `scripts/verify-therapist-login.py --all` signed in **all three** seeded therapists to a 200
      dashboard with a session bound to that therapist, so the clean scan covers real activity, not an
      idle window `[E12]`.
- [x] The in-VPC query runner no longer prints row bodies: every `counts.sql`, tombstone and `--sql`
      result in this run was counts or already-redacted, and the 388-event scan over those runs is clean
      `[E16]`.
- [x] The delete path logs one pseudonymous line,
      `{"event":"account_deleted","user_id":"<uuid>","erased":{…},"msg":"Account deleted"}` — an internal
      UUID, no address, no name `[E27]`.
- [x] The scanner is committed, its pattern set is documented in its docstring, and it **fails** (exit 1)
      rather than warns; `--list-patterns` prints the set `[E15]`.
- [ ] **PENDING-DATE — the literal 24-hour zero.** Measured from the log groups themselves: portal pre-fix
      lines span `2026-10-29T03:32:27Z` → `04:11:04Z`; api probe rows at `03:37:15Z`, `03:42:03Z` and the
      newest at **`05:37:37Z`**. With 14-day retention the last of these expires
      **2026-11-12T05:37:37Z**, so a `--hours 24` scan returns zero from `2026-11-12T05:38Z` — provided
      no unpatched checkout writes another probe row before then. Rev 1 estimated 10–11 November; the
      measured date is a day later because the newest event is `05:37Z`, not `04:11Z` `[E13] [E14]`.
- [ ] **Residual, recorded not hidden:** Fastify's request log includes `remoteAddress` (the caller's IP)
      on every request `[E27]`. The scanner's documented pattern set covers email, phone and name, not
      IPs; under a strict reading of DPDP §2(t) an IP is personal data.

## 4. A stated retention period — **PARTIAL**

Published policy (`apps/therapist-portal/src/app/privacy/page.tsx` §9) is unchanged and honest: it states
the clinical gap rather than inventing a number `[E20]`.

| Data | Published | Actually configured (verified by CLI this run) | Verdict |
|---|---|---|---|
| Application / worker / portal logs | 14 days | 14 days on `/ecs/evia-beta/{api,worker,portal}` `[E17]` | match |
| VPC flow logs | 14 days | 14 days on `/vpc/evia-beta/flow` `[E17]` | match |
| Build logs | not itemised | 14 days on `/aws/codebuild/evia-beta-build` `[E17]` | match |
| Container Insights | not itemised | 1 day on `/aws/ecs/containerinsights/evia-beta/performance` `[E17]` | match |
| **Postgres server logs** | 14 days ("server and network logs") | **14 days** on `/aws/rds/instance/evia-beta-postgres/postgresql` — was `None` (never expires) at the start of this run | **match — gap closed this run** |
| ALB access logs | not itemised | S3 lifecycle `Expiration: 90 days` `[E19]` | match |
| RDS automated backups | 7 days | `BackupRetentionPeriod = 7`, encrypted, not public, deletion protection on; 3 automated snapshots inside that window `[E18]` | match |
| Manual snapshot `evia-beta-premigrate-202610281906` | not stated | no native expiry; **retained under a written, tagged decision** (§4.2) `[E18]` | **decided — gap closed this run** |
| Beta harness / evaluation data | 90 days, dry-run default | `POST /cleanup/beta-retention`, no scheduled invocation `[E20]` | match, manual only |
| Deleted-account tombstone | indefinite | indefinite, and now stripped of every direct identifier (§5) `[E28]` | match |
| Clinical records | "until you delete them" | **no expiry of any kind**; no purge job exists `[E20]` | **undefined — open** |

### 4.1 The log-group gap, fixed

At `15:31:51Z` the RDS log group was the only group in the account with no retention:

```
$ aws logs describe-log-groups --query 'logGroups[?retentionInDays==null].[logGroupName]' --output json
[["/aws/rds/instance/evia-beta-postgres/postgresql"]]
$ aws logs put-retention-policy \
    --log-group-name /aws/rds/instance/evia-beta-postgres/postgresql --retention-in-days 14
$ aws logs describe-log-groups --log-group-name-prefix /aws/rds/instance/evia-beta-postgres/postgresql \
    --query 'logGroups[].[logGroupName,retentionInDays]' --output text
/aws/rds/instance/evia-beta-postgres/postgresql	14
```

Applied and re-read from the API afterwards `[E17]`. Idempotent and non-destructive: it sets an expiry, it
deletes nothing. The 74 KB currently stored is startup/checkpoint output from `2026-10-28T08:33Z`; those
events expire from `2026-11-11T08:33Z` onward.

Rev 1 also named `/aws/codebuild/evia-beta-conn-test` as unbounded. **That group no longer exists** — the
account has seven groups and the CodeBuild one is `/aws/codebuild/evia-beta-build` at 14 days. So the count
of unbounded log groups is **1 before this run, 0 after** — not 2. Recorded as measured, not as the old
text said `[E17]`.

If the group is ever recreated by Terraform, the HCL that keeps it at 14 days is:

```hcl
resource "aws_cloudwatch_log_group" "rds_postgresql" {
  name              = "/aws/rds/instance/${aws_db_instance.postgres.identifier}/postgresql"
  retention_in_days = 14
}
```

**Also recorded:** `log_min_duration_statement = 1000` on `evia-beta-postgres16`, with `log_statement`
unset. Statements slower than 1 s are therefore logged **with their text**, which can include literal
values. No such line exists in the group today (startup/checkpoint output only), but it is a latent PII
channel into a log group the published policy covers. Either turn it off and rely on `auto_explain`, or
accept it in writing `[E17]`.

### 4.2 The snapshot gap, decided in writing

`evia-beta-premigrate-202610281906` (2026-10-28T19:06:20Z, 20 GiB, encrypted) has no native expiry; RDS
manual snapshots never expire on their own. It is **deliberately retained**:

- **Why:** it is the rollback point for the beta schema migration and the restore-drill evidence. Deleting
  it would remove both the drill artefact and the only pre-migration restore path.
- **What it can contain:** nothing belonging to a current subject. The earliest `Therapist` row is
  `2026-10-29T03:37:15Z` and the earliest `User` row `2026-10-29T05:01:34Z`, both **after** the snapshot,
  so no live account or therapist row can be inside it `[E18]`. It is not provably empty of pre-19:06
  rows, so this is a decision, not an assumption of cleanliness.
- **Until when:** retained until **2026-11-27T19:06Z** (30 days) — until the beta migration has run a
  month without a rollback need.
- **Who reviews:** the Okuvu data-protection owner, at the fortnightly security review; the date is on the
  snapshot so the review cannot miss it.
- **Recorded on the resource**, not only here:

```
$ aws rds add-tags-to-resource --resource-name arn:aws:rds:ap-south-1:562654496378:snapshot:evia-beta-premigrate-202610281906 \
    --tags Key=dpdp:class,Value=approved-exception \
           Key=dpdp:retention-decision,Value=retain-as-beta-migration-rollback-point \
           Key=dpdp:review-by,Value=2026-11-27 Key=dpdp:owner,Value=okuvu-data-protection
$ aws rds list-tags-for-resource --resource-name …:snapshot:evia-beta-premigrate-202610281906
"dpdp:review-by": "2026-11-27"        "dpdp:class": "approved-exception"
"dpdp:retention-decision": "retain-as-beta-migration-rollback-point"
```

The privacy page's backup sentence still says *"A deleted row can persist inside a backup for up to
[7 days]"*, which describes the automated-backup window and not this snapshot. Because the snapshot
predates every account, the sentence is not wrong about any real subject today; if that stops being true
the page must name the snapshot's date too `[E18] [E20]`.

## 5. Deletion path exercised once, record observed removed — **PASS**

Exercised **against the deployed code over HTTPS**, not in-process: image `0f54ff687210` (api `:25`),
`/health` reporting `commit 0f54ff687210`, and `53b9860` (the cascade fix) verified as an ancestor of that
commit `[E21]`. A synthetic client in the client pool `[E22]`, its own `USER_PASSWORD_AUTH` ID token, then
`POST https://api.okuvu.in/account/delete` → `HTTP 200 {"success":true}` in 0.33 s `[E25]`.

24 synthetic rows were placed across **22 tables** (the `User` row + 21 subject tables), the delete was
called once, and every table was counted before and after `[E23] [E24] [E26]`.

| table | baseline total | probe rows inserted | probe rows left | final total |
|---|---|---|---|---|
| Appointment | 0 | 1 | **0** | 0 |
| BetaConsent | 0 | 1 | **0** | 0 |
| ClinicalAccessLog | 19 | 1 | **0** | 19 |
| ClinicalConfig | 0 | 1 | **0** | 0 |
| EmergencyContact | 0 | 1 | **0** | 0 |
| EngagementProfile | 0 | 1 | **0** | 0 |
| GovernanceLog | 0 | 1 | **0** | 0 |
| Homework | 0 | 1 | **0** | 0 |
| InviteToken | 0 | 1 | **0** | 0 |
| JournalEntry | 0 | 1 | **0** | 0 |
| MoodLog | 0 | 1 | **0** | 0 |
| Reminder | 0 | 2 | **0** | 0 |
| SafetyState | 1 | 1 | **0** | 1 |
| SessionLog | 3 | 1 | **0** | 3 |
| SessionSummary | 0 | 1 | **0** | 0 |
| TherapistClient | 1 | 1 | **0** | 1 |
| TherapistNote | 3 | 1 | **0** | 3 |
| Turn | 10 | 2 | **0** | 10 |
| User (tombstone) | 1 | 1 | 1 (retained, stripped) | 1 |
| UserMemory | 0 | 1 | **0** | 0 |
| UserToolPreference | 0 | 1 | **0** | 0 |
| WaitlistEntry | 0 | 1 | **0** | 0 |
| AuditEvent (retained by design) | 1 | 0 | 0 | 1 |
| Therapist (seed) | 3 | 0 | 0 | 3 |

- [x] **Zero rows referencing the subject remain** in all 21 subject tables `[E26]`. Rev 1's 9 leftovers
      (`JournalEntry`, `TherapistNote`, `Homework`, `Reminder`, `Appointment`, `ClinicalAccessLog`,
      `TherapistClient`, `UserMemory`, `InviteToken`) are gone, as are `UserToolPreference`,
      `GovernanceLog`, `BetaConsent` and `WaitlistEntry` — the three with no FK to `User`.
- [x] The erase is visible from outside: the api logged
      `{"event":"account_deleted","user_id":"…","erased":{"governanceLog":1,"reminder":2,
      "userToolPreference":1,"journalEntry":1,…,"waitlistEntry":1},"msg":"Account deleted"}` — 21 tables
      with non-zero counts `[E27]`.
- [x] **The tombstone holds no direct identifier.** `email`, `full_name`, `date_of_birth` and `gender`
      are NULL, `phone_number` is `''`, `auth_subject` is `deleted-<uuid>` (44 chars), `deleted_at` is
      stamped, and the count of rows still carrying any direct identifier is **0** `[E28]`.
- [x] Unauthenticated control on the same route returns `401 Missing Authorization header`, so the 200 was
      authentication-gated `[E25]`.
- [x] Cleanup restored the baseline **exactly** — all 24 table totals identical to the pre-probe census,
      `probe_rows = 0` everywhere, therapists never left 3 — and the Cognito probe user was deleted
      (`UserNotFoundException` on re-read) `[E29] [E30]`.
- [x] The whole probe left no PII in the logs: the 388-event window containing it scans clean `[E16]`.

**What this does not prove:** `WaitlistEntry` and `BetaConsent` match on the identifiers the probe seeded
(the synthetic email and phone), so those two paths are proven for seeded identifiers only. The 18
`onDelete: Cascade` FKs from E16-S10 are also still **not applied to beta** — the erasure path does not
need them because the tombstone row is retained, but a future hard delete would. `prisma migrate deploy`
on beta remains the orchestrator's step `[E21]`.

---

## 6. Gaps that block sign-off

| # | Gap | Item | Sev | Status | Closes when |
|---|---|---|---|---|---|
| G1 | Real `GOCSPX-` Google OAuth client secret in public git history (`0a724b0`, every ref, repo public) | 2 | **Critical** | open (E16-S8) | Revoke the client in GCP; then rewrite history or record an accepted risk with the revocation date |
| G2 | Literal 24-hour-zero log scan impossible until the pre-fix events expire | 3 | Medium | **PENDING-DATE** | Automatically at 2026-11-12T05:38Z; re-run `--hours 24` then |
| G3 | Clinical records have no retention period | 4 | High | open | Clinical/legal decision, a purge job, and a published number |
| G4 | No rotation on the six Secrets Manager secrets | 2 | Medium | open | Rotation for `database` first, then the rest |
| G5 | `log_min_duration_statement = 1000` logs slow-query text into a 14-day group | 3/4 | Medium | open | Raise the threshold or accept in writing |
| G6 | Redis has no AUTH; `evia-beta-uploads` has no expiry on current object versions | 2/4 | Low | open | `AUTH` on the replication group; a lifecycle rule for current versions |
| G7 | No HSTS header | 1 | Low | open | `Strict-Transport-Security: max-age=63072000; includeSubDomains` |
| G8 | Fastify logs the caller IP (`remoteAddress`) | 3 | Low | open | Drop it or truncate to /24, or state IP retention in the policy |
| G9 | Cascade migration not applied to beta | 5 | Low | open | `prisma migrate deploy` on beta |

Closed since rev 1: therapist email in the sign-in log (rev 1 G1), probe rows logged by
`in-vpc-db-task.sh` (rev 1 G2), 9 tables + name/email left by deletion (rev 1 G3), the unbounded
`/aws/rds/.../postgresql` log group (rev 1 G7), and the undecided `evia-beta-premigrate-202610281906`
(rev 1 G8).

## 7. Reproduce

```bash
# 1. TLS (item 1)
ALB=$(aws elbv2 describe-load-balancers --names evia-beta-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text)
aws elbv2 describe-listeners --load-balancer-arn "$ALB" \
  --query 'Listeners[].{Port:Port,Proto:Protocol,Policy:SslPolicy,Act:DefaultActions[0].Type}' --output json
for h in okuvu.in www.okuvu.in portal.okuvu.in api.okuvu.in beta.api.okuvu.in; do
  curl -s -o /dev/null -w "$h %{http_code} -> %{redirect_url}\n" http://$h/
done
echo | openssl s_client -connect api.okuvu.in:443 -servername api.okuvu.in -tls1_1 \
  -cipher 'DEFAULT@SECLEVEL=0' 2>&1 | head -2        # expect "alert protocol version", alert 70
echo | openssl s_client -connect api.okuvu.in:443 -servername api.okuvu.in -tls1_2 2>&1 | grep 'Cipher is'

# 2. Secrets (item 2) — names only, never values
aws secretsmanager list-secrets --query 'SecretList[].[Name,RotationEnabled]' --output text
aws ssm describe-parameters --query 'Parameters[].[Name,Type]' --output text
aws ecs describe-task-definition --task-definition evia-beta-api:25 \
  --query 'taskDefinition.containerDefinitions[0].secrets[].[name,valueFrom]' --output text
curl -s https://api.github.com/repos/okuvu/Okuvu | jq '.private, .visibility'
git log --all --oneline -S'GOCSPX-' -- apps/test-harness/.env.example

# 3. Logs (item 3) — generate real activity first, then scan it
AWS_REGION=ap-south-1 python3 scripts/verify-therapist-login.py --all
python3 scripts/log-pii-scan.py --start 2026-10-29T15:29:30Z --end "$(date -u +%Y-%m-%dT%H:%M:%SZ)"  # expect exit 0
python3 scripts/log-pii-scan.py --hours 24                                                         # exit 1 until 2026-11-12

# 4. Retention (item 4)
aws logs describe-log-groups --query 'logGroups[?retentionInDays==null].[logGroupName]' --output json  # expect []
aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,BackupRetentionPeriod,DeletionProtection]'
aws rds describe-db-snapshots --snapshot-type manual --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime]'
aws rds list-tags-for-resource --resource-name \
  arn:aws:rds:ap-south-1:562654496378:snapshot:evia-beta-premigrate-202610281906

# 5. Deletion (item 5) — re-runnable; touches only the fixed synthetic probe id
#    Throwaway user: client pool ap-south-1_y2V0jvjGP, app client evia-beta-mobile,
#    USER_PASSWORD_AUTH via `aws cognito-idp initiate-auth`.
SUB=<cognito sub>
sed "s/@@SUB@@/$SUB/" scripts/dpdp-deletion-probe/insert.sql > /tmp/insert.filled.sql
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql           # baseline
bash scripts/in-vpc-db-task.sh --sql-file /tmp/insert.filled.sql                           # insert 24 rows
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql           # before
curl -sS -X POST https://api.okuvu.in/account/delete --config /tmp/curl.cfg                # {"confirm":true}
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql           # after: only User = 1
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/tombstone-counts.sql # k1..k9
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/cleanup.sql
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql           # must equal baseline
aws cognito-idp admin-delete-user --user-pool-id ap-south-1_y2V0jvjGP --username <probe phone>
```

## 8. Revision history

| Rev | When | Shipped in | What changed |
|---|---|---|---|
| 1 | 2026-10-29T05:15Z | `99dd1ac` | First derivation. Items 3 and 5 FAIL; items 2 and 4 PARTIAL. |
| 2 | 2026-10-29T15:46Z | this commit | Re-derived end to end against `0f54ff687210`. Item 3 → PENDING-DATE (fix deployed, dated expiry measured). Item 5 → PASS (live HTTPS probe, 24 rows across 22 tables, tombstone stripped). Item 4: RDS log-group retention set to 14 d and verified; premigrate snapshot retention decided, dated and tagged. Item 2 unchanged, and worse by context: the repo is public. |
