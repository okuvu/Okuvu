# DPDP deletion-path probe (E16-S7)

These three queries exercise the account-deletion path in `apps/api/src/lib/account.ts` against a
**synthetic** client and prove, by row count, exactly which tables it erases and which it leaves behind.
They are the SQL behind `evidence/E16-S7.md` §E24–E30 and `docs/SECURITY-DPDP-CHECKLIST.md` item 5.

| File | What it does |
|---|---|
| `insert.sql` | Creates one `User` row plus one row in 17 of the 18 child tables that reference `"User"` (two `Turn`s). Replace `@@SUB@@` with a real Cognito `sub` from a throwaway user. |
| `counts.sql` | Row census: `probe_rows` (rows belonging to the synthetic user) vs `total_rows` per table, so the before/after delta is unambiguous. |
| `cleanup.sql` | Removes the rows the deletion path leaves behind, plus the tombstone `User` row. Children first — every FK to `"User"` is `ON DELETE RESTRICT`. |

## Rules

- Run only through `scripts/in-vpc-db-task.sh` (the database is private; there is no other route in).
- The probe id `11111111-1111-4111-8111-111111111111` is fixed on purpose: `counts.sql` scopes every count
  to it, so no seeded therapist and no real client row can be selected, updated or deleted.
- **Never** point `cleanup.sql` at anything but that id. There is no `TRUNCATE` and no unscoped `DELETE`
  anywhere in these files.
- `insert.sql` is a multi-statement script, so the probe prints `undefined` on success (the runner only
  prints `result.rows` for a single-row query) and exits non-zero with `SQL_ERROR:` on any failure.

## Order

```bash
sed "s/@@SUB@@/$SUB/" scripts/dpdp-deletion-probe/insert.sql > /tmp/insert.filled.sql
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # baseline
bash scripts/in-vpc-db-task.sh --sql-file /tmp/insert.filled.sql
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # before
curl -sS -X POST https://api.okuvu.in/account/delete \
  -H "authorization: Bearer $ID_TOKEN" -H 'content-type: application/json' -d '{"confirm":true}'
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/counts.sql   # after (the proof)
bash scripts/in-vpc-db-task.sh --sql-file scripts/dpdp-deletion-probe/cleanup.sql  # back to baseline
```

`$SUB` / `$ID_TOKEN` come from a throwaway user in the client pool (`ap-south-1_y2V0jvjGP`, app client
`evia-beta-mobile`, `USER_PASSWORD_AUTH`); delete that user when done. The token is a credential: keep it
out of argv history, files with 0600 at most, and out of logs.
