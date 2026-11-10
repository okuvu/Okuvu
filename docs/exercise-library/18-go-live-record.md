# Go-live record — Library / Treasure Box / safety release (10 Nov 2026)

Operator request: take the combined work live, with a verified backup first, then
an APK. Everything below is what actually happened, not what was planned.

## What is live now

| service | revision | commit | rollout |
|---|---|---|---|
| api | `evia-beta-api:80` | `5ab345ea6d0f` | COMPLETED, 1/1 running |
| portal | `evia-beta-portal:80` | `5ab345ea6d0f` | COMPLETED, 1/1 running |
| worker | `evia-beta-worker:78` | `5ab345ea6d0f` | COMPLETED, 1/1 running |

`GET https://api.okuvu.in/health` → `{"status":"ok","commit":"5ab345ea6d0f"}`.

Deploy ref is `develop` (webhook filter `EVENT=PUSH` + `HEAD_REF ^refs/heads/develop$`,
read off the CodeBuild project, not remembered). Pushed `02c469d` at 00:23:47Z,
then `5ab345e` at 00:51:47Z.

## Backup, before anything else

1. **RDS snapshot** `evia-beta-premigrate-202611100013` — status `available`,
   progress 100%, encrypted, 2026-11-10T00:13:29Z, engine postgres 16.13.
2. **Logical copy** of the live database, reachable without the live system:
   `/opt/data/okuvu/backups/evia-beta-logical-20261110.sql` (+ `.gz`, mode 600)
   and `s3://evia-beta-uploads-562654496378/db-backups/evia-beta-logical-20261110.sql.gz`
   (SSE-KMS — the bucket policy denies anything else). 41 tables, 344 rows,
   164,979 bytes of SQL, sha256 `bec45e11…5deaceb`, verified by reassembling the
   streamed gzip and re-hashing.
3. **Restore test** into a real scratch Postgres 17
   (`/opt/data/cache/scratch/restore2.sh`): schema rebuilt from the 51 migrations
   the live database records, then the copy loaded. **41/41 tables, 344/344 rows,
   zero mismatches**, helplines and timestamps intact.
4. **Snapshot restore drill**: `evia-restore-drill` restored from the snapshot and
   reached `available`, then deleted. The native backup is proven restorable, not
   just present.

The restore test found real drift worth knowing: live's `ToolRegistryEntry` has 6
columns; the 8 pending migrations add 17 more. Restoring the copy into a
migration-shaped database fails, because the new columns are NOT NULL and the
backfill has nothing to work on in an empty database. That is why the drill builds
the live shape first and then applies the migrations on top — which is also the
deploy rehearsal below.

## The deploy rehearsal

The restored, production-shaped copy was migrated forward with the same command
the build runs (`prisma migrate deploy`). All 8 applied in order:

```
20261109120000_exercise_library_treasure_box
20261109130000_seed_library_worksheets
20261109140000_mood_checkin_trigger_intensity
20261109150000_safety_plan
20261109160000_safety_recheck
20261109170000_privacy_sharing
20261109180000_step7_updates_and_emails
20261109190000_step8_portal_library
```

Tables 42 → 51, `ToolRegistryEntry` 6 → 23 columns, 4 users and 68 turns preserved,
no NULL left in the backfilled columns. On the live database the same 8 applied in
build `4b05bb4b`; the second build reported `No pending migrations to apply.`

## First rollout failed — and why it mattered

