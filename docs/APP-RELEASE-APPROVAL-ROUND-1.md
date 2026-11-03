# Release approval — Round 1 (changes 1–8)

**Document purpose.** One place to read all eight changes requested from the user's side,
the technical work that carries each one, and the exact steps to put them live. An approver
should be able to sign this off without reading any code.

**Prepared:** 3 November 2026, 13:30 UTC — **updated 13:40 UTC** after the server rollout completed
**Branch:** `feat/app-change-round-1` (committed) → merges to `develop`
**Companion file:** `docs/APP-CHANGE-LOG.md` (the running list, one row per change)

> **What changed since the first draft of this page:** the server half of changes 1–7 went live
> while this document was being written (build `cd2eaaf0`, SUCCEEDED 13:39 UTC). The database
> migration has been applied to the production database. Section 5 has the verified detail, and
> the approvals below have been narrowed to what is still outstanding — A1 is now row 8 only.

---

## 1. What is being asked for

Three separate approvals, not one. They are listed separately because they carry different
risks and different people own each:

| # | Approval | What it authorises | Risk if wrong |
|---|----------|--------------------|---------------|
| **A1** | **Code release** | Server (api), worker, therapist portal and one database change go live together | Therapy-facing service briefly rolls to the new version; a bad release is fixed by re-pointing to the previous version |
| **A2** | **Cloud (AWS) change** | A new encrypted storage slot plus permission for the API to read it | Security-relevant: grants the API permission to decrypt one specific item. Scoped to that one item only |
| **A3** | **App release** | A new Android build (APK) is produced and installed on the test phone | Only affects whoever installs it; the old build can be reinstalled if needed |
| **C1** | **Clinical sign-off** *(Dr Shubhangi Goswami)* | The 52 journal prompts are acceptable for clients to read | Clinically unverified wording reaching a client. **This one is a hard gate for change 5** |

If C1 has not arrived in writing by the time we are ready to build the app, the release
proceeds with changes 1–4 and 6–8, and change 5 waits. That is a choice the approver makes
here, not something decided later.

---

## 2. The eight changes, in plain English

Each line is what a user sees or can do. No technical terms.

1. **The welcome page no longer appears every time.** "Your space is ready / Let's begin" now
   shows on the first launch only. After you tap "Let's begin" once, later opens go straight
   to the home page. *Why it was broken: the app's record of "welcome already seen" was only
   ever saved by a screen this user never passed, so it stayed blank forever.*

2. **All four breathing techniques, not just box breathing.** The Breathe screen now offers
   Box breathing (still first), Guided breathing, Physiological sigh and Extended exhale.
   Each technique remembers its own Slower / Standard / Faster pace, so changing one does not
   change the others. A technique assigned by the therapist is marked "from your therapist".
   *The fifth item in the therapist portal is 5-4-3-2-1 grounding, which is a noticing exercise
   rather than a breathing one; it stays available only when assigned.*

3. **You can read your old conversations.** A small clock icon at the top of the chat screen
   opens "Past conversations" — every finished chat, newest first, with its date, message count
   and first line. Tapping one reads the whole conversation back. Saved chats open read-only,
   with a "Start a new conversation" button. *Why it was broken: messages were always being
   saved, but nothing in the app ever read them back. Old chats were never lost.*

4. **Journal saves without a mood.** The feeling and strength questions are marked
   "(optional)". Typing alone is enough to save. An entry with no feeling is stored as "no
   mood" — nothing is guessed or filed under "Other".

5. **"Get a prompt" works.** It now draws from a fixed, reviewed library of 52 prompts grouped
   by feeling, with 12 for when no feeling is picked. The prompt appears in the writing box
   ready to write under, is added after existing text rather than replacing it, and has a
   single "Undo". It still answers with no network, because the app keeps a copy of the
   general prompts. *Why it was broken: the button previously asked an AI to invent a
   sentence on every tap and showed nothing when that was slow; in the server's records the
   request never once arrived.*

6. **Tapping a feeling now visibly responds.** The chosen feeling gets a violet outline, a
   tick, bolder text, and a small vibration. Tapping it again un-picks it. A "Clear" link
   appears once something is chosen. The strength dots are twice the size to hit. *Why it
   felt dead: the tap was always received, but the colour changed by under 2% — invisible on
   a phone.*

7. **One name everywhere.** The home page greeted "S" while Settings › Profile said
   "Shubha G". The greeting now reads the Profile name ("Good evening, Shubha"), and a name
   saved in Profile appears on the home page immediately, with no restart.

