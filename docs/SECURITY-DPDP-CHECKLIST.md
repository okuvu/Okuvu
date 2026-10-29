# Okuvu — Security & DPDP checklist (E16-S7)

Story, verbatim: *"A written checklist confirms TLS-only traffic, secrets in SSM rather than env files,
no personal data in log output, a stated retention period and a deletion path that is exercised once and
observed to remove the record."*

| | |
|---|---|
| Branch / commit | `feat/E16-S7-dpdp` — see `git log -1` for the sha this file shipped in |
| Evidence | `evidence/E16-S7.md` — every `[Ex]` below is a section there with the raw command and output |
| Environment | AWS `562654496378`, `ap-south-1`; ECS cluster `evia-beta`; ALB `evia-beta-alb`; hosts `okuvu.in`, `www.okuvu.in`, `portal.okuvu.in`, `api.okuvu.in` |
| Exercised | 2026-10-29T04:55Z → 05:15Z against the live beta stack |
| Depends on | E16-S3 (production Cognito, three therapist accounts) — verified |

## Verdict

| # | Requirement | Result |
|---|---|---|
| 1 | TLS-only traffic | **PASS** |
| 2 | Secrets in SSM/Secrets Manager rather than env files | **PARTIAL** — runtime is clean; git history holds one real Google OAuth client secret |
| 3 | No personal data in log output | **FAIL** — full therapist email on every portal sign-in |
| 4 | A stated retention period | **PARTIAL** — stated and mostly true; clinical retention undefined, two log groups unbounded |
| 5 | Deletion path exercised once, record observed removed | **FAILED (partial deletion)** — 8 of the 18 `User`-referencing tables erased, 9 left behind, and the tombstone row keeps the client's name and email |

**A story-level sign-off is not possible on this evidence.** Items 3 and 5 fail outright; items 2 and 4
pass their letter and fail part of their intent. The specific closers are in §6.

---

## 1. TLS-only traffic — **PASS**

- [x] The only HTTPS listener uses a modern security policy:
      `ELBSecurityPolicy-TLS13-1-2-2021-06` on port 443 `[E1]`.
- [x] There is exactly one listener on port 443 and one on port 80; the port-80 listener's *only*
      action is a redirect — it has no forward action and no rules, so no request can be served in
      plaintext `[E1]`.
- [x] HTTP→HTTPS redirect is live on **every** hostname, `301`, host preserved:
      `okuvu.in`, `www.okuvu.in`, `portal.okuvu.in`, `api.okuvu.in`, `beta.api.okuvu.in` — 5/5 `[E5]`.
- [x] TLS **1.0** and **1.1** cannot connect. `openssl s_client -tls1_1` (client made willing with
      `-cipher DEFAULT@SECLEVEL=0`) is refused by the server with alert 70 `protocol_version`, 7 bytes
      read, no certificate, on `api.okuvu.in`, `okuvu.in` and `portal.okuvu.in` `[E6]`.
- [x] TLS 1.2 and 1.3 do connect (`ECDHE-RSA-AES128-GCM-SHA256` / `TLS_AES_128_GCM_SHA256`), so the
      refusal above is a policy, not an outage `[E6]`.
- [x] One ACM certificate covers all five names, valid to 2027-05-13; no stale certificate is attached
      to the 443 listener and none to port 80 `[E3]`.
- [x] All five DNS names are alias records to this one internet-facing ALB — nothing sits in front of it
      and no name points anywhere else. On the 443 listener the priority-10 host rule sends
      `okuvu.in`/`www.okuvu.in`/`portal.okuvu.in` to the portal target group and the default action sends
      everything else to the API, so both services share the one TLS endpoint `[E2] [E4]`.
- [ ] **Not satisfied (recorded, hardening):** no `Strict-Transport-Security` header on `okuvu.in`,
      `portal.okuvu.in` or `api.okuvu.in`. TLS-only at the listener is met; a first visit over `http://`
      relies solely on the 301 `[E7]`.

