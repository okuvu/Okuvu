# Restore runbook — evia-beta PostgreSQL

How to restore the Okuvu beta database from an RDS snapshot into a scratch instance, verify that the
data is intact, and tear the scratch instance down again. Written for the beta stack
(account `562654496378`, region `ap-south-1`, instance `evia-beta-postgres`, PostgreSQL 16.13,
`db.t4g.micro`, 20 GiB gp3, encrypted with the stack KMS key).

**Measured, not estimated:** every duration in §4 comes from the E16-S6 restore drill
(`evidence/E16-S6.md`), which restored two snapshots end-to-end and deleted the scratch instances.

This is a *scratch* restore. Restoring **over** production (point-in-time recovery onto the live
instance, or renaming the scratch instance into the production identifier) is a separate, higher-risk
procedure and is **not** covered here.

---

## 1. What we are restoring from

| Kind | Identifier | Taken | Retention |
| --- | --- | --- | --- |
| Manual, pre-migration (recorded by E16-S4) | `evia-beta-premigrate-202610281906` | 2026-10-28 19:06:20Z | until deleted by hand |
| Automated | `rds:evia-beta-postgres-<YYYY-MM-DD-HH-MM>` | daily in the backup window | 7 days (`BackupRetentionPeriod: 7`) |

Backup window is **19:00–19:30 UTC**; at the time of writing the newest automated snapshot
(19:11:06Z) was roughly an hour behind live (it is also refreshed by the continuous backup required
for PITR). Assume an RPO of up to the length of the backup window for snapshot-only recovery, and
~5 minutes for point-in-time recovery.

List what exists before you start:

```bash
aws rds describe-db-snapshots --region ap-south-1 \
  --query 'DBSnapshots[?DBInstanceIdentifier==`evia-beta-postgres`].[DBSnapshotIdentifier,SnapshotType,Status,SnapshotCreateTime,EngineVersion]' \
  --output table
```

Use the **manual** snapshot when re-proving a specific pre-change state (that is the one the
acceptance criteria name). Use the **newest automated** snapshot when the point is "can we recover
today's data" — it is closer to live and therefore a fairer row-count comparison.

---

## 2. Safety rules

These are not optional. A restore drill that damages production is worse than no drill.

1. **Never** point `--db-instance-identifier` at `evia-beta-postgres`, and never run
   `restore-db-instance-to-point-in-time` against it.
2. Read-only against production: no `modify-db-instance`, no `reboot-db-instance`, no
   `delete-db-snapshot` on a production snapshot, no failover (`--multi-az` is already false).
3. The scratch identifier must be unique and self-describing:
   `evia-restore-drill-<utcstamp>` / `evia-restore-drill2-<utcstamp>`.
4. Never make the scratch instance publicly accessible, and never open 5432 to `0.0.0.0/0` to make
   counting easier. Reach it the way the api does — from inside the VPC (§3.4).
5. **Delete the scratch instance at the end** (`--skip-final-snapshot`) and prove it is gone:
   `describe-db-instances` must return `DBInstanceNotFound`. It bills per second while it exists.
6. Capture timestamps (`date -u`) *before* the restore call and *at* the moment the instance reports
   `available`. Timestamps, not stopwatch guesses — the drill is only evidence if it is measured.

---

## 3. Procedure

### 3.1 Preflight

```bash
export AWS_REGION=ap-south-1
export PROD=evia-beta-postgres
export SNAP=evia-beta-premigrate-202610281906     # or rds:evia-beta-postgres-YYYY-MM-DD-HH-MM
export STAMP=$(date -u +%Y%m%d%H%M%S)
export SCRATCH="evia-restore-drill-$STAMP"

aws sts get-caller-identity                       # expect account 562654496378
date -u                                            # start of the drill, write this down

# the snapshot must be 'available' before you start
aws rds describe-db-snapshots --region "$AWS_REGION" --db-snapshot-identifier "$SNAP" \
  --query 'DBSnapshots[0].[DBSnapshotIdentifier,Status,SnapshotCreateTime,AllocatedStorage,EngineVersion,Encrypted]' \
  --output text
```

