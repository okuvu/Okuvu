# DPDP deletion-path probe (E16-S7 → E16-S10)

These queries exercise the account-deletion path in `apps/api/src/lib/account.ts` against a
**synthetic** client and prove, by row count, exactly which tables it erases and which it leaves behind.
They are the SQL behind `evidence/E16-S7.md` §E24–E30, `evidence/E16-S10.md` and
`docs/SECURITY-DPDP-CHECKLIST.md` item 5.

| File | What it does |
|---|---|
| `insert.sql` | Creates one `User` row plus one row in every table that can hold a row belonging to one subject: the 18 with a FK to `"User"`, plus `GovernanceLog` (via the session id), `BetaConsent` (string `user_ref`) and `WaitlistEntry` (email + phone). Two `Turn`s and two `Reminder`s (one free-standing, one pointing at the probe `Homework`). Replace `@@SUB@@` with a real Cognito `sub` from a throwaway user. |
| `counts.sql` | Row census: `probe_rows` (rows belonging to the synthetic subject) vs `total_rows` per table, so the before/after delta is unambiguous. `AuditEvent` is listed as *retained* on purpose. |
| `tombstone.sql` | Checks the one row the path keeps: `email`/`full_name`/`date_of_birth`/`gender` NULL, `phone_number` `''`, `auth_subject` replaced, `deleted_at` stamped, `pii_rows = 0`. |
| `cleanup.sql` | Removes every row the probe created, plus the tombstone `User` row. Children first — without the E16-S10 migration every FK to `"User"` is `ON DELETE RESTRICT`. |
| `run-branch-delete-in-vpc.sh` | Runs the **branch's** `account.ts` in the VPC against the beta database while the branch is still undeployed (ships the file with gzip+base64, runs it with node's type stripping). Not needed once the branch is live. |

## Rules

- Run only through `scripts/in-vpc-db-task.sh` (the database is private; there is no other route in).
- The probe id `11111111-1111-4111-8111-111111111111` is fixed on purpose: `counts.sql` scopes every count
  to it, so no seeded therapist and no real client row can be selected, updated or deleted.
- **Never** point `cleanup.sql` at anything but that id. There is no `TRUNCATE` and no unscoped `DELETE`
  anywhere in these files.
- `insert.sql` and `cleanup.sql` are multi-statement scripts, so the probe prints `undefined` on success
  (the runner only prints `result.rows` for a single-row query) and exits non-zero with `SQL_ERROR:` on
  any failure.

## Order

```bash
sed "s/@@SUB@@/$SUB/" scripts/dpdp-deletion-probe/insert.sql > /tmp/insert.filled.sql
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # baseline
bash scripts/in-vpc-db-task.sh --sql-file /tmp/insert.filled.sql
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # before
curl -sS -X POST https://api.okuvu.in/account/delete \
  -H "authorization: Bearer $ID_TOKEN" -H 'content-type: application/json' -d '{"confirm":true}'
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # after (the proof)
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/tombstone.sql
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/cleanup.sql  # back to baseline
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # must equal baseline
```

While the branch is **not yet deployed**, replace the `curl` line with:

```bash
bash scripts/dpdp-deletion-probe/run-branch-delete-in-vpc.sh "$SUB"
```

`$SUB` / `$ID_TOKEN` come from a throwaway user in the client pool (`ap-south-1_y2V0jvjGP`, app client
`evia-beta-mobile`). That pool signs in by **phone number**, so the username is a `+91…` phone and the
flow is `USER_PASSWORD_AUTH` through `aws cognito-idp initiate-auth` (not `admin-initiate-auth`, which
rejects that flow and needs `ADMIN_USER_PASSWORD_AUTH` enabled on the client). Delete that user when
done. The token is a credential: keep it out of argv history, files with 0600 at most, and out of logs
(`curl --config <0600-file>` keeps it out of `argv`).