## 2. Secrets in SSM/Secrets Manager rather than env files — **PARTIAL**

- [x] Every secret the stack uses is in **AWS Secrets Manager**, listed by name with no value read:
      `evia-beta/{database, brevo-api-key, portal-nextauth-secret, portal-cognito-client-secret,
      worker-internal-auth, android-upload-keystore}` `[E8]`.
- [x] The three therapist passwords are SSM **`SecureString`** parameters under
      `/evia-beta/therapists/<user>/password` `[E8]`.
- [x] Every credential-shaped variable in the three live task definitions is injected via
      `secrets[].valueFrom`, not `environment[]`:
      `DATABASE_URL`, `WORKER_INTERNAL_AUTH_SECRET` (api, worker);
      `DATABASE_URL`, `NEXTAUTH_SECRET`, `COGNITO_THERAPIST_CLIENT_SECRET`, `BREVO_API_KEY` (portal) `[E9]`.
- [x] The plaintext `environment[]` set is configuration and identifiers only — region, ports, pool ids,
      model ids, queue URL, bucket name, KMS key *ARN*. Two were checked rather than assumed:
      `REDIS_URL` is `rediss://<host>:6379` with no userinfo and no password, and `CONTACTS_KMS_KEY_ARN`
      is an ARN `[E9]`.
- [x] The auth-bypass switches (`LOCAL_DEV_BYPASS_AUTH`, `LOAD_TEST_MODE`, `LOAD_TEST_KEY`) are absent
      from all three live definitions `[E9]`.
- [x] No `.env` file with real values exists in the tree; four `.env.example` placeholders only; `.env`
      and `*.env` are git-ignored; HEAD scan for AWS keys, private keys, provider API keys, literal JWTs
      and credential-shaped assignments returns **0 findings** `[E10]`.
- [x] No `.env`, secret, `.pem`, `.p12`, `.jks` or `credentials*.json` is `COPY`d into any image
      (`apps/{api,worker,therapist-portal}/Dockerfile`) `[E10]`.
- [ ] **FAILED:** git history contains a **real Google OAuth client secret** —
      `GOOGLE_CLIENT_SECRET="GOCSPX-<REDACTED>"` (35 chars) plus its client id, committed in
      `apps/test-harness/.env.example` at `0a724b0` (2026-09-06) and deleted at `06424dc`
      ("Remove secrets from env example", 2026-10-28). It is present in every ref including `develop` and
      is recoverable from any clone. Nothing in the repo shows the credential was revoked; the GCP stack
      it belonged to was removed in `e224874` but revocation is a console action `[E11]`.
- [ ] **Not satisfied (hardening):** no automatic rotation is configured on any of the six Secrets Manager
      secrets (`RotationEnabled = None` on all six) `[E8]`.
- [ ] **Not satisfied (hardening):** the Redis endpoint has no AUTH token. It is reachable only from the
      VPC security group and uses `rediss://`, so this is defence-in-depth, not an exposure `[E9]`.

## 3. No personal data in log output — **FAIL**

Window: last 14 days = the entire retention of the three application log groups. 18,176 events scanned
(api 17,105 / worker 481 / portal 590) `[E12]`.

- [x] Free-text clinical content is **not** logged. `"(content|note_text|summary_text|journal)":"…"`
      matches **0** events in all three groups `[E15]`.
- [x] Phone numbers: **0** matches in api and worker with a bounded regex `[E15]`.
- [x] No `log.<level>(` call site in `apps/api/src` or `apps/worker/src` passes a user-content field; the
      only two routes with a querystring (`/progress/mood`, `/users/me/appointments`) carry dates, so
      Fastify's request log does not become a PII channel `[E15]`.
- [ ] **FAILED — therapist email addresses are logged in full on every sign-in.** 24 events in
      `/ecs/evia-beta/portal` match an email pattern, e.g.
      `[AUTH] Successful sign-in: a***@okuvu.in` and `[AUTH] Unauthorized sign-in attempt: e***@okuvu.in`.
      Source: `apps/therapist-portal/src/lib/auth.ts:52` and `:55` write `${profile.email}` directly.
      Because the addresses are `<first>.<last>@okuvu.in`, each line is simultaneously an email address
      and a therapist's name — personal data under DPDP §2(t), retained 14 days `[E13]`.
