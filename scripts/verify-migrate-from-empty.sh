#!/bin/sh
# Prove `prisma migrate deploy` works against a genuinely empty database, with
# zero manual SQL, without touching the production schema.
#
# Runs inside the VPC (see scripts/in-vpc-db-task.sh) where DATABASE_URL already
# points at the production database and psql is not installed. It:
#   1. creates an empty scratch database on the same RDS instance,
#   2. points DATABASE_URL at it and runs `prisma migrate deploy` verbatim,
#   3. reports the applied-migration count, the public table count and the
#      approved-technique registry rows (ToolRegistryEntry) in the scratch db,
#   4. drops the scratch database.
#
# The only SQL this script issues by hand is CREATE DATABASE / DROP DATABASE —
# harness lifecycle, not schema. Every table, index, constraint and registry row
# is created by Prisma migrations alone.
#
# Override the scratch name with SCRATCH_DB (default evia_migrate_verify).
set -eu

SCRATCH_DB="${SCRATCH_DB:-evia_migrate_verify}"
export SCRATCH_DB

echo "=== [1/5] creating empty scratch database ${SCRATCH_DB} ==="
cd /app/packages/prisma
node -e '
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.PG_URL });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS "${process.env.SCRATCH_DB}" WITH (FORCE)`);
  await c.query(`CREATE DATABASE "${process.env.SCRATCH_DB}"`);
  const r = await c.query("select current_database() as db, version() as v");
  console.log("admin connected to " + r.rows[0].db);
  console.log(r.rows[0].v);
  await c.end();
})().catch((e) => { console.error("HARNESS_ERROR: " + e.message); process.exit(1); });
'

SCRATCH_URL="$(node -e '
const u = new URL(process.env.DATABASE_URL);
u.pathname = "/" + process.env.SCRATCH_DB;
process.stdout.write(u.toString());
')"

# Same scratch database, libpq-compatible URL for the pg client (see PG_URL in
# scripts/in-vpc-db-task.sh).
SCRATCH_PG_URL="$(node -e '
const u = new URL(process.env.PG_URL);
u.pathname = "/" + process.env.SCRATCH_DB;
process.stdout.write(u.toString());
')"

echo "=== [2/5] tables in scratch db before migration (expect 0) ==="
SCRATCH_DB_URL="$SCRATCH_PG_URL" node -e '
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.SCRATCH_DB_URL });
  await c.connect();
  const r = await c.query("select count(*)::int as n from information_schema.tables where table_schema = current_schema()");
  console.log("tables_before=" + r.rows[0].n);
  await c.end();
})().catch((e) => { console.error("HARNESS_ERROR: " + e.message); process.exit(1); });
'

echo "=== [3/5] prisma migrate deploy against the empty scratch database ==="
DATABASE_URL="$SCRATCH_URL" ./node_modules/.bin/prisma migrate deploy 2>&1
MIGRATE_EXIT=$?
echo "migrate_deploy_exit=${MIGRATE_EXIT}"
if [ "$MIGRATE_EXIT" -ne 0 ]; then
  echo "FATAL: migrate deploy failed against an empty database"
  exit "$MIGRATE_EXIT"
fi

echo "=== [4/5] what the migrations produced ==="
SCRATCH_DB_URL="$SCRATCH_PG_URL" node -e '
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.SCRATCH_DB_URL });
  await c.connect();
  const tables = await c.query("select count(*)::int as n from information_schema.tables where table_schema = current_schema() and table_type = $$BASE TABLE$$");
  const applied = await c.query("select count(*)::int as n from _prisma_migrations where finished_at is not null and rolled_back_at is null");
  const failed = await c.query("select count(*)::int as n from _prisma_migrations where finished_at is null and rolled_back_at is null");
  const tools = await c.query(`select count(*)::int as n from "ToolRegistryEntry"`);
  const toolIds = await c.query(`select tool_id from "ToolRegistryEntry" order by tool_id`);
  const crisis = await c.query(`select count(*)::int as n from "CrisisResource"`);
  console.log(JSON.stringify({
    tables: tables.rows[0].n,
    migrations_applied: applied.rows[0].n,
    migrations_failed: failed.rows[0].n,
    tool_registry_rows: tools.rows[0].n,
    tool_ids: toolIds.rows.map((r) => r.tool_id),
    crisis_resource_rows: crisis.rows[0].n,
  }, null, 2));
  await c.end();
})().catch((e) => { console.error("HARNESS_ERROR: " + e.message); process.exit(1); });
'

echo "=== [5/5] dropping scratch database ${SCRATCH_DB} ==="
node -e '
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.PG_URL });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS "${process.env.SCRATCH_DB}" WITH (FORCE)`);
  const r = await c.query("select count(*)::int as n from pg_database where datname = $1", [process.env.SCRATCH_DB]);
  console.log("scratch_db_remaining=" + r.rows[0].n);
  await c.end();
})().catch((e) => { console.error("HARNESS_ERROR: " + e.message); process.exit(1); });
'
