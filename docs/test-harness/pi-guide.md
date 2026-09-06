# Test Harness — Principal Investigator Guide

**Audience:** the Principal Investigator (PI) role in the Evia Test Harness (`apps/test-harness`).
**Status:** covers the harness as built through this sprint's stories (TH-S01–TH-S31). A few
stories are still outstanding — see "What's not here yet" at the end of this guide.

The PI role is the only role that can sign off gates, modify the Model Config Registry, unblind
review results, and trigger a CI regression run. Everything else in the harness (running agents,
submitting ratings) is also available to the PI, but this guide focuses on the PI-specific
capabilities.

---

## 1. Signing in

The harness is a separate app from the therapist portal and patient app, reachable at
`test-harness.evia.ai` (production) or `http://localhost:3002` (local dev). Sign-in is Google
OAuth only — there is no email/password option.

1. Go to the harness URL. You'll land on `/auth` if you're not signed in yet.
2. Click **Continue with Google** and use the Google account your PI account was registered
   with.
3. If your account has not been provisioned, you'll see "Your account is not registered for the
   test harness." Accounts are provisioned by running
   `npx tsx src/scripts/seed-harness-access.ts <email> PI <environments>` from `apps/test-harness`
   — see the Engineer Runbook if you need to provision a new PI, rater, or engineer account
   yourself.

[Screenshot: sign-in screen with the "Continue with Google" button]

There is currently no in-app navigation sidebar — you move between screens by URL
(`/dashboard`, `/config`, `/review/results`, `/ci`, `/corpus`, `/sampling`, etc.). Bookmark the
ones you use often.

## 2. The environment selector

The dropdown in the top-right of the header (next to your name) switches which **test
environment** the current screen reads and writes against:

| Environment | Meaning |
|---|---|
| **Sandbox** | Fully synthetic data. No restrictions on `data_origin`. Safe for any experimentation. |
| **Staging** | Same as sandbox in terms of data rules — synthetic/paraphrased corpus data only. Closer to a pre-production mirror. |
| **Beta** | The only environment where corpus cases with `data_origin: "real"` (real, user-derived content) are permitted. Beta data is isolated from sandbox/staging at the database level via Postgres Row-Level Security (see `docs/adr/010`–`014` and `docs/test-harness/ethics-review-prep.md` for the full mechanism) and is subject to a retention window (default 90 days, `BETA_RETENTION_DAYS`, per ADR-013). |

Your account is only granted access to the environments listed in your `TestHarnessAccess` row —
environments you can't access show as disabled ("no access") in the dropdown, not hidden, so you
can see what exists without being able to select it.

[Screenshot: environment selector dropdown showing Sandbox/Staging/Beta with the color-coded dot]

## 3. The Dashboard (`/dashboard`)

The Dashboard is the harness's home screen — the root URL (`/`) redirects here. It's scoped to
whichever environment is currently selected. It shows:

- **Env status** — total run count and a breakdown by status (pass/halt/warning/error/running)
  for the selected environment, plus the timestamp of the most recent run.
- **Recent runs** — the last 10 `TestRun` rows, with status, agent, and altitude.
- **Gate summary** — for each named gate, how many APPROVED vs. REJECTED sign-offs exist and the
  most recent decision (who signed it, when, and which way).
- **Config-drift banner** — a read-only amber warning that appears when the currently pinned
  model config for this environment (from the Model Config Registry) differs from the current
  production model version/temperature in `apps/api`. This is intentionally non-blocking (see
  `docs/adr/012-test-harness-config-drift.md`) — there is no alerting infrastructure behind it,
  so you need to actually look at the Dashboard to notice drift.
- **PI-only gate sign-off** — a form (visible only to the PI role) to record an APPROVED or
  REJECTED decision against a named gate, optionally tied to a specific run and with a free-text
  evidence note.

[Screenshot: Dashboard showing env status, recent runs table, gate summary, and the config-drift banner]

**Gate sign-off is append-only.** Every sign-off you submit is written as a brand-new row in
`GateSignOff` — it is never an edit to an existing run or a previous sign-off. There is no "undo"
or "edit" action; if a decision needs to be revised, you sign off again with the corrected
decision and evidence, and the history shows both. This is a deliberate design choice so the gate
history is a trustworthy, immutable audit trail rather than a mutable status field.

[Screenshot: gate sign-off form with gate name, decision (Approved/Rejected), and evidence field]

## 4. Model Config Registry (`/config`)

This is where you pin the model version, temperature, prompt hash, and safety settings that a
given environment's test runs should use. Only the PI role can write to this registry
(`pinModelVersion`, `setTemperature` are PI-only procedures) — everyone with harness access can
view it.

- **Pinning a version** — the pin form lets you set a model version, prompt hash, and temperature
  for the current environment. Every pin is a new, immutable row (same append-only pattern as
  gate sign-offs) — pinning a new config never edits or deletes a previous pin, so any past
  `TestRun`'s config can still be reconstructed (its "frozen triple" — model version, prompt
  hash, temperature — is captured at run time).