8. **Settings now tell the truth.** Emergency Contact genuinely never saved — the server
   could not encrypt it because the security key it needs had never been created and it had
   no permission to read one. That is fixed. The other switches (Voice, Quote of the Day,
   Language, Notifications) used to move instantly and discard the server's answer; now each
   one waits for the server, and if the save is refused the switch returns to its old
   position and says so. One open item: two consent-screen saves were refused on 2 November
   and the log cannot say which app build sent them, so no code was changed on a guess.

---

## 3. What has to ship — technical requirements

Four separate packages. All four are needed for the release to be complete; the first three
are one pipeline, the fourth is not.

### 3.1 Server (api, worker, therapist portal) — approved as A1

Deployed by the existing CodeBuild pipeline on push to `develop`. It rolls all three services
together regardless of which one changed.

New endpoints:

| Endpoint | Purpose | Guards |
|---|---|---|
| `GET /sessions` | List the signed-in user's finished chats | Auth required; own sessions only; only sessions holding messages; max 50 |
| `GET /sessions/:id` | Read one conversation transcript | Auth required; owner-scoped lookup, another user's id answers 404 |
| `GET /journal/prompts?emotion=` | Serve the prompt library | Auth required; no model call, no budget spend; 503 rather than a library that fails its own validation rules |

Changed behaviour:

- `POST /journal` — `emotion` and `intensity` are now optional. A strength sent without a
  feeling is rejected (`INTENSITY_WITHOUT_EMOTION`); unknown feelings are still rejected.
- `GET /users/me/today` — returns `toolPacePresets` for every breathing tool, not only box
  breathing.
- No existing request or response shape is broken. The **old** app build, which always sends a
  feeling, is still accepted. Nothing already on the phone stops working because of this
  release.
- `POST /journal/prompt` (the AI-generated path) is left in place, unchanged and unadvertised.
  No feature calls it.

### 3.2 Database — one migration, **already applied to production**

- Folder: `packages/prisma/migrations/20261103120000_journal_entry_optional_mood/migration.sql`
- Effect: drops the "must not be empty" rule on the two mood columns of the journal entries
  table. Two `DROP NOT NULL` statements. **No data is rewritten and no row is deleted** — a
  blank mood is a real answer and is not backfilled into "other"/1.
- Ordering: sorts after every existing migration on `develop`, verified.
- Applied automatically by the pipeline's `prisma migrate deploy` step, before the services
  roll. **Applied to the production database at 13:31 UTC on 3 November 2026** — the build log
  records `Applying migration 20261103120000_journal_entry_optional_mood` followed by
  `All migrations have been successfully applied.` (49 migrations in the set.)
- Tolerated by the previous server version, so a rolled-back api does not require a database
  rollback.

### 3.3 Phone app (Android) — approved as A3

- Screens/behaviour changed: welcome/cold-start, breathing, chat + new Past conversations
  (two new screens), journal + Journal history, home greeting, settings (voice, quote, language,
  notifications, emergency contact) with save-failure messages.
- Plain-language model: 2 new model files for history, 1 new service for prompts,
  1 new feedback helper for settings. No new permissions requested, nothing new leaves the
  device except the requests listed in 3.1.
- **Version must be bumped before building.** The branch carries `1.0.6+7`; `develop` carries
  `1.0.8+9`; the build already handed out was `1.0.7+8`. Android refuses to install a lower
  version over a higher one and does not always warn, so the release build must be
  **`1.0.9+10`**. This is a required step in the runbook, not an optional tidy.
- Build must come from a dedicated worktree on the release branch, via
  `scripts/build-release.sh`, so the provenance record is written. A bare `flutter build`
  produces an artifact the gate refuses.
- Distribution: no public Play listing exists (`play.google.com/…?id=ai.okuvu.app` returns
  404), so "live" for the app means installed on the handset. Side-loaded APK.

### 3.4 AWS infrastructure — approved as A2, applied **separately**

This is the part the code pipeline does not do. Changes live in
`infrastructure/aws/evia-beta/`:

| File | Change |
|---|---|
| `secrets.tf` | Creates the missing secret `evia-beta/emergency-contact-key` — 32 random bytes, base64, encrypted with the existing secrets key. This is the item that was never created, and the reason Emergency Contact could never save |
| `iam.tf` | Adds `ReadEmergencyContactKey` (`secretsmanager:GetSecretValue`, `DescribeSecret` — on that one secret only) and `DecryptEmergencyContactKey` (`kms:Decrypt` on the secrets key) to the api task role, which previously had no secret-read permission at all |
| `ecs.tf` | Sets `AWS_SECRETS_PREFIX=evia-beta` on the api task, because without it the code asks for the bare secret name `emergency-contact-key`, which does not exist |