Also confirm no production change is in flight (CodeBuild deploy, `terraform apply`) — a restore
competing with a migration for the same instance's I/O is not a fair measurement, and a deploy that
hot-fixes the schema mid-drill invalidates the comparison.

### 3.2 Restore into a scratch instance

```bash
aws rds restore-db-instance-from-db-snapshot --region "$AWS_REGION" \
  --db-instance-identifier "$SCRATCH" \
  --db-snapshot-identifier "$SNAP" \
  --db-instance-class db.t4g.micro \
  --db-subnet-group-name evia-beta-postgres \
  --vpc-security-group-ids sg-0dc28801591e59b9f \
  --storage-type gp3 \
  --backup-retention-period 0 \
  --no-publicly-accessible --no-multi-az --no-auto-minor-version-upgrade \
  --tags Key=Purpose,Value=restore-drill Key=ManagedBy,Value=manual-drill

echo "restore requested at $(date -u +%FT%TZ)"
```

Why each flag:

| Flag | Reason |
| --- | --- |
| `--db-subnet-group-name evia-beta-postgres` | Without it the instance lands in the **default** VPC/subnet group and is not routable from the ECS tasks. |
| `--vpc-security-group-ids sg-0dc28801591e59b9f` | The RDS security group, which accepts 5432 from the ECS task SG. Same posture as production; still not public. |
| `--backup-retention-period 0` | Stops the instance taking a fresh 20 GiB automated backup the moment it comes up. With the inherited 7-day retention that backup added **~2.5 minutes** to time-to-available in drill run A. |
| `--no-auto-minor-version-upgrade` | Keeps the scratch instance on the snapshot's 16.13 for the duration; no surprise maintenance restart mid-drill. |
| `--storage-type gp3` | Matches production. The default restore would also be correct, just a different performance profile. |
| *not* `--db-parameter-group-name` | Passing `evia-beta-postgres16` forces a parameter-group change **plus a reboot** once the instance is up: drill run A took 9m57s with it, run B took 5m17s without. Restore the data first, attach the parameter group only if you actually need its tuning. |

The instance inherits the master credentials from the snapshot, so the existing
`evia-beta/database` secret still authenticates against it. Do not reset the password.

### 3.3 Wait for `available` — and measure it

```bash
while :; do
  S=$(aws rds describe-db-instances --region "$AWS_REGION" \
        --db-instance-identifier "$SCRATCH" \
        --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address]' --output text)
  echo "$(date -u +%FT%TZ) $S"
  case "$S" in available*) break ;; esac
  sleep 20
done
echo "available first observed at $(date -u +%FT%TZ)"
```

Status walk you will see (all normal): `creating` → `configuring-enhanced-monitoring` (endpoint
appears here) → `backing-up`/`modifying` → `available`. The endpoint DNS name exists before the
instance is usable — **do not** try to connect until the status is `available`.

`aws rds describe-events --source-identifier "$SCRATCH" --source-type db-instance` gives the
server-side milestones: `Restored from snapshot …` is the point at which the data is in place
(2m51s–3m05s after the request in the measured runs); the remaining time is monitoring agent,
parameter application and the final restart.

### 3.4 Verify

Two questions have to be answered separately: *did the data arrive* (row counts, content digests)
and *is the schema the same shape* (columns, indexes, constraints, enums).

`scripts/restore-drill-counts.js` answers both. It must run **inside the VPC** — RDS is in private
subnets, there is no bastion or VPN, and `enable_execute_command` is false on both services — so it
is executed by `scripts/in-vpc-db-task.sh`, which runs a throwaway Fargate task from the api image
with the database secret injected and prints the container's stdout.

