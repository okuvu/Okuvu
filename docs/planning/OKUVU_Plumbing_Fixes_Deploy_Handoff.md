# OKUVU — Plumbing Fixes v1.0 · Deploy & Handoff Notes

**To:** Sr / hosting owner
**From:** intern (implementation complete & verified locally, 21 Sep 2026)
**Purpose:** everything that still needs doing to **host** the plumbing-fixes changes. No code changes are left — this is migration + secrets + deploy + verification only.

Full change detail: `docs/planning/OKUVU_Plumbing_Fixes_Change_Log_v1_0.md`
Post-deploy testing walkthrough: `docs/testing/Persona_Automation_Testing_Guide.md`

---

## TL;DR — do these 5 things in order

1. `prisma migrate deploy` against **main** (before deploying new code)
2. Set **`WORKER_URL`** in api AND test-harness secrets — **mandatory, don't skip**
3. Set remaining secrets (`OPENROUTER_API_KEY`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`)
4. Deploy harness (Firebase Hosting) + api + worker
5. Run the post-deploy verification (§5)

---

## 1. Database migration (FIRST — before any new code is deployed)

The new code reads new columns (`build_sha`, `corpus_version`, `run_mode` on `TestRun`; `fallback_source` on `Turn`) and a new enum value (`incomplete` on `TestRunStatus`). On an unmigrated DB it errors immediately — so migrate **before** deploy.

```bash
cd packages/prisma
DATABASE_URL="<main-branch-connection-string>" pnpm exec prisma migrate deploy
```

This applies 3 migrations (all purely additive — no backfill, nothing existing breaks):

| Migration | What it does |
|---|---|
| `20260920110000_add_test_run_status_incomplete` | Adds enum value `'incomplete'` to `TestRunStatus` |
| `20260920120000_add_test_run_identity_header` | Adds nullable `build_sha`, `corpus_version`, `run_mode` to `TestRun` |
| `20260920130000_add_turn_fallback_source` | Adds nullable `fallback_source` to `Turn` |

> ⚠️ If migrations were already applied to a **Neon branch** during testing, that does **not** carry over to main — Neon branches are snapshots. Main needs its own `migrate deploy`.
>
> If `migrate deploy` reports drift, check `docs/prisma-migration-drift.md` before doing anything else — do **not** `db push`.

---

## 2. Secrets / env vars

### 2.1 `WORKER_URL` — NEW MANDATORY REQUIREMENT (A1 fix)

Previously optional; the old silent-failure behavior (`processed:false` with no signal) is exactly what the doc fixed.

| App | Where | Behavior without it |
|---|---|---|
| `apps/api` | env/secret manager | **Fails loudly at startup** (health assertion) — intentional |
| `apps/test-harness` | env/secret manager | Every run gets marked **`incomplete`** instead of `pass` — intentional (B1) |
| `apps/worker` | — | Now serves `GET /health` (returns `{ok, db}`) — this is what the other two probe |

Value: the worker's base URL (same one already used for `POST /tasks/summary`), e.g. `https://worker.evia.internal`. No trailing slash needed.

### 2.2 Remaining harness secrets (unchanged from normal setup)

- `OPENROUTER_API_KEY` — without it every LLM call degrades to documented fallbacks (runs come out halted/canned)
- `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET` — sign-in
- Per-environment API URLs (`TEST_HARNESS_API_SANDBOX` / `_STAGING` / `_BETA`) — already configured
- Never commit real values; they belong in GCP Secret Manager / Firebase config

---

## 3. Deploy

### 3.1 apps/test-harness → Firebase Hosting
Project `evia-test-harness` at `test-harness.evia.ai`, web-frameworks integration (already configured in its `firebase.json`):

```bash
firebase experiments:enable webframeworks   # one-time, if not already enabled
cd apps/test-harness
firebase deploy --only hosting
```

**Expect friction** — this pipeline is configured but has **never been deploy-verified** (no Next.js app in this repo has a proven hosting run yet). Likely pain points: the `webframeworks` experiment flag and the custom-domain DNS CNAME for `test-harness.evia.ai`. Budget ~0.5–1 day.

### 3.2 apps/api + apps/worker
Existing hosting process (per `infrastructure/gcp/evia-beta`). The worker needs a redeploy too — it now serves `GET /health`.

---

## 4. Rollback safety

- The 3 migrations are additive; the **old** code keeps working after they run — so the only real ordering constraint is *migrate main before deploying the new code*.
- If a deploy goes sideways after migrating, rolling the app back to the previous build is safe (old code ignores the new columns).

---

## 5. Post-deploy verification (~15 min)

1. **Worker health:** `curl https://<worker-host>/health` → `{"ok":true,"db":"ok"}`
2. **API starts clean:** check api logs for the worker-health assertion passing (it fails loudly at boot if not)
3. **Scenario Battery:** open `/simulator` → sign in → run the **Scenario battery** in **sandbox**. All 5 personas (`anxious`, `crisis-escalating`, `fidelity`, `adversarial`, `continuity`) should complete.
4. **Run identity header:** open any new run on `/results` → `build_sha` / `corpus_version` / `run_mode` are populated (older rows are NULL by design)
5. **Real-model check (once):** run the battery in **staging** with `OPENROUTER_API_KEY` set. Key things to look at:
   - `continuity` persona → the reply after a short "okay" **continues the earlier topic** (no re-onboarding — this was bug A2)
   - `adversarial` persona → any blocked reply has `fallbackUsed: true` (previously blocks reported clean — bug A4)
   - No `pass` run while the worker is unreachable (would mean B1 isn't active)

---

## 6. Not in scope — blocked on SME sign-off

These are intentionally **not** deployed with this batch:

| Item | What's needed |
|---|---|
| **A6** — `Restricted` governance state | SME must choose: (a) wire it into A8/A2 as a real boundary-hold mode, or (b) stop emitting it on benign input. ~0.5–1 day after the decision |
| **A3** — block-response copy | Mechanism is implemented; the **wording** in `apps/api/src/pipeline/fallbacks.ts` is engineering-authored and needs clinical/SME sign-off before beta |
| **A8** — per-stage latency budgets | Placeholders in `apps/api/src/scripts/latency-test.ts` need SME-confirmed ms values |

---

## 7. Known non-issues (so nobody chases ghosts)

- 6 api tests ("returns 401 for invalid token") fail **only when the entire api suite runs in parallel** — real Firebase calls vs a 5s timeout. Each passes in isolation. Pre-existing, unrelated to these changes.
- Dashboard pass-rate may look lower right after deploy: runs with a broken/unreachable worker stage are now **`incomplete`** and excluded from scoring (B1 doing its job). If the pass-rate drops, check worker health first.
- `USE_CANNED_LLM_RESPONSE` must not be ambiently set for non-sandbox runs — that demotes them to `halt` by design.
