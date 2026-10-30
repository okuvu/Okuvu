# Secret remediation — the credential leak in `okuvu/Okuvu` (E16-S8)

**Owner-facing. Every claim below was verified on 2026-10-30 against `origin/develop`
(`3534d59`) plus the full history reachable from all 77 refs; the commands and raw
output are in `evidence/E16-S8.md`.**

This document contains **no credential values**. Every secret is shown as its first six
characters followed by `…`. The scanner that produced these numbers (`scripts/secret-scan.py`)
masks the same way, so its output is safe to paste into a ticket.

---

## 1. What is exposed

| # | Credential | Where | Introduced | Removed | Commits containing it | Still in a branch tip? |
|---|---|---|---|---|---|---|
| 1 | Google OAuth **client secret** (`GOCSPX…`, 35 chars) | `apps/test-harness/.env.example:13` | `0a724b0` 2026-09-06 | `06424dc` 2026-10-28 | **74** | **Yes — 4 refs** |
| 2 | Google **API key** for the Android client (`AIzaSy…`, 39 chars) | `apps/mobile/android/app/google-services.json:23` | `7c4ef976` 2026-07-07 | `e25a4402` 2026-07-20 | **124** | No |
| 3 | Postgres URL with a `user:password` pair | `apps/test-harness/.env.example:9` | — | — | — | — |

Row 3 is on this list because the story expected it; **it does not exist.** The password in
every `postgres://` URL in this repository's history is a placeholder (`***`). See §1.3 —
the distinction matters, because rotating a credential that was never exposed wastes an
outage window and teaches the team to distrust the finding list.

### 1.1 The Google OAuth client secret — the one that matters

- **Value shape:** 35 characters, `GOCSPX…` — Google's live OAuth client-secret format, not a
  test string. Client id (public by design, and what identifies the client in the console):
  `971397352159-5gjlgjrarqqq633v6niftf773etj41f1.apps.googleusercontent.com`, project
  **`971397352159`**.