```bash
# baseline: production (read-only SELECT count(*))
B64=$(base64 -w0 scripts/restore-drill-counts.js)
scripts/in-vpc-db-task.sh -- \
  "echo '$B64' | base64 -d > /tmp/counts.js && \
   NODE_PATH=/app/packages/prisma/node_modules node /tmp/counts.js" > /tmp/prod.json

# the restored instance: same credentials, host rewritten to the scratch endpoint
scripts/in-vpc-db-task.sh -- \
  "export PG_URL=\$(printf '%s' \"\$PG_URL\" | sed 's#@evia-beta-postgres\.#@evia-restore-drill-${STAMP}.#') && \
   echo \"TARGET_HOST=\$(printf '%s' \"\$PG_URL\" | sed -E 's#.*@([^/:]+).*#\\1#')\" && \
   echo '$B64' | base64 -d > /tmp/counts.js && \
   NODE_PATH=/app/packages/prisma/node_modules node /tmp/counts.js" > /tmp/scratch.json
```

Read `/tmp/scratch.json` and check:

| Check | Pass condition |
| --- | --- |
| `tables` | 38 (`37` Prisma models + `_prisma_migrations`) |
| `migrations.applied` | 43 of 43, none rolled back |
| `schema.columns / indexes / constraints / enums` | 340 / 86 / 70 / 12 — identical on both sides |
| per-table `counts` | identical to production, within the tolerance defined in §5 |
| `digests` | identical (content, not just row count) |

`TARGET_HOST` must show the scratch endpoint. If it still shows `evia-beta-postgres…` the `sed`
did not match — you would otherwise be "comparing production with production" and proving nothing.

Optional third check, the one a human cares about: point a throwaway task at the restored instance
with `prisma migrate status` and confirm `Database schema is up to date!`.

### 3.5 Tear down (mandatory)

```bash
aws rds delete-db-instance --region "$AWS_REGION" \
  --db-instance-identifier "$SCRATCH" \
  --skip-final-snapshot --delete-automated-backups
echo "delete requested at $(date -u +%FT%TZ)"

until aws rds describe-db-instances --region "$AWS_REGION" \
        --db-instance-identifier "$SCRATCH" 2>&1 | grep -q DBInstanceNotFound; do
  date -u; sleep 10
done
echo "gone at $(date -u +%FT%TZ)"
```

`--delete-automated-backups` matters: the restored instance can hold its **own** automated snapshot
(drill run A produced `rds:evia-restore-drill-…-2026-10-28-19-57` because it inherited a 7-day
retention). Those backups disappear a minute or two after the instance finishes deleting; they
cannot be removed directly — `delete-db-snapshot` on one fails with
`InvalidDBSnapshotState: automated snapshots cannot be deleted`. Confirm with
`aws rds describe-db-snapshots` that no `rds:evia-restore-drill-…` snapshot survives.

Then confirm nothing else did:

```bash
aws rds describe-db-instances --region ap-south-1 \
  --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceStatus]' --output text   # only evia-beta-postgres
```

---

## 4. Expected duration

Measured on `db.t4g.micro`, 20 GiB gp3, same subnet group and security group as production, from the
`restore-db-instance-from-db-snapshot` call to the first `available` observation (20–25s polling,
so each figure carries a ≤30s observation granularity).

| Run | Snapshot | Restore flags | Data in place | **Time to `available`** | Instance lifetime (incl. teardown) |
| --- | --- | --- | --- | --- | --- |
| A | `evia-beta-premigrate-202610281906` (manual) | + parameter group override | 3m05s | **9m57s** (597s) | 16m11s |
| B | `rds:evia-beta-postgres-2026-10-28-19-11` (automated) | `--backup-retention-period 0` | 2m51s | **5m17s** (317s) | 8m09s |

**Plan for 6–10 minutes**, and budget 15 minutes of wall clock per drill including teardown. Run A's
extra ~4.5 minutes are entirely self-inflicted: the parameter-group override triggered a
`modify` + reboot (`20:00:22 Updated to use DBParameterGroup` → `20:01:46 DB instance restarted`) and
the inherited 7-day retention triggered an immediate backup (`19:57:45` → `20:00:17`). Neither is
part of the data restore.