- [ ] **FAILED — an operator probe put therapist name + email into an application log group.** 2 events in
      `/ecs/evia-beta/api` contain `{"email":"…","name":"Dr. …"}` for all three seed therapists. They come
      from `scripts/in-vpc-db-task.sh`: the `evia-beta-dbprobe` definition is cloned from `evia-beta-api`,
      inheriting `awslogs` → `/ecs/evia-beta/api`, and the probe prints query rows. Every future in-VPC
      query that returns rows will do the same `[E14]`.
- [x] One pseudonymous identifier is logged by design on deletion — `{"event":"account_deleted",
      "user_id":"<uuid>"}`. A bare internal UUID is not directly identifying, but it is linkable while the
      account row exists, so it is recorded here rather than waved through `[E27]`.
- [x] The probe in §5 left nothing in the logs: `"SYNTHETIC"`/`"e16s7"` → 0 matches `[E16]`.

## 4. A stated retention period — **PARTIAL**

The policy as published (`apps/therapist-portal/src/app/privacy/page.tsx` §"Retention") is honest about
the gap rather than inventing a number: *"clinical data does not currently expire on a timer … We are not
going to claim a retention period the code does not implement."* `[E20]`

| Data | Published | Actually configured | Verdict |
|---|---|---|---|
| Application / worker / VPC-flow logs | 14 days | 14 days on `/ecs/evia-beta/{api,worker,portal}` and `/vpc/evia-beta/flow`; container-insights 1 day `[E12]` | **match** |
| ALB access logs | not itemised | S3 lifecycle `Expiration: 90 days` on `evia-beta-alb-logs-…` `[E19]` | **match (stricter claim than the page, which omits it)** |
| RDS automated backups | 7 days | `BackupRetentionPeriod = 7`; deletion protection on; encrypted; not public `[E18]` | **match** |
| Beta harness / evaluation data | 90 days, dry-run default | `POST /cleanup/beta-retention` over `CorpusCase`, dry by default; no scheduled invocation `[E20]` | **match, manual only** |
| Deleted-account tombstone | indefinite | indefinite — the row is never removed `[E29]` | **match** |
| Clinical records (turns, summaries, journals, notes, moods, appointments) | "until you delete them" | **no expiry of any kind**; no purge job exists `[E20]` | **undefined — gap** |

- [x] Every stated number that is enforced by infrastructure matches what is configured `[E12] [E18] [E19]`.
- [ ] **Not satisfied:** clinical records have **no** retention period. "Until the client deletes them"
      is not a period, and is only true for the 8 tables §5 exercises. There is no code that ages out
      `Turn`, `SessionSummary`, `JournalEntry`, `TherapistNote`, `MoodLog` or `Appointment` `[E20]`.
- [ ] **Not satisfied:** two log groups never expire — `retentionInDays = None` on
      `/aws/rds/instance/evia-beta-postgres/postgresql` and `/aws/codebuild/evia-beta-conn-test`. The
      published "14 days" for server logs therefore does not hold universally. Current Postgres content is
      checkpoints only (`log_statement` off), so no row data is in there today `[E17]`.
- [ ] **Not satisfied:** the manual snapshot `evia-beta-premigrate-202610281906` has no expiry. A row
      deleted at the application level survives in that snapshot indefinitely, which contradicts the
      page's "a deleted row can persist inside a backup for up to [7 days]" `[E18]`.
- [ ] **Not satisfied:** `evia-beta-uploads-…` has no expiry on *current* object versions (only noncurrent,
      90 d). It currently holds only `builds/*.zip` artefacts and the app has no upload path, so this is
      hygiene, not an unbounded PI store `[E19]`.

## 5. Deletion path exercised once, record observed removed — **FAILED (partial deletion)**