- **Exposure window:** committed 2026-09-06T04:52:43Z (`0a724b0`, "Test harness Environment
  (#195)"), replaced with an empty string 2026-10-28T12:04:48Z (`06424dc`, "Remove secrets
  from env example"). It sat in the default branch's tree for **54 days** while the
  repository was public.
- **Scope:** 74 commits reachable from the refs in this checkout contain the value, and
  75 of the 77 refs contain `0a724b0`. Deleting it in `06424dc` did not delete it anywhere
  else — every commit before `06424dc` still has it, and every clone already made has it.
- **Worse than "history":** four refs predate the removal and still carry the value in their
  *current tree* — `yashraj` (`298d261`) and `feat/agents-15` (`c49b747`), plus their
  remote-tracking counterparts on the `yashraj` remote. A single `git push` from any of them
  republishes the secret as a fresh commit. Fixing them is a **fast-forward**, not a
  rewrite: both commits are already ancestors of `origin/develop`, so moving the branches
  forward to `origin/develop` drops the file content with no history change at all (§5).
- **Runtime impact: none.** No live workload consumes it: `evia-beta-api`, `-worker` and
  `-portal` carry no `GOOGLE_*` environment variable or secret, and the GCP/Firebase stack
  it belonged to was removed in `e224874`. Rotating it therefore breaks nothing you run.
- **Is it still valid?** Not tested from this host — a credential-bearing request to a
  third party was deliberately not made. **Treat it as live until the console says
  otherwise**; the check is one command, in §2.

### 1.2 The Firebase/Android API key

- `AIzaSy…`, 39 characters, in `apps/mobile/android/app/google-services.json:23`, project
  `evia-500215`, package `ai.evia.app.beta`. Added 2026-07-07, deleted 2026-07-20; 124
  commits contain it, no branch tip does.
- **This is not a password.** Google ships Android API keys inside the APK by design; the
  key is public by construction and the control is *restriction*, not secrecy. It is a
  finding because an unrestricted key is a billing and quota problem, and because the file
  should never have been committed (`.gitignore` now blocks `apps/**/google-services.json`).
- **Action:** APIs & Services → Credentials → the key for `ai.evia.app.beta`. If it has no
  application restriction, add the Android restriction (package name + signing SHA-1) or
  delete the key. Do **not** put it on the "rotate every quarter" list — it is not a secret.

### 1.3 The Postgres URL — no password was ever committed

`apps/test-harness/.env.example:9` reads:

```
DATABASE_URL="postgresql://[user]:***@[host]/evia?sslmode=require"
```

The scanner found roughly **2,500** `postgres://`/`postgresql://` URL occurrences across
every commit reachable from every ref (the exact census is `evidence/E16-S8.md` §E9, which
is dated and reproducible; the counts below are that run's, newest first). **Every single
one** puts a placeholder where the password goes:

| Password shape | Occurrences | What it is |
|---|---|---|
| `[password]` | ~1,150 | documentation placeholder |
| `${urlencode(...)}` | ~360 | Terraform interpolation |
| `]+):([` | ~360 | a PowerShell regex matching a URL, not a URL |
| `%s` | ~200 | printf template |
| `${random_password…}` | ~150 | Terraform-generated, never the value |
| `***` | ~150 | mask |
| `${q(s.username)}` | ~100 | a script redacting the password |

**Conclusion: the test-harness database password is not in this repository's history.** The
only database facts disclosed are the username `test_harness_app` (in
`docs/test-harness/running-locally.md`) and the URL shape. Neither is a credential.

Rotation instructions are in §4 anyway, because you asked for them and because a real URL
pasted into that file *outside* git (a laptop, a chat, a screenshot) would not show up in
any history scan.

---

## 2. Rotate the Google OAuth client secret

This is a Google-side action with no AWS component. It takes about two minutes.

1. Sign in to the Google Cloud console as an owner of project **`971397352159`**.
2. **APIs & Services → Credentials → OAuth 2.0 Client IDs.** Open the client whose id is
   `971397352159-5gjlgjrarqqq633v6niftf773etj41f1.apps.googleusercontent.com`.
3. Choose one:
   - **Fast, if nothing uses it:** *Delete* the client. Recommended — the consumer
     (the GCP/Firebase stack) was removed in `e224874`, and a deleted client cannot be
     un-deleted or re-leaked.
   - **Zero-downtime, if something still uses it:** *Add secret* → put the new value in the
     consumer's environment → *Delete* the old secret. Do not leave two live secrets.
   - **Reset secret** replaces the value in place and breaks every consumer at once. Fine
     for this client, since there are none.
4. **Update the consumers** you control: any local `apps/test-harness/.env`, CI/GitHub
   Actions secrets, and the Vercel project environment for the test harness. Nothing in AWS
   reads it (verified).
5. **Verify the old value is dead.** From a machine you control, with the leaked value in a
   file (never in shell history), this request either proves the secret still works or
   proves it is revoked — a bogus `code` cannot mint a token either way:

   ```bash
   # OLD_SECRET is read from a file, not typed on the command line
   read -r OLD_SECRET < ~/.secrets/leaked-gocspx.txt        # then delete that file
   curl -s -X POST https://oauth2.googleapis.com/token \
     -d client_id=971397352159-5gjlgjrarqqq633v6niftf773etj41f1.apps.googleusercontent.com \
     --data-urlencode "client_secret=${OLD_SECRET}" \
     -d grant_type=authorization_code \
     -d code=4/0AfgeXvsOukuvuProbeNotARealCode \
     -d redirect_uri=http://localhost:3002/api/auth/callback/google
   unset OLD_SECRET
   ```

   - `{"error": "invalid_client", "error_description": "Unauthorized"}` → **revoked. Done.**
   - `{"error": "invalid_grant", "error_description": "Malformed auth code."}` → the secret
     still authenticates. The rotation has not taken effect; go back to step 3.
6. Record who rotated it and when, in the incident/rotation log, with the commit range from
   §1.1 so the next reader can see what was known at the time.

---

## 3. Rotate the test-harness database password

Only if you have a reason to believe a real value existed outside git (§1.3), or as a
precaution. There are two candidate databases; check which one the harness actually used.

**A. The legacy test-harness database** (`DATABASE_URL` pointed at a Neon branch named
`evia`). If that Neon project still exists: Neon console → Project → Roles → the
`test_harness_app` role → *Reset password*; then update every `.env` that referenced it and
re-run the harness once. If the project is gone, there is nothing to rotate — record that.

**B. The live database** (`evia-beta-postgres`, the RDS instance the beta stack uses). The
authoritative procedure is `docs/ONCALL-RUNBOOK.md` §5.1 — follow it rather than a copy of
it, because it encodes two defects this project has already paid for (the `sslmode` drop in
E16-S4 and the split-secret problem where `database_url` and `password` drift). In short:

```bash
export AWS_REGION=ap-south-1
NEWPW="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"

aws rds modify-db-instance --region "$AWS_REGION" \
  --db-instance-identifier evia-beta-postgres \
  --master-user-password "$NEWPW" --apply-immediately \
  --query 'DBInstance.DBInstanceStatus' --output text     # -> modifying
```

then update **both** `password` and `database_url` in the `evia-beta/database` secret in one
`put-secret-value`, redeploy all three ECS services with `--force-new-deployment`, and verify
with `scripts/in-vpc-db-task.sh --sql 'select current_user, now();'`. The old password is
gone the moment RDS accepts the change — RDS keeps no previous value, so "roll back to the
old password" is not an option; rotate again with a fresh one.

---

## 4. Do these have to be rotated even if the repository is made private?

**Yes.** Making the repository private does not undo a leak; it only stops *future* reads.
Every one of these is already true and none is reversed by the visibility toggle:

1. **It was publicly cloneable for 54 days.** GitHub serves public clones to anyone,
   unauthenticated, and `codeload` archives were available the whole time. You cannot
   enumerate who took one.
2. **Clones, forks and mirrors keep their own copies.** A private repository does not reach
   into a clone on someone's laptop, a CI cache, a fork, or a third-party mirror. The four
   stale refs in §1.1 are a live example inside this one checkout.
3. **Git history is not edited by a visibility change.** `0a724b0` still contains the value;
   `git show 0a724b0:apps/test-harness/.env.example` still prints it to anyone who already
   has the repository, including every collaborator and every bot with a token.
4. **A private repo still leaks to more people than a secret should reach** — all
   collaborators, all installed GitHub Apps, all CI systems with a checkout.
5. **Only the issuer can end the exposure.** Revoking at Google is the single action that
   makes the published string worthless. Everything else — private, history rewrite,
   deleting the branch — is about the string's *availability*, not its *validity*.

Rewriting history (`filter-repo`, `filter-branch`) is **not** a substitute and is not
recommended here: it changes every commit SHA after `0a724b0`, invalidating every clone,
every open pull request and every recorded build image tag, while leaving copies in every
clone that already exists. If the owner wants the value gone from `origin` as well, that is a
separate decision to take *after* revocation, with the team told to re-clone.

---

## 5. Closing the four stale refs (owner action, no history rewrite)

`yashraj` (`298d261`), `feat/agents-15` (`c49b747`) and their remote-tracking counterparts
still have the secret in their tree. Both commits are ancestors of `origin/develop`, so
moving the branches forward is a **fast-forward** — no rewrite, nothing lost:

```bash
# on the personal remote (git@github.com:yashraj-ops/Okuvu.git)
git push yashraj origin/develop:refs/heads/develop
git push yashraj origin/develop:refs/heads/feat/agents-15

# local branches tracking them
git branch -f yashraj origin/develop
git branch -f feat/agents-15 origin/develop
```

The `yashraj-ops/Okuvu` repository returned **404 to an unauthenticated request** on
2026-10-30, so it is either private or gone; it could not be checked further without
credentials. Treat the refs above as the local copies that would re-publish the value.

---

## 6. What the build does now

`scripts/secret-scan.py` runs in `pre_build` (`buildspec.yml`) in two modes:

- **`tree` — fail-closed gate.** Any new secret in the working tree, an unreadable file, a
  missing or malformed allowlist, or a crash fails the build before anything is pushed.
  Detects `GOCSPX-`, `AIza`, `AKIA`/`ASIA`, `ghp_`/`gho_`/`github_pat_`, PEM private keys,
  `postgres://` URLs with a real password, `sk-`/`sk-ant-`, `xox[bap]-`, and high-entropy
  strings in config files.
- **`history` — advisory report.** Prints every historical finding with commit, path and
  masked value, and never fails the build. A permanently red gate for a leak no pull request
  can fix gets disabled within a week, and then it protects nothing.
- **`scripts/secret-scan-allowlist.txt`** suppresses working-tree findings only, requires a
  written justification per entry, and fails the build if it is missing, unparsable, names
  an unknown rule, or carries a token-length "reason". Historical findings are not
  suppressible this way.

Proof that the gate bites, and that it does not cry wolf, is in `evidence/E16-S8.md`
(4 controls + a per-rule matrix, re-runnable with `python3 scripts/verify-secret-scan.py`).

What the gate does **not** do: it does not stop a push (that is GitHub push protection /
secret scanning, which should also be enabled on the repository), it does not scan
dependencies, and it cannot rotate anything. **Detection is not remediation** — this
document is.

---

## 7. Owner checklist

- [ ] Delete (or reset) the OAuth client in project `971397352159` — §2.
- [ ] Prove the old secret is dead with the `invalid_client` probe — §2 step 5.
- [ ] Restrict or delete the Android API key for `ai.evia.app.beta` — §1.2.
- [ ] Rotate the database credential **only if** a real value ever existed outside git — §3.
- [ ] Fast-forward the four stale refs — §5.
- [ ] Enable GitHub secret scanning + push protection on the repository.
- [ ] Decide on private visibility as a *separate* control, not as the fix — §4.
- [ ] Record the rotation in the incident log with the commit ranges from §1.1.
