# Play launch — day 0 state and the 14-day path

Written 2026-11-04 18:10 IST. This is the record of what was proven today about the
Play account, and the sequence that turns it into a public listing. Numbers here were
produced by API calls and a gated build, not estimated.

## What is proven, today

| Fact | Evidence |
|---|---|
| The Publisher API key can open an edit on `ai.okuvu.app` | `edits.insert` → 200 + edit id, `edits.delete` → 204 |
| The same key **cannot publish** anything | commit of a text-only, icon-only and screenshot-only edit each returned **403 PERMISSION_DENIED**; a commit of an *empty* edit returned 200, so the gap is store-presence/release permission, not the key |
| No AAB has ever been uploaded | `edits.bundles.list` → empty |
| No release has ever been created | `edits.tracks.list` lists production/beta/alpha/internal with no releases |
| No testers are configured | `edits.testers.{alpha,beta,internal}` → `{}` |
| The store listing is a bare title | `edits.listings.list` → `{language: en-GB, title: "Okuvu"}`; no description, no icon (512), no feature graphic, no screenshots |
| Nothing is publicly published | `https://play.google.com/store/apps/details?id=ai.okuvu.app` → 404 |
| A signed, gated release artifact exists | `1.0.9+10`, AAB sha256 `329d1c41…35fa0`, signer `CC:B4:CA:…:FF:96`, `verify-mobile-release.py` → **RELEASE OK, 26/26** |

Artifact: `/opt/data/okuvu/wt/ship-1.0.9/apps/mobile/build/app/outputs/bundle/prodRelease/app-prod-release.aab`
(58,422,931 B). Built from `91900f5` on `release/mobile-1.0.9`; the only later commit on
that branch touches a widget *test* import, not `lib/`.

## The 14-day clock: what it actually depends on

The 12-tester / 14-day closed-test rule applies only to **personal** developer accounts
created after 2023-11-13. An **organisation** account skips it and can go straight to
production review. The account type is not exposed by any API — it is a console fact and
in the repo it is still recorded as unknown (`docs/CLINICAL-DECISION-RECORD.md`).

Consequences, stated as dates:

- **Organisation account** — upload today, review 1–7 days, live ~11–18 Nov.
- **Personal account** — 12 testers must be *opted in* (join via the opt-in link, not just
  invited) and stay opted in continuously. Clock starts the day the twelfth tester joins.
  14 days later, apply for production access; that application is itself reviewed.
  Upload today with testers joining 4–5 Nov ⇒ earliest apply 18–19 Nov ⇒ **live ~20–26 Nov.**

So "live in 14 days" is achievable only on an organisation account, or with testers
joining today. Nobody can compress the clock by uploading sooner.

## Day 0 — the three console actions only the owner can do

1. **Grant the API key permission.** Play Console → Users and permissions → Invite new
   users → `id-play-publisher@okuvu-play-api.iam.gserviceaccount.com` → Account permissions:
   **Admin (all permissions)**. Without this every upload, listing write and tester change
   stays manual; with it, steps 3 onward are one script.
2. **First AAB upload** (enrols Play App Signing; console-only, no API equivalent).
   Testing → Closed testing → Create track → Create release → upload
   `app-prod-release.aab`, release name `1.0.9 (10)`.
3. **App content declarations** — Data safety, content rating questionnaire, target
   audience, ads, privacy policy `https://okuvu.in/privacy`, terms of service
   `https://okuvu.in/terms`, account deletion `https://okuvu.in/delete-account`, and
   reviewer sign-in credentials with App access. Nothing on a testing track is reviewed
   before these exist.

## Then, in order

4. Add 12–20 tester Google accounts to the closed track (API: `edits.testers.update`).
   Invite more than 12: one dropout mid-window breaks the run.
5. Get the twelve opted in (they must accept the link, not just receive the mail).
6. Push listing text + icon + feature graphic via the API once permission exists
   (`docs/store/listing-copy.md` is the source of truth; `scripts/play-store.py`).
7. Screenshots — still **blocked on device**: 2–8 phone shots, no alpha, aspect ratio
   ≤ 2:1, per `docs/store/screenshot-capture-plan.md`. Not needed for closed testing,
   mandatory before production review.
8. Apply for production (personal accounts only), answer the review questions, then
   roll out. Play has no version rollback: recovery is a higher versionCode.

## Environment note

`flutter build` on this host is memory-bound: a first attempt died with
`Gradle build daemon disappeared unexpectedly` because another session's ffmpeg render
held ~1.4 GB. The successful run used
`GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx1536m -Dorg.gradle.workers.max=2 -Dorg.gradle.daemon=false"`
with ≥3 GB free. The verifier needs `$JAVA_HOME/bin` on `PATH` or it reports
`signer: <none>` for a correctly signed artifact.
