#!/usr/bin/env node
/**
 * Fidelity probe for the E16-S6 restore drill (docs/RESTORE-RUNBOOK.md §4).
 *
 * Emits, as one JSON document on stdout:
 *   - exact row counts for every BASE TABLE in the `public` schema
 *   - the Prisma migration ledger totals
 *   - a structural fingerprint (columns, indexes, constraints, triggers, enums)
 *   - content digests of the two migration-seeded registries, so a restore is
 *     compared on row *content*, not just row *count* (both tables are uuid-
 *     keyed, so ids are stable across a snapshot restore of the same data)
 *
 * Runs inside the VPC through scripts/in-vpc-db-task.sh — the runtime image
 * ships no psql. It reads PG_URL, which that wrapper exports with
 * `uselibpqcompat=true` so node-postgres keeps libpq `sslmode=require`
 * semantics instead of verify-full (pg >= 8.16 rejects the RDS self-signed
 * chain).
 *
 * Usage:  NODE_PATH=/app/packages/prisma/node_modules node /tmp/restore-drill-counts.js
 */
const { Client } = require('pg');

const digests = {
  ToolRegistryEntry: "select md5(string_agg(tool_id || '|' || label, ',' order by tool_id)) as d from public.\"ToolRegistryEntry\"",
  CrisisResource: "select md5(string_agg(name || '|' || phone || '|' || \"order\", ',' order by name)) as d from public.\"CrisisResource\"",
};

(async () => {
  const url = process.env.PG_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('FATAL: no PG_URL/DATABASE_URL in the environment');
    process.exit(2);
  }
  const c = new Client({ connectionString: url });
  await c.connect();

  const who = await c.query(
    'select current_database() as db, current_user as usr, version() as ver, inet_server_addr()::text as addr',
  );

  const list = await c.query(`
    select table_name
      from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  `);

  const counts = [];
  for (const row of list.rows) {
    const t = row.table_name;
    // Names come from the catalog, not user input; quote anyway so mixed-case
    // Prisma table names ("ToolRegistryEntry") resolve.
    const q = await c.query(
      `select count(*)::bigint as n from public."${t.replace(/"/g, '""')}"`,
    );
    counts.push({ table: t, rows: Number(q.rows[0].n) });
  }

  let migrations = null;
  if (list.rows.some((r) => r.table_name === '_prisma_migrations')) {
    const m = await c.query(
      `select count(*)::bigint as n,
              count(*) filter (where finished_at is not null and rolled_back_at is null)::bigint as done
         from public."_prisma_migrations"`,
    );
    migrations = { total: Number(m.rows[0].n), applied: Number(m.rows[0].done) };
  }

  const schema = (await c.query(`
    select
      (select count(*) from information_schema.columns where table_schema='public')::int as columns,
      (select count(*) from pg_indexes where schemaname='public')::int as indexes,
      (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid
         join pg_namespace n on n.oid=r.relnamespace where n.nspname='public')::int as constraints,
      (select count(*) from pg_trigger t join pg_class r on r.oid=t.tgrelid
         join pg_namespace n on n.oid=r.relnamespace
        where n.nspname='public' and not t.tgisinternal)::int as triggers,
      (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
        where n.nspname='public' and t.typtype='e')::int as enums
  `)).rows[0];

  const digest = {};
  for (const [name, sql] of Object.entries(digests)) {
    const r = await c.query(sql);
    digest[name] = r.rows[0].d;
  }

  await c.end();
  process.stdout.write(
    JSON.stringify(
      {
        database: who.rows[0].db,
        user: who.rows[0].usr,
        server: who.rows[0].ver.split(' ').slice(0, 2).join(' '),
        tables: counts.length,
        migrations,
        schema,
        digests: digest,
        total_rows: counts.reduce((a, b) => a + b.rows, 0),
        counts,
      },
      null,
      2,
    ) + '\n',
  );
})().catch((e) => {
  console.error('COUNT_ERROR: ' + e.message);
  process.exit(1);
});