- `terraform validate` clean. Targeted plan result: **3 to add, 0 to change, 0 to destroy.**
- Security note for the approver: this widens one role from "no secret access" to "read and
  decrypt exactly one secret". It does not grant access to other secrets.
- Cost: negligible — one small secret, no new always-on resource.
- State caveat: the S3 state backend block in `providers.tf` is commented out, so this apply
  uses local state. Whoever applies it must do so from the machine that holds the matching
  state, or the apply will try to recreate resources that already exist. This must be
  confirmed before the apply, not discovered during it.

---

## 4. Gates that must be met before release

| Gate | Evidence | Status |
|---|---|---|
| Server test suite | 1,681 of 1,681 pass | Met |
| Server settings tests (row 8) | 32 of 32 pass | Met |
| App test suite | 307 of 307 pass | Met |
| App static analysis | `flutter analyze` clean on touched files | Met |
| Server typecheck | `tsc --noEmit` clean | Met |
| Database migration reviewed and correctly ordered | Folder sorts after all existing migrations | Met |
| Infra plan | 3 add / 0 change / 0 destroy | Met |
| **Server changes 1–7 deployed** | Build `cd2eaaf0` SUCCEEDED; api/worker/portal all serving it | **Met — 13:39 UTC 3 Nov** |
| **Migration applied to production** | `Applying migration 20261103120000_…` in the build log | **Met — 13:31 UTC 3 Nov** |
| **Clinical sign-off on the 52 prompts (C1)** | Dr Goswami's written reply | **Outstanding** |
| **On-device test** | A human installing and pressing the screens | **Outstanding — cannot be done on this host** (no phone, no emulator) |
| **Live proof of the Emergency Contact fix** | A 200 on `PATCH /settings/emergency-contact` in the server log after the row 8 deploy | **Outstanding — needs a signed-in user token, which this host does not hold** |

Two honest limits worth stating plainly to whoever signs: no screen in this release has been
looked at on a real phone, and the Emergency Contact fix cannot be proven from this host.
Both are covered by verification steps in §6, but neither can be reported as already proven.
The database migration, previously on this list as unexecuted, has now run in production.

---

## 5. State of the world as of 13:40 UTC, 3 November

**Live now, verified from outside:**

- Production api answers `GET /health` with commit `d0a00f5a859f` — the sha that was pushed.
- Build `evia-beta-build:cd2eaaf0` finished `SUCCEEDED` at 13:39 UTC and its own log ends with
  `OK api: …:65`, `OK worker: …:64`, `OK portal: …:66` and
  `All three services are serving this build` — i.e. no service rolled back to an older version.
  Those three revision numbers are the rollback targets for changes 1–7.
- The database migration was applied at 13:31 UTC, before the services rolled.
- The three new endpoints exist and are gated: `/sessions`, `/journal/prompts` and
  `/users/me/today` all answer **401** without a token. A missing route would answer 404, so
  this is the proof the routes are in the running image.

**So changes 1–7 are live on the server.** They are still invisible to the user, because the
phone is running an older app build and every one of these changes is a screen change.

**Still outstanding:**

- **Change 8 is not merged.** Its two commits sit on `feat/app-change-round-1`, which is
  4 commits behind `develop`, so it needs a rebase and a re-gate before it can go. Nothing in
  change 8 (the AWS secret, the IAM permission, the honest save behaviour) is live.
- **No APK has been built from this round.** The version on `develop` is `1.0.8+9`; the build
  handed to the phone so far was `1.0.7+8`, so the release build must be `1.0.9+10`.
- **The Emergency Contact fix is unproven end to end** until a signed-in save returns 200, and
  it cannot be until change 8 ships.

This matters for the approval: A1 as it stands now covers **change 8 only** — the server half of
changes 1–7 is already running. A2 and A3 are fully open.

---

## 6. Release runbook

Order matters. Step 1 before step 2, because the api code in step 2 expects the secret and the
permission to already exist.

1. **Confirm Terraform state location, then apply infrastructure (A2).**
   `cd infrastructure/aws/evia-beta && terraform plan` → expect 3 add / 0 change / 0 destroy.
   Then `terraform apply`. Registers a new api task definition revision carrying
   `AWS_SECRETS_PREFIX` and creates the secret. Note the **previous revision number** — that is
   the rollback target.