Scaling is roughly linear in allocated storage for the copy phase; a multi-hundred-GiB database will
not restore in 5 minutes. Re-measure after any storage or instance-class change — that is the whole
point of this table.

---

## 5. Tolerance — what counts as "matches production"

The comparison is between a restored point-in-time copy and a **live** database, read a minute or
two apart. A legitimate tolerance has to be derived from that, not picked to make the numbers pass:

| Table class | Tolerance | Why |
| --- | --- | --- |
| Migration-seeded registries (`ToolRegistryEntry`, `CrisisResource`) | **exact** (5 and 5) | Immutable rows written by migrations; nobody INSERTs at runtime. Any drift is corruption or a missed migration, not lag. |
| `_prisma_migrations` | **exact** (43) | Schema ledger; a mismatch means the restore is of a different schema generation. |
| Client/clinical tables (`User`, `SessionLog`, `Turn`, `SafetyState`, …) | `scratch ≥ prod_at_snapshot_time`, and `|scratch − prod_now| ≤ rows_written_between(snapshot, now)` | The snapshot is a point in time; production keeps accepting writes. The *only* legitimate difference is writes that landed after the snapshot was taken. |
| Schema shape | **exact** (340 columns / 86 indexes / 70 constraints / 12 enums) | A snapshot restore copies the schema bit-for-bit. There is no clock skew argument for a different index count. |

Practical rule for the beta database as it stands: the only rows in production are the two seeded
registries (5 + 5) plus the migration ledger, no client writes have happened, so **the expected
delta is zero on every table** and the drill asserts exact equality. Once real client data exists in
beta, the third row of the table governs: take the snapshot time from
`SnapshotCreateTime`/`RestoreTime`, count production at `T_now`, and explain any shortfall by
`SELECT count(*) … WHERE created_at > T_snapshot` on the live side. A shortfall that cannot be
explained that way is a failed restore, not noise.

---

## 6. When the restore fails

### 6.1 The snapshot is missing or not usable

```
$ aws rds describe-db-snapshots --region ap-south-1 --db-snapshot-identifier evia-beta-premigrate-19990101
aws: [ERROR]: An error occurred (DBSnapshotNotFound) when calling the DescribeDBSnapshots operation:
              DBSnapshot not found: evia-beta-premigrate-19990101
```

The same error comes back from `restore-db-instance-from-db-snapshot`, and no instance is created
(verified — `describe-db-instances` still listed only production). Order of work:

1. Search for a differently-named survivor instead of assuming loss:
   `aws rds describe-db-snapshots --region ap-south-1 --snapshot-type manual --query 'DBSnapshots[?contains(DBSnapshotIdentifier,`evia-beta`)].[DBSnapshotIdentifier,SnapshotCreateTime]'`
   and `--snapshot-type automated --db-instance-identifier evia-beta-postgres`.
2. If a manual snapshot was deleted by accident, check whether a **copy** survives in another region
   (`describe-db-snapshots --region <other>`); snapshot copies are independent of the source.
3. Automated snapshots cannot be deleted by hand, so an automated one is only "missing" when it has
   aged out of the 7-day window. If the whole window is gone, snapshot recovery is not available and
   the only remaining path is PITR — which requires the continuous backup to still be intact, so
   check `LatestRestorableTime` before saying so:
   `aws rds describe-db-instances --db-instance-identifier evia-beta-postgres --query 'DBInstances[0].LatestRestorableTime'`.
4. If nothing is restorable, that is an incident, not a drill failure: state it plainly, do not
   fabricate a substitute data set, and escalate to the on-call owner before touching production.

### 6.2 The restore call is rejected