Exercised once, 2026-10-29T05:09:32Z, on a **synthetic** client created for the purpose. Cognito identity
in the client pool (`ap-south-1_y2V0jvjGP`), real `USER_PASSWORD_AUTH` ID token, real
`POST https://api.okuvu.in/account/delete` → `HTTP 200 {"success":true}` `[E21] [E27]`. 19 synthetic rows:
the `User` row plus one in **17 of the 18** child tables that reference `"User"` (the eighteenth,
`UserToolPreference`, needs a `ToolRegistryEntry` FK and was left out — it is written by
`apps/api/src/routes/users.ts:151` and is also absent from `account.ts`). Seeded therapists untouched
(`Therapist` = 3 before and after) `[E23] [E24] [E25] [E26] [E28] [E30]`.

- [x] The deletion endpoint is deployed, authenticated and refuses unauthenticated calls
      (`401 Missing Authorization header`) `[E21]`.
- [x] The path runs in one transaction and returns success `[E22] [E27]`.
- [x] These 8 tables were **observed emptied** (probe rows 1→0, table totals falling with them):
      `EmergencyContact`, `EngagementProfile`, `ClinicalConfig`, `SafetyState`, `Turn` (2→0),
      `SessionSummary`, `MoodLog`, `SessionLog` `[E28]`.
- [ ] **FAILED — 9 tables are not touched** (probe rows still 1 after deletion):
      **`JournalEntry`** (the client's journal bodies), **`TherapistNote`** (notes written about the
      client), **`Homework`**, **`Reminder`**, **`Appointment`**, **`ClinicalAccessLog`** (the therapist
      access audit), **`TherapistClient`** (the therapist↔client link), **`UserMemory`** (the long-term
      memory profile) and **`InviteToken`**. That is 9 of the 17 child tables exercised; the 18th,
      `UserToolPreference`, is likewise never touched by `account.ts` `[E23] [E28]`.
- [ ] **FAILED — the account row keeps the client's name and email.** `deleted_at` is set, the phone is
      blanked and `auth_subject` is replaced with `deleted-<uuid>`, but
      `email_still_present = true`, `full_name_still_present = true`. The privacy page describes the
      tombstone as *"a marker that the account existed, with no phone number and no link to your sign-in
      identity"* — accurate about the phone and the sign-in link, silent about the name and email it
      retains `[E29]`.
- [x] The delete was **not** a no-op: totals for the eight tables moved, the shrink is attributable to the
      probe row only, and no other table changed `[E26] vs [E28]`.
- [x] Afterwards the probe's leftovers and its tombstone were removed by explicit operator `DELETE`
      (children first; every FK is `RESTRICT`), the Cognito user was deleted, and the census returned to
      the pre-probe baseline exactly: `User` 1, `SessionLog` 1, `Turn` 2, `SafetyState` 1,
      `Therapist` 3, everything else 0 `[E30]`.

**What would close item 5** *(all of it is application work, not infra)*:
1. Add the missing deletes to `apps/api/src/lib/account.ts` inside the existing transaction —
   `userMemory`, `journalEntry`, `therapistNote`, `homework`, `reminder`, `appointment`,
   `clinicalAccessLog`, `therapistClient`, `inviteToken`, `userToolPreference`.
2. Decide the audit question explicitly: a health-platform access log is usually **retained** for
   medico-legal reasons while the *content* is erased. If `ClinicalAccessLog` is kept deliberately, say so
   on the privacy page and in code comments instead of leaving it as an omission; if not, delete it.
3. Null out `email`, `full_name`, `date_of_birth`, `gender` (or drop the row) on the tombstone — or amend
   the privacy page to state that name and email are retained as part of the tombstone.
4. Extend the unit test to assert zero rows remain in **all 18** tables after `deleteAccount`, so a new
   model cannot reintroduce the gap silently.

---

## 6. Gaps that block sign-off

