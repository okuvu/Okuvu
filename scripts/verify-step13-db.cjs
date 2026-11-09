#!/usr/bin/env node
/**
 * Step 13 — database-level verification of the safety and privacy invariants,
 * run against a database built ONLY from `prisma migrate deploy` on an empty
 * cluster. The application-side assertions live in the vitest suites; this
 * file exists to prove the things that only a real Postgres can prove:
 * column defaults, CHECK constraints, unique indexes and cascade deletes.
 *
 * Usage:
 *   NODE_PATH=<repo>/packages/prisma/node_modules \
 *     node scripts/verify-step13-db.cjs "postgresql://postgres@127.0.0.1:55432/okuvu_step13"
 *
 * Every assertion prints PASS or FAIL; the process exits 1 if any FAILed, so
 * this can gate a release rather than needing to be read.
 */
const { Client } = require('pg');

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error('usage: verify-step13-db.cjs <postgres-url>');
  process.exit(2);
}

let passed = 0;
const failures = [];

function ok(n, name, detail) {
  passed += 1;
  console.log(`PASS  ${String(n).padStart(2, '0')}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(n, name, detail) {
  failures.push(`${n} ${name}: ${detail}`);
  console.log(`FAIL  ${String(n).padStart(2, '0')}  ${name} — ${detail}`);
}

async function check(n, name, fn) {
  try {
    const detail = await fn();
    ok(n, name, detail);
  } catch (err) {
    bad(n, name, err.message || String(err));
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function expectPgError(c, sql, params, code) {
  try {
    await c.query(sql, params);
  } catch (err) {
    if (err.code !== code) throw new Error(`expected SQLSTATE ${code}, got ${err.code} (${err.message})`);
    return err.code;
  }
  throw new Error(`expected SQLSTATE ${code}, but the statement succeeded`);
}

const uuid = () => require('node:crypto').randomUUID();
const ISBN_NOW = new Date('2026-11-09T12:00:00Z');

const CRISIS_APPROVED = [
  ['iCall', '9152987821'],
  ['Vandrevala Foundation', '1860-2662-345'],
  ['NIMHANS', '080-46110007'],
  ['Snehi', '044-24640050'],
  ['Emergency Services', '112'],
];

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const who = await c.query('select current_database() as db, version() as v');
  console.log(`database: ${who.rows[0].db}`);
  console.log(`server:   ${who.rows[0].v.split(',')[0]}`);
  console.log('');

  await check(1, 'all migrations applied, none pending or failed', async () => {
    const r = await c.query(
      `select count(*) filter (where finished_at is not null and rolled_back_at is null)::int as applied,
              count(*) filter (where finished_at is null and rolled_back_at is null)::int as pending,
              count(*) filter (where rolled_back_at is not null)::int as rolled_back
         from _prisma_migrations`,
    );
    const { applied, pending, rolled_back } = r.rows[0];
    assert(applied >= 59, `only ${applied} migrations applied`);
    assert(pending === 0, `${pending} migration(s) unfinished`);
    assert(rolled_back === 0, `${rolled_back} migration(s) rolled back`);
    return `${applied} applied / ${pending} pending / ${rolled_back} rolled back`;
  });

  await check(2, 'the tables this work depends on exist', async () => {
    const need = [
      'SafetyPlan', 'SafetyRecheck', 'SafetyFlag', 'TreasureNote', 'TreasureCollection',
      'WorksheetResponse', 'JournalEntry', 'Homework', 'HomeworkCompletion',
      'ExerciseSet', 'ExerciseSetItem', 'ClientGoal', 'Notification', 'CrisisResource',
    ];
    const r = await c.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' and table_name = any($1)`,
      [need],
    );
    const found = new Set(r.rows.map((x) => x.table_name));
    const missing = need.filter((t) => !found.has(t));
    assert(missing.length === 0, `missing: ${missing.join(', ')}`);
    return `${need.length}/${need.length} present`;
  });

  await check(3, 'everything starts private at the database level', async () => {
    const cols = await c.query(
      `select table_name, column_default, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and column_name = 'shared_with_therapist'
          and table_name = any($1)`,
      [['JournalEntry', 'TreasureNote', 'WorksheetResponse']],
    );
    assert(cols.rows.length === 3, `expected 3 sharing columns, found ${cols.rows.length}`);
    for (const row of cols.rows) {
      assert(row.column_default === 'false', `${row.table_name} default is ${row.column_default}`);
      assert(row.is_nullable === 'NO', `${row.table_name} allows NULL sharing`);
    }
    return 'journal, worksheet and treasure note all default false, NOT NULL';
  });

  await check(4, 'a new journal entry, worksheet answer and note are stored unshared', async () => {
    const userId = uuid();
    await c.query(`insert into "User" (id, updated_at) values ($1, now())`, [userId]);
    const j = await c.query(
      `insert into "JournalEntry" (id, user_id, content) values ($1,$2,'private words')
       returning shared_with_therapist, shared_at, unshared_at`,
      [uuid(), userId],
    );
    const t = await c.query(
      `insert into "TreasureNote" (id, user_id, body, updated_at) values ($1,$2,'keep this',now())
       returning shared_with_therapist, source, pinned, safety_flagged`,
      [uuid(), userId],
    );
    const w = await c.query(
      `insert into "WorksheetResponse" (id, user_id, worksheet_id, answers, updated_at)
       values ($1,$2,(select tool_id from "ToolRegistryEntry" order by tool_id limit 1),'{}'::jsonb,now())
       returning shared_with_therapist`,
      [uuid(), userId],
    );
    assert(j.rows[0].shared_with_therapist === false, 'journal came back shared');
    assert(j.rows[0].shared_at === null && j.rows[0].unshared_at === null, 'journal share timestamps set');
    assert(t.rows[0].shared_with_therapist === false, 'note came back shared');
    assert(t.rows[0].source === 'self', `note source defaulted to ${t.rows[0].source}`);
    assert(t.rows[0].pinned === false, 'note came back pinned');
    assert(t.rows[0].safety_flagged === false, 'note came back flagged');
    assert(w.rows[0].shared_with_therapist === false, 'worksheet answer came back shared');
    return 'three surfaces inserted without a sharing value, all stored Private';
  });

  await check(5, 'no place to put crisis text in the safety records', async () => {
    const r = await c.query(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('SafetyFlag', 'SafetyRecheck')
          and (column_name ~* '(body|content|text|excerpt|snippet|message|quote|words)')`,
    );
    assert(r.rows.length === 0, `content-bearing columns found: ${r.rows.map((x) => `${x.table_name}.${x.column_name}`).join(', ')}`);
    const kinds = await c.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = '"SafetyFlag"'::regclass and contype = 'c'`,
    );
    const defs = kinds.rows.map((x) => x.def).join(' ');
    assert(/journal_entry/.test(defs) && /worksheet_response/.test(defs) && /treasure_note/.test(defs),
      'SafetyFlag does not restrict its subject to the three text surfaces');
    return 'flag carries a pointer (subject_kind/subject_id), never the words';
  });

  await check(6, 'one safety plan per client, enforced by the database', async () => {
    const userId = uuid();
    await c.query(`insert into "User" (id, updated_at) values ($1, now())`, [userId]);
    const th = uuid();
    await c.query(
      `insert into "Therapist" (id, email, name, updated_at) values ($1,$2,'Dr Test',now())`,
      [th, `t-${th}@example.test`],
    );
    const plan = `insert into "SafetyPlan" (id, user_id, answers, created_by_therapist_id, updated_at)
                  values ($1,$2,'{"1":"x"}'::jsonb,$3,now())`;
    await c.query(plan, [uuid(), userId, th]);
    await expectPgError(c, plan, [uuid(), userId, th], '23505');
    return 'second plan for the same client refused with 23505';
  });

  await check(7, 'deleting the client erases journal, notes, answers, goals and the plan', async () => {
    const userId = uuid();
    const th = uuid();
    const hw = uuid();
    await c.query(`insert into "User" (id, updated_at) values ($1, now())`, [userId]);
    await c.query(
      `insert into "Therapist" (id, email, name, updated_at) values ($1,$2,'Dr Test',now())`,
      [th, `t-${th}@example.test`],
    );
    const toolId = (await c.query(`select tool_id from "ToolRegistryEntry" order by tool_id limit 1`)).rows[0].tool_id;
    await c.query(
      `insert into "Homework" (id, client_user_id, therapist_id, description, updated_at)
       values ($1,$2,$3,'typed homework',now())`,
      [hw, userId, th],
    );
    await c.query(`insert into "JournalEntry" (id,user_id,content) values ($1,$2,'x')`, [uuid(), userId]);
    await c.query(`insert into "TreasureNote" (id,user_id,body,updated_at) values ($1,$2,'x',now())`, [uuid(), userId]);
    await c.query(
      `insert into "WorksheetResponse" (id,user_id,worksheet_id,answers,updated_at) values ($1,$2,$3,'{}'::jsonb,now())`,
      [uuid(), userId, toolId],
    );
    await c.query(
      `insert into "SafetyPlan" (id,user_id,answers,created_by_therapist_id,updated_at) values ($1,$2,'{}'::jsonb,$3,now())`,
      [uuid(), userId, th],
    );
    await c.query(
      `insert into "ClientGoal" (id,therapist_id,client_user_id,text,updated_at) values ($1,$2,$3,'goal',now())`,
      [uuid(), th, userId],
    );
    await c.query(
      `insert into "HomeworkCompletion" (id,homework_id,client_user_id) values ($1,$2,$3)`,
      [uuid(), hw, userId],
    );
    await c.query(
      `insert into "Notification" (id,user_id,kind,title,body) values ($1,$2,'update','t','b')`,
      [uuid(), userId],
    );
    await c.query(
      `insert into "SafetyRecheck" (id,user_id,surface,subject_kind,subject_id) values ($1,$2,'journal','journal_entry','x')`,
      [uuid(), userId],
    );

    const before = await countsFor(c, userId);
    assert(Object.values(before).every((n) => n > 0), `rows missing before delete: ${JSON.stringify(before)}`);

    await c.query(`delete from "User" where id = $1`, [userId]);
    const after = await countsFor(c, userId);
    const left = Object.entries(after).filter(([, n]) => n !== 0);
    assert(left.length === 0, `still present after delete: ${JSON.stringify(Object.fromEntries(left))}`);

    const therapist = await c.query(`select count(*)::int as n from "Therapist" where id = $1`, [th]);
    assert(therapist.rows[0].n === 1, 'the therapist row was deleted too');
    return `8 child tables emptied; the therapist row untouched (${JSON.stringify(before)})`;
  });

  await check(8, 'the helpline list is the approved five, in order', async () => {
    const r = await c.query(`select name, phone, "order" from "CrisisResource" order by "order"`);
    const got = r.rows.map((x) => [x.name, x.phone]);
    assert(JSON.stringify(got) === JSON.stringify(CRISIS_APPROVED),
      `helplines differ: ${JSON.stringify(got)}`);
    const orders = r.rows.map((x) => x.order);
    assert(JSON.stringify(orders) === JSON.stringify([0, 1, 2, 3, 4]), 'helpline order changed');
    return got.map(([n, p]) => `${n} ${p}`).join(' · ');
  });

  await check(9, 'the Treasure Box collections are limited to the four approved keys', async () => {
    const r = await c.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = '"TreasureCollection"'::regclass and contype = 'c'`,
    );
    const def = r.rows.map((x) => x.def).join(' ');
    for (const key of ['anxious', 'low', 'overwhelmed', 'win']) {
      assert(def.includes(`'${key}'`), `system_key '${key}' not allowed by the check constraint`);
    }
    const userId = uuid();
    await c.query(`insert into "User" (id, updated_at) values ($1, now())`, [userId]);
    await c.query(
      `insert into "TreasureCollection" (id,user_id,name,system_key,updated_at) values ($1,$2,'Open when I''m anxious','anxious',now())`,
      [uuid(), userId],
    );
    await expectPgError(
      c,
      `insert into "TreasureCollection" (id,user_id,name,system_key,updated_at) values ($1,$2,'x','anxious',now())`,
      [uuid(), userId],
      '23505',
    );
    await expectPgError(
      c,
      `insert into "TreasureCollection" (id,user_id,name,system_key,updated_at) values ($1,$2,'x','anger',now())`,
      [uuid(), userId],
      '23514',
    );
    return 'four keys allowed, one of each per client, anything else refused';
  });

  await check(10, 'a Treasure Box note can only say where it came from using the five approved sources', async () => {
    const r = await c.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = '"TreasureNote"'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%source%'`,
    );
    const def = r.rows.map((x) => x.def).join(' ');
    for (const s of ['self', 'therapist', 'worksheet', 'journal', 'chat']) {
      assert(def.includes(`'${s}'`), `source '${s}' not allowed`);
    }
    return 'self / therapist / worksheet / journal / chat';
  });

  await check(11, 'a therapist set belongs to one therapist and never to a client', async () => {
    const cols = await c.query(
      `select column_name from information_schema.columns where table_schema='public' and table_name='ExerciseSet'`,
    );
    const names = cols.rows.map((x) => x.column_name);
    assert(names.includes('therapist_id'), 'ExerciseSet has no therapist_id');
    assert(!names.includes('client_user_id'), 'ExerciseSet carries a client column');
    return `columns: ${names.join(', ')}`;
  });

  await check(12, 'feeling ratings are constrained to 0-10 and language to en/hi', async () => {
    const userId = uuid();
    await c.query(`insert into "User" (id, updated_at) values ($1, now())`, [userId]);
    const toolId = (await c.query(`select tool_id from "ToolRegistryEntry" order by tool_id limit 1`)).rows[0].tool_id;
    const sql = `insert into "WorksheetResponse" (id,user_id,worksheet_id,answers,feeling_before,language,updated_at)
                 values ($1,$2,$3,'{}'::jsonb,$4,$5,now())`;
    await expectPgError(c, sql, [uuid(), userId, toolId, 11, 'en'], '23514');
    await expectPgError(c, sql, [uuid(), userId, toolId, 8, 'fr'], '23514');
    await c.query(sql, [uuid(), userId, toolId, 8, 'en']);
    return '11 refused, "fr" refused, 8 accepted (the demanding-worksheet answer)';
  });

  await check(13, 'the update inbox cannot receive the same notice twice', async () => {
    const userId = uuid();
    await c.query(`insert into "User" (id, updated_at) values ($1, now())`, [userId]);
    const sql = `insert into "Notification" (id,user_id,kind,title,body,dedupe_key) values ($1,$2,'assigned','t','b',$3)`;
    await c.query(sql, [uuid(), userId, `assigned:${userId}:x`]);
    await expectPgError(c, sql, [uuid(), userId, `assigned:${userId}:x`], '23505');
    return 're-reading the same event writes one row, not two';
  });

  await check(14, 'a crisis flag points at one row of one surface, once', async () => {
    const userId = uuid();
    await c.query(`insert into "User" (id, updated_at) values ($1, now())`, [userId]);
    const subject = uuid();
    const sql = `insert into "SafetyFlag" (id,user_id,level,subject_kind,subject_id) values ($1,$2,'S3','journal_entry',$3)`;
    await c.query(sql, [uuid(), userId, subject]);
    await expectPgError(c, sql, [uuid(), userId, subject], '23505');
    await expectPgError(
      c,
      `insert into "SafetyFlag" (id,user_id,level,subject_kind,subject_id) values ($1,$2,'S3','chat_message',$3)`,
      [uuid(), userId, uuid()],
      '23514',
    );
    await expectPgError(
      c,
      `insert into "SafetyFlag" (id,user_id,level,subject_kind) values ($1,$2,'S3','journal_entry')`,
      [uuid(), userId],
      '23514',
    );
    return 'one flag per row; unknown surfaces and half-pairs refused';
  });

  console.log('');
  console.log(`passed: ${passed}   failed: ${failures.length}`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
  }
  await c.end();
  process.exit(failures.length === 0 ? 0 : 1);
}

async function countsFor(c, userId) {
  const q = `
    select
      (select count(*) from "JournalEntry" where user_id = $1)::int as journal,
      (select count(*) from "TreasureNote" where user_id = $1)::int as notes,
      (select count(*) from "WorksheetResponse" where user_id = $1)::int as answers,
      (select count(*) from "SafetyPlan" where user_id = $1)::int as plan,
      (select count(*) from "ClientGoal" where client_user_id = $1)::int as goals,
      (select count(*) from "Homework" where client_user_id = $1)::int as homework,
      (select count(*) from "HomeworkCompletion" where client_user_id = $1)::int as completions,
      (select count(*) from "Notification" where user_id = $1)::int as notifications,
      (select count(*) from "SafetyRecheck" where user_id = $1)::int as rechecks
  `;
  const r = await c.query(q, [userId]);
  return r.rows[0];
}

main().catch(async (err) => {
  console.error('HARNESS_ERROR:', err.message);
  process.exit(2);
});