| Error | Cause | Fix |
| --- | --- | --- |
| `DBInstanceAlreadyExists` | Identifier reused (common when re-running with the same `$STAMP`) | New `$STAMP`; never resolve it by deleting something else. |
| `InsufficientDBInstanceCapacity` / `DBInstanceClassNotFound` | `db.t4g.micro` unavailable in the AZ the snapshot needs | Try `--availability-zone ap-south-1a` or step to `db.t4g.small`; note the class in the evidence, it changes the duration. |
| `InsufficientDBInstanceCapacity` on a retry loop | t4g burst capacity exhausted in the account | Check for leftover drill instances (`describe-db-instances`) before requesting more. |
| `InvalidParameterCombination` on `--allocated-storage` | Smaller than the snapshot | Use the snapshot size or larger. |
| `KMSKeyNotUsable` / `AccessDenied` on the KMS key | Restore task role lost `kms:CreateGrant` for `b36d5c48-…` | Fix IAM; restoring an encrypted snapshot requires a grant on the stack key. |
| `InvalidVPCNetworkStateFault` | Subnet group has no free IP in one of its subnets | Free an IP or add a subnet to the group; do **not** fall back to a public subnet. |

### 6.3 The instance is `available` but unreachable / counts fail

- `TARGET_HOST` shows `evia-beta-postgres…` → your host rewrite did not apply. You are measuring
  production twice. Fix the `sed` and re-run.
- `connect ETIMEDOUT` → the restore probably lost the `--vpc-security-group-ids`/subnet-group flags
  and landed in the default VPC. `describe-db-instances` and compare `DBSubnetGroup` and
  `VpcSecurityGroups` with production. Deleting and re-restoring correctly is faster than trying to
  patch networking on a throwaway.
- `self-signed certificate in certificate chain` → node-postgres ≥ 8.16 treats `sslmode=require` as
  verify-full. Keep `uselibpqcompat=true` (the wrapper adds it as `PG_URL`); do **not** "fix" it by
  turning TLS off.
- Counts differ on client tables → apply §5: was the delta written after `SnapshotCreateTime`? If
  not, treat it as a failed restore and escalate before deleting the instance — the instance is the
  evidence.

### 6.4 The instance is stuck

If the status has not moved in ~20 minutes, read the events
(`aws rds describe-events --source-identifier "$SCRATCH" --source-type db-instance --duration 120`)
before doing anything. A restore that fails mid-flight ends in `failed`/`incompatible-restore`; then
delete it and retry **once** with the same snapshot on a fresh identifier. Two identical failures
mean the snapshot itself is bad — go to §6.1 and pick a different one; record both attempts.

### 6.5 Deleting the scratch instance

Deletion protection is `false` by default on a restored instance (verified), but if it was turned on:
`aws rds modify-db-instance --db-instance-identifier "$SCRATCH" --no-deletion-protection --apply-immediately`
then delete. If `delete-db-instance` reports `InvalidDBInstanceState`, wait for any in-flight
`modifying` to finish. Never delete a snapshot or instance whose identifier does not start with
`evia-restore-drill`.

---

## 7. Cost per drill

Instance hours are billed per second while the scratch instance exists; storage is billed for the
same window. Measured drill (both runs): **24.3 instance-minutes**, ≈ **$0.01**
(`db.t4g.micro` Single-AZ PostgreSQL, ap-south-1 = $0.021/hr; gp3 = $0.131/GB-month × 20 GiB).

The two things that silently inflate it are a forgotten instance (`--skip-final-snapshot` is not a
teardown) and an inherited backup retention that leaves an automated snapshot behind. Check both at
the end of every drill.

---

## 8. Drill log

| Date (UTC) | Snapshot | Time to available | Verified | Instance deleted | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-10-28 19:53–20:09 | `evia-beta-premigrate-202610281906` | 9m57s | 38/38 tables, 43/43 migrations, digests equal | yes (20:09:40Z) | `evidence/E16-S6.md` |
| 2026-10-28 20:10–20:18 | `rds:evia-beta-postgres-2026-10-28-19-11` | 5m17s | 38/38 tables, 43/43 migrations, digests equal | yes (20:18:14Z) | `evidence/E16-S6.md` |