| # | Gap | Item | Sev | Closes when |
|---|---|---|---|---|
| G1 | Therapist email logged on every portal sign-in (`auth.ts:52,55`) | 3 | High | Log a hash or the internal `Therapist.id` instead of the address (the existing 24 events age out in 14 days) |
| G2 | `evia-beta-dbprobe` inherits `/ecs/evia-beta/api` and logs query rows (therapist name + email in the group today) | 3 | High | Point the probe at its own log group (`--log-group`) or print counts only |
| G3 | Deletion leaves 9 tables + name/email on the tombstone | 5 | **Critical** | §5 closers 1–4 |
| G4 | Real `GOCSPX-` Google OAuth client secret in git history (`0a724b0`, still in every ref) | 2 | **Critical** | Revoke the client in GCP + decide history rewrite vs. accept-and-document; a `.env.example` pre-commit hook would prevent recurrence |
| G5 | No rotation on any of the six Secrets Manager secrets | 2 | Medium | Enable rotation for `database`; scheduled rotation for the rest |
| G6 | Clinical data has no retention period at all | 4 | High | Set a period with clinical/legal input, implement the purge job, publish the number |
| G7 | Two log groups never expire (`/aws/rds/.../postgresql`, `/aws/codebuild/evia-beta-conn-test`) | 4 | Medium | `aws logs put-retention-policy` at 14 d on both |
| G8 | Manual RDS snapshot `evia-beta-premigrate-202610281906` never expires | 4 | Medium | Set an expiry on the snapshot, or document it as an approved exception |
| G9 | No HSTS header | 1 | Low | `Strict-Transport-Security: max-age=63072000; includeSubDomains` at the portal/API response layer |
| G10 | `evia-beta-uploads` has no expiry on current versions; Redis has no AUTH | 2/4 | Low | Lifecycle rule + `AUTH` on the replication group, or record the accepted risk |

## 7. Reproduce

```bash
# 1. TLS (items 1) — no credentials needed
aws elbv2 describe-listeners --load-balancer-arn "$(aws elbv2 describe-load-balancers \
  --names evia-beta-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text)" \
  --query 'Listeners[].[Port,Protocol,SslPolicy,DefaultActions[0].Type]'
curl -s -o /dev/null -D - http://okuvu.in/ | head -3
echo | openssl s_client -connect api.okuvu.in:443 -servername api.okuvu.in -tls1_1 \
  -cipher 'DEFAULT@SECLEVEL=0' 2>&1 | head -2     # expect alert 70

# 2. Secrets (item 2) — names only, never values
aws secretsmanager list-secrets --query 'SecretList[].[Name,RotationEnabled]' --output text
aws ssm describe-parameters --query 'Parameters[].[Name,Type]' --output text
aws ecs describe-task-definition --task-definition evia-beta-portal:18 \
  --query 'taskDefinition.containerDefinitions[0].secrets[].[name,valueFrom]' --output text

# 3. Logs (item 3) — Logs Insights, last 14 days
aws logs start-query --log-group-name /ecs/evia-beta/portal \
  --start-time $(( $(date +%s) - 1209600 ))000 --end-time $(( $(date +%s) ))000 \
  --query-string 'fields @timestamp, @message | filter @message =~ /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ | stats count() as n'

# 4. Retention (item 4)
aws logs describe-log-groups --query 'logGroups[].[logGroupName,retentionInDays]' --output text
aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,BackupRetentionPeriod]' --output text
aws s3api get-bucket-lifecycle-configuration --bucket evia-beta-alb-logs-562654496378

# 5. Deletion (item 5) — re-runnable; touches only the fixed synthetic probe id
#    scripts/dpdp-deletion-probe/{insert,counts,cleanup}.sql — see its README for the token flow
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # baseline
bash scripts/in-vpc-db-task.sh --sql-file /tmp/insert.filled.sql                   # after sed of @@SUB@@
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # before
curl -sS -X POST https://api.okuvu.in/account/delete -H "authorization: Bearer $ID_TOKEN" \
  -H 'content-type: application/json' -d '{"confirm":true}'
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # after — compare
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/cleanup.sql  # return to baseline
```
