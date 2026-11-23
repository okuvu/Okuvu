# Go-live record — client goals, earned completion, today card (23 Nov 2026)

Direction: Shubhangi Goswami, 23 Nov 2026 (clinical authority). Client sees
their goals; the therapist changes status when a goal is achieved; the today card
drops a task once it is done; a client can no longer mark an exercise done
without doing it.

## What shipped

| Commit | Surface | Change |
| --- | --- | --- |
| `1df4a88` | therapist portal | Goals tab + ordered queue; "Make focus", move up/down; therapist-only guide (draft v0.1) |
| `52b3c93` | api + app | `GET /users/me/goals`; `POST /users/me/homework/practice-complete`; `POST /users/me/homework/:id/complete` **removed**; today card excludes work done today; goals screen and Home card |
| `e5ee6c3` | app | version 1.0.29+30 |

Pre-deploy live sha: `6c11078` (api rev 96). `origin/develop` was at `f5621e2`,
two commits ahead of live and an ancestor of the pushed sha — fast-forward, one
push, one rollout of api+worker+portal.

Deployed sha: `e5ee6c36ae01` → api rev **97**, worker rev **91**, portal rev **94**.
`/health` reports `e5ee6c36ae01`.

## Database

Migration `20261122130000_client_goal_position` — additive:
`ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0` plus a per-client backfill of
that new column from `created_at`.

Proportionate drill: manual RDS snapshot `pre-careplan-goals-20261123-1933`
(`available`, 100%, encrypted) plus a rehearsal on a fresh local Postgres 17
database built from the repo's own migrations.

Rehearsal result: 63 prior migrations applied clean, five legacy `ClientGoal`
rows inserted for two clients with interleaved `created_at`, then the migration
applied → `c1: g1=0, g3=1, g4=2` and `c2: g2=0, g5=1` (per-client, in
`created_at` order). Invariants read back: `nulls=0 total=5 default=0
nullable=NO`; an insert that omits `position` lands `0`; a second
`migrate deploy` prints `No pending migrations to apply.`

Applied in production by the release build itself:
`64 migrations found` → `Applying migration 20261122130000_client_goal_position`
→ `All migrations have been successfully applied.`

## Gates (build `11b92a9e`)

- 6/6 release-gate ledger entries recorded; `require` passed at both deploy points.
- Local pre-push: api 2041 tests, worker 119, portal 430, `tsc --noEmit` clean in
  all three.
- `DEPLOY_DECISION=deploy reason=36 file(s) outside docs/, evidence/, plan/`.
- POST_BUILD: `OK api: …-api:97`, `OK worker: …-worker:91`, `OK portal: …-portal:94`.
- Task definition rev 97 still carries `OKUVU_A2_CARE_PLAN_STYLE=on` and
  `OKUVU_A2_TALK_OR_DO=on` — the care-plan emphasis and talk-or-do question are
  untouched by this rollout.

### Route probes on the live api

| Probe | Result | Reading |
| --- | --- | --- |
| `GET /users/me/goals` | 401 | mounted, auth refused first |
| `POST /users/me/homework/practice-complete` | 401 | mounted |
| `POST /users/me/homework/<id>/complete` | **404** | the mark-done route is gone |
| `GET /users/me/goalz` | 404 | control |
| `POST /users/me/homework/practice-complet` | 404 | control |

`400-vs-404` discrimination is unavailable here (both new routes are
authenticated), so 401 + a 404 control is the pair. Portal `/clients/[id]/goals`
is auth-walled (307 for real and fake alike) and is proven instead by the route
table in the deployed image's own Next build: `ƒ /clients/[id]/goals`.

## Android artifact

`prod-1.0.29.apk` — `ai.okuvu.app`, versionCode **30**, versionName **1.0.29**,
minSdk 24, targetSdk 36. Signed by the canonical upload key
(`SHA-256 545426d0…`, `SHA-1 ccb4ca39…`).

sha256 `a5e0614820e711b16cc686c579b2af20e3d94aff86b1360036c52a3f88fe294a`,
63,346,467 bytes.
Served at https://okuvu-releases-562654496378.s3.ap-south-1.amazonaws.com/apk/prod-1.0.29.apk
— a round-trip download hashes identically.

`scripts/verify-mobile-release.py`: **23/23 checks passed** (signer, compiled
client id in 3/3 ABIs, no diagnostic strings, freshness, analyze, 486 tests,
consent payload contract, live `/health` sha).

Shell environment note: `pub get`, `analyze` and the full suite were re-run in the
release worktree (`/opt/data/okuvu/wt/ship-1.0.29`) — 506 tests there, the
verifier's own re-run reports 486 because it scopes differently. Both green.

## Rollback lever

Code: redeploy api rev 96 / worker rev 90 / portal rev 93 (`6c11078`). The
database column is additive and forward-compatible: rev 96 ignores it.
App: hand back `prod-1.0.28.apk` (build 29); the old app still works against the
new api except that its mark-done button now gets **404**, which is the intended
removal.

## Not exercised

- No client has opened the goals screen or completed an exercise through the new
  route in production yet. The mechanism is live; the screen has not been walked
  on a handset.
- Therapist-typed homework ("write a letter you will not send") has no in-app
  completion signal. Removing mark-done means those assignments must now be
  closed from the portal's homework page. Watch this in beta.
- `OKUVU_LATEST_VERSION_CODE` still says 25 / 1.0.24, so the in-app update
  pointer does not yet know about 1.0.29. Deliberate: there is no Play listing
  for this build, so prompting an update would point at a version the store does
  not carry.