2. **Rebase change 8 onto `develop` and re-gate.** In a throwaway worktree:
   `pnpm install --frozen-lockfile --offline`, `prisma generate`, api `vitest run`,
   app `flutter test`, `flutter analyze`. Then push `develop` once. That push is the deploy:
   one rollout of api + worker + portal. *Changes 1–7 already took this path and are live —
   this step now carries change 8 alone.*
3. **Bump the app version to `1.0.9+10`** on `develop` before building.
4. **Build the app (A3)** from a dedicated worktree with
   `bash scripts/build-release.sh --bundle`, then `python3 scripts/verify-mobile-release.py`.
   All six gates must pass; a FAIL blocks the artifact. Deliver the APK path and hash.
5. **Install and test on the phone.** The on-device pass is the user's: welcome page once, four
   breathing techniques, Past conversations, journal save with no mood, Get a prompt, feeling
   chip feedback, name on home, and each Settings switch (including Emergency Contact).
6. **Verify from outside, in this order** — the first three are **already done for changes 1–7**
   and are listed so the same checks are repeated for change 8:
   - `curl -s https://api.okuvu.in/health` → commit equals the sha pushed in step 2.
     *(Done: `d0a00f5a859f`.)*
   - Build log contains `Applying migration` with the migration's name.
     *(Done: applied 13:31 UTC.)*
   - Build log ends with `OK api`, `OK worker`, `OK portal`.
     *(Done: revisions 65 / 64 / 66.)*
   - Server log shows a 200 on `PATCH /settings/emergency-contact` when the user saves it —
     this is the only real proof the A2 fix worked.
   - `GET /journal/prompts` answers 200 for a signed-in user. *(Currently 401 without a token,
     which proves the route is live and gated; the 200 needs a real session.)*
7. **Flip the log.** Each row in `docs/APP-CHANGE-LOG.md` goes `Ready` → `Live`, with the
   release number recorded under "Releases".

**Rollback.** Server: point the api/worker/portal services back at the revision number recorded
in step 1 — no code revert needed. Database: no rollback required, the migration is
backwards-compatible. App: Android will not install a lower version over a higher one, so the
previous APK cannot simply be re-installed — the fallback is a new build with a higher version
number, which is a 20-minute rebuild, not a rollback.

---

## 7. Risks and open items

1. **Change 5 is clinically unsigned.** Prompts written by me, not by Dr Goswami. Hard gate:
   her written reply, or change 5 waits. *(The library is already live on the server, but no
   released app can reach it — the button that calls it ships with the new APK. Holding change 5
   therefore means holding the APK, not rolling anything back.)*
2. **The database migration is done** — applied in production at 13:31 UTC, no errors, no
   rollback needed. This one is closed.
3. **No screen in this release has been seen on a phone.** This host has no device and no
   emulator. All app verification is tests and static analysis.
4. **Emergency Contact's fix is unproven end-to-end** until a real signed-in save returns 200.
   The infra change is proven by plan only.
5. **Consent screen still unexplained.** Two saves were refused on 2 November; the log cannot
   say which build sent them. Deliberately not "fixed" by guessing.
6. **Terraform local state.** If the apply is run from a machine without the matching state
   file, it will attempt to recreate existing resources. Confirm the state location first.

---

## 8. Approval

Tick and sign. One line per approval; C1 is Dr Goswami's.

- [ ] **A1 — Code release approved (change 8).** Merge change 8 to `develop`; api, worker and
      portal go live. *Changes 1–7 already deployed this way at 13:39 UTC and need no approval.*
- [ ] **A2 — AWS infrastructure change approved.** Create `evia-beta/emergency-contact-key`,
      grant the api role read + decrypt on that one secret, set `AWS_SECRETS_PREFIX`.
- [ ] **A3 — App release approved.** Build `1.0.9+10`, pass the six release gates, install on
      the test phone.
- [ ] **C1 — Clinical sign-off received** (Dr Shubhangi Goswami) on prompt library v1.0.0,
      52 prompts. Reference: email of 3 November 2026, message id `1a1a081322a9bb6b`.
      *Reply "approved as listed", or name the ids to remove/edit (each prompt carries an id
      such as ANX-01, SAD-02).*

**If C1 is not ticked:** release changes 1–4 and 6–8; hold 5 for the next build.
State that choice here, so it is not re-decided at the build step:

> Decision on change 5 if C1 is outstanding:  hold  /  release as-is  (delete one)

Approved by: ______________________  Role: ______________________  Date: ____________

---

*Technical companion: `docs/APP-CHANGE-LOG.md` holds the same eight changes with the files,
commits and per-change test counts. This document is the approval and runbook layer on top of
it — if the two ever disagree, the change log is the record of what was built and this document
is out of date.*
