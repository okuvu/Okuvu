# The release-gate ledger — why a failed security scan now stops a deploy

Status: code on `fix/security-gate-blocks-deploy`, not merged, not deployed.
Written 10 Nov 2026.

## The defect

CodeBuild runs later phases after an earlier phase fails. Every build in the
project's history for 7–10 Nov 2026 has this shape:

```
BUILD        FAILED       Error while executing command: python3 scripts/security-gate.py ecr ...
POST_BUILD   SUCCEEDED    prisma migrate deploy, register-task-definition ×3, update-service ×3
```

Three sources of evidence, all checked against AWS on 10 Nov 2026:

* `aws codebuild batch-get-builds` for `evia-beta-build` — nine consecutive builds
  with `BUILD: FAILED` and `POST_BUILD: SUCCEEDED` (ids `63f1732a`, `c98f72fc`,
  `4b05bb4b`, `56295824`, `acfae838`, `24b64f13`, `c171abba`, `d1db4362`,
  `de29c606`, `063d76d2`, `02ef8dec`).
* The ECS services moved on 9 Nov at 17:16 while the 17:11 build had failed.
* The failing finding is one CRITICAL: **CVE-2026-4738** (`zlib 1.3.2-r1` in the
  Node base image, `fixed_in_version: null`), present in the images that were
  live *before* this release as well as after.

So the gate had been red for days and production kept changing. A gate that only
colours the build red is a dashboard. The `|| true` was never the problem — the
phase order was.

## What changed

`scripts/release-gates.py` keeps a per-build ledger at `/tmp/release-gates.json`
(one build = one container, so `/tmp` is per-build; `buildspec.yml` already relies
on this for the deploy-scope decision).

Six gates, each recording its own pass immediately after it succeeds:

| gate | what it proves |
|---|---|
| `secret-scan` | no new credential in the working tree |
| `typecheck` | api, worker and portal compile |
| `unit-tests` | the three test suites pass |
| `dependency-audit` | no CRITICAL advisory in production dependencies |
| `esm-imports` | no container-only `ERR_MODULE_NOT_FOUND` |
| `ecr-image-scan` | no CRITICAL CVE in the three pushed images |

The ledger is created empty by `reset` at the start of `pre_build`, and **only**
`reset` creates it. Then three guards, at three distances from the danger:

1. `post_build` opens with `release-gates.py require` — before the migrate block.
2. The migrate block calls `require` again immediately before `prisma migrate deploy`.
3. The rollout block calls `require` again immediately before the first
   `deploy_service`.

Guard 1 alone would depend on CodeBuild's phase semantics; guards 2 and 3 travel
with the dangerous command, so reordering the buildspec or a change in CodeBuild's
phase behaviour cannot reopen the hole. Every failure mode is a refusal:

| situation | result |
|---|---|
| a gate failed | its `record` never runs → gate missing → refuse |
| a gate never ran (phase skipped, build crashed) | gate missing → refuse |
| `/tmp/release-gates.json` missing | refuse |
| ledger is corrupt or not JSON | refuse |
| ledger is for another commit | refuse |
| build has no `CODEBUILD_RESOLVED_SOURCE_VERSION` | refuse |
| ledger says `ok: false` | not a pass → refuse |
| all six recorded for this commit | deploy proceeds as before |

Exit codes are `0` pass, `1` refusal, `2` usage/tooling error. There is no code
that means "probably fine".

## Exceptions, because the gate must be able to pass

CVE-2026-4738 has **no fixed version** in this base image, so an unconditional
gate would block every deploy until the base image changes — and a gate that can
never pass gets deleted, which protects nothing.

`scripts/security-gate-exceptions.json` (empty by default) can except one named
CVE, with a reason, an owner and an expiry date:

```json
{"exceptions": [
  {"cve": "CVE-2026-4738",
   "reason": "gdal's bundled zlib is not on the Node request path; no fixed package exists",
   "owner": "Rajwant",
   "expires": "2026-12-10"}
]}
```

* An entry is a **risk acceptance in a reviewed file**, not a config toggle.
* Every use is printed in the build log: `EXCEPTED CVE-2026-4738 (owner Rajwant,
  expires 2026-12-10): ...`.
* An **expired** entry is a failure, not a warning.
* A CRITICAL finding **without** an entry is still a failure.
* An unparseable exceptions file is a failure (an unreadable list is not consent).

The file ships **empty**. Consequence, stated plainly: the next code push to
`develop` will fail the gate on CVE-2026-4738 and, for the first time, will not
deploy. Either the base image gets the fix or someone writes that entry down.

## Proving it

```
python3 scripts/verify-release-gates.py      # 50 cases, exit 0
python3 scripts/verify-deploy-scope.py       # 32 cases, exit 0 (unchanged behaviour)
```

The harness runs the **shipping** shell blocks from `buildspec.yml` (extracted,
never copied) against a stubbed `aws`, `npx` and gate:

* all six gates recorded → `3-register-3-update`, migrations run — unchanged
  behaviour on a good build;
* `ecr-image-scan` missing → **exit 1, zero register, zero update, no migration**
  (this is the regression that was live);
* `secret-scan` / `unit-tests` missing → same refusal;
* no ledger, corrupt ledger, another commit's ledger → same refusal;
* structural: each gate command is immediately followed by its `record`, `reset`
  precedes the first gate, the ecr gate reads the exception list, both mutating
  blocks call `require` before their danger, and every block passes `bash -n`.

Negative control: run the same harness against `main`'s `buildspec.yml` and it
fails 20 cases — including `rollout/ecr-gate-missing` reporting
`exit-0 reg-3 upd-3` — which is the defect reproduced.

## Operational notes

* A red build now means nothing was deployed. That is new; before, red meant
  "probably deployed anyway". Check `post_build` in the build detail, not just the
  colour.
* `RESET_DATABASE` and the migrations run behind the same guard as the rollout.
* The history report from `secret-scan.py` stays advisory on purpose; the
  working-tree scan is the gate.
* Deployment mechanics are unchanged: `scripts/deploy-beta.sh` and
  `deploy-worker.sh` still pin images the same way the build does. A manual
  deploy bypasses the ledger — that is a deliberate human action, and should be
  recorded in the release note.