Build `4b05bb4b` (02c469d) rolled portal:79 and worker:77 fine, but `api:79`
crash-looped: three tasks, exit 1, never healthy. Container log:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/app/packages/shared-types/worksheet' imported from
/app/packages/shared-types/worksheets/index.ts
```

The api image loads `@okuvu/shared-types` as TypeScript source (its `exports`
point at `.ts`), so Node's ESM loader sees the catalogue's own relative imports.
Those were extensionless: TypeScript and Vitest both resolve them, Node cannot.
Every gate except a real container run passes on that — including
`scripts/check-esm-imports.py`, which only scanned `apps/api` and `apps/worker`.

Rolled all three services back to `api:78` / `portal:78` / `worker:76` within
minutes; the old api never stopped serving throughout.

Fix (`5ab345e`): 32 relative imports across 14 catalogue files now use package
subpaths (`@okuvu/shared-types/worksheets/<module>`), `package.json` exports
gains `./worksheets/*`, and the ESM guard scans runtime-loaded packages too.
Negative control: run against the pre-fix tree it reports 18 violations; on the
fixed tree, 0. Proof of boot: the built api run against the restored copy —
`/health` 200, worker health satisfied, routes answering 401.

## Security gate: FAILED, and it is not this release

Build `c98f72fc` (5ab345e) ended `FAILED` at the BUILD phase, in
`scripts/security-gate.py ecr`, while POST_BUILD still rolled all three services:

```
CVE-2026-4738 ... OSGeo gdal ... SECURITY GATE FAILED
api / worker / portal — findings: CRITICAL=1
```

Same single finding for the image that was live before (`api:12236bcb2ea3`:
`{'CRITICAL': 1}`, CVE-2026-4738, 9.4). It predates this work and rolling back
would not remove it. Both builds are red for the same pre-existing reason, and
the gate does not stop the rollout — POST_BUILD is not gated on it.

## Live checks

- `/health` commit `5ab345ea6d0f` = the pushed sha.
- Route probes (401 = mounted, 404 = absent): `/library`, `/safety-plan`,
  `/journal`, `/treasure/pick`, `/users/me/homework`,
  `POST /worksheets/ws_thought_record`, `POST /worksheets/ws_thought_record/help`,
  `POST /users/me/notifications/read-all` all 401; invented paths 404.
- Portal, signed in as **ananya.rao@okuvu.in** (seeded test therapist):
  `/worksheets` renders the five filters and Preview; `/clients/<id>/homework`
  renders Assign/Due; `/clients/<id>/shared` renders "Shared with me"; the
  safety-plan page renders; `/clients/<id>/notes` renders WORKING GOALS. The
  "Send to their Treasure Box" card is client-rendered, so it was proven from the
  deployed chunk `22t293dma86ge.js` served by the live page.
- Sharing round trip on a test client, live: created one journal entry, flipped
  it shared → appeared in the therapist's `shared.list`; flipped it back →
  gone on the next read. Row deleted afterwards.
- Helplines unchanged and in the approved order: iCall 9152987821 · Vandrevala
  1860-2662-345 · NIMHANS 080-46110007 · Snehi 044-24640050 · 112.
- Crisis screen: `crisis_overlay.dart` diff since `12236bc` is **additions only**
  (+28) — the "My plan for hard moments" link when a plan exists. No copy removed.
- All 9 new tables present; 36 tool-registry rows; 20 approved worksheets.

## Not checked here

The phone flows a therapist or client taps — signing into the app, opening a
worksheet, Get help from inside it, the Today card, the crisis screen on a
handset — cannot be exercised from this host: the app's sign-in is Google-only,
there is no emulator, and the handset is the operator's. They are covered by the
widget suites (410 tests, analyzer clean) and, for the server half, by running the
built api against the restored production copy.

## Rollback

`evia-beta-api:78`, `evia-beta-portal:78`, `evia-beta-worker:76` (the revisions
serving before this release), or the snapshot above. The 8 migrations are
additive, so the previous images run on the migrated schema.

## APK

`1.0.16+17` (versionCode 17, above every artifact already out — highest on host
was 16). Built from `5ab345e` plus one local-only commit that changes only
`apps/mobile/pubspec.yaml`. `verify-mobile-release.py`: **RELEASE OK, all 23
checks passed**, 410 Flutter tests, analyzer clean, LIVE gate against
`api.okuvu.in` matching the deployed commit.
sha256 `351d7b46e661841ba8cb3e115aaab12c3e9bc0db0f35f5448640c56bec389c1b`,
62,496,095 bytes.