- **Viewing prompt hashes** — the Prompt Registry table on this screen shows the current prompt
  manifest's per-file hashes, so you can confirm the pinned prompt hash matches what's actually
  deployed.
- **Frozen triple metadata** — historical runs show their frozen triple (the exact model
  version/prompt hash/temperature/safety settings that were pinned when that run happened), so
  results stay reproducible even after the registry moves on.

[Screenshot: Model Config Registry showing the current pin panel, the pin form, and the prompt registry table]

## 5. Reviewing blinded results and κ agreement (`/review/results`, PI-only)

Raters score blinded output at `/review` (see the Rater Guide for that flow). The **Review
Results** screen at `/review/results` is where you, as PI, look at the aggregate picture:

- **Inter-rater agreement (Cohen's κ)** — computed across blinded review ratings, so you can see
  how consistently raters are scoring the same items before trusting the aggregate scores.

[Screenshot: Review Results screen showing Cohen's κ agreement figures]

### Unblinding a specific item

Raters never see which model, run, or agent produced a given blinded item — that's the point of
blinding (see the Rater Guide for why). As PI, you can **unblind** a specific review item, which
reveals its underlying `run_id`. This is a deliberately narrow, explicit, PI-only action (the
`unblindResults` procedure rejects any non-PI role) — it does not unblind the whole queue, and it
does not change how the item was scored.

[Screenshot: unblind action on a single review item, revealing the run it came from]

## 6. Corpus manager — consent panel and beta isolation posture (`/corpus`)

The Corpus manager lets you view, create, and version corpus cases (safety, fidelity,
adversarial, persona types), across `synthetic`, `paraphrased`, and `real` data origins. The
harness enforces server-side that `data_origin: "real"` cases can only be created against the
**beta** environment — this cannot be bypassed by a client claiming a different environment.

Each corpus case has a **consent panel** showing whether an active consent grant exists for that
case (relevant when `data_origin` is `real`), with a "capture consent" action recording a new
consent grant (participant reference + scope).

[Screenshot: corpus case detail with the consent status panel and "capture consent" form]

This guide intentionally does not duplicate the full ethics/retention/isolation detail — for the
complete picture (the Postgres Row-Level Security mechanism, the 90-day beta retention policy,
known gaps, and what the ethics committee has reviewed), see
`docs/test-harness/ethics-review-prep.md`. The `/beta` screen also surfaces a rough, read-only
S3/S4 capture-verification proxy and the retention window for reference.

## 7. CI regression dashboard (`/ci`)

The `/ci` screen surfaces the GitHub Actions run history for `.github/workflows/regression.yml`
(the DB-free A8 router state-space regression check — see the Engineer Runbook for what it
covers and its scope limits):

- **Gate status** — recent regression workflow runs, mapped onto the harness's own run-status
  vocabulary (pass/halt/warning/error/running) so they render with the same badge as other runs
  in the harness.
- **Trigger a regression run** — manually kick off a `workflow_dispatch` run. Restricted to PI
  and ENGINEER roles (raters have no operational reason to trigger CI runs and are rejected).
- **Halt failures** — the subset of runs that failed, each linking out to the actual GitHub
  Actions log for drill-down.

[Screenshot: CI dashboard showing recent regression runs and the trigger button]

If `GITHUB_TOKEN`/`GITHUB_REPO` are not configured in this environment, these actions fail
gracefully with a clear "not configured" error rather than crashing the page.

## 8. Stochastic sampling runs and the budget cap (`/sampling`)

The `/sampling` screen runs an agent N times (N must be ≥ 200, enforced server-side, for a
statistically meaningful Wilson confidence interval) against a target metric and threshold, and
reports a Wilson CI on the pass rate.

Before you run a sample, the screen estimates the cost (in INR) for the configured model, N, and
average input/output token assumptions, and checks it against the environment's remaining
budget. **Sampling runs that would exceed budget are blocked** — `checkBudget` is evaluated before
`runSampling` is allowed to proceed. Review the estimated cost and the budget check result before
triggering a run, since N=200+ real model calls is not free.

[Screenshot: sampling config form showing N, target metric, threshold, estimated cost, and the budget check result]
[Screenshot: sampling results panel with the Wilson confidence interval]

---

## What's not here yet

This sprint's plan runs to 32 stories; as of this writing a few are still outstanding, most
relevantly:

- **TH-S28 (accessibility audit)** has not landed — screens have not yet been audited for
  accessibility (the `EnvironmentSelector` color-coding, for instance, has a comment noting
  colorblind labels are deferred to that story).
- **TH-S32 (final acceptance)** is still pending, so treat this guide as describing the harness
  as currently built, not as a finished, accepted product.
- There is currently no in-app primary navigation (sidebar/menu) — every screen described above
  is reached by direct URL.

If you notice a screen or behavior in the live app that doesn't match this guide, that's a signal
the guide (or the underlying story) is out of date — flag it to engineering rather than assuming
the guide is authoritative over the running app.
