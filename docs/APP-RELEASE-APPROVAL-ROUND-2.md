# Release approval — Round 2 (changes 9–21)

**Document purpose.** Everything requested from the user's side in round 2 — the
emergency-contact fix and the whole Breathe rebuild — written so someone who does not read
code can see what changed, what already shipped, and the single action that is still left.
Round 2 is **already merged and live on the server**; this pack is the record of it plus the
one open decision (installing the new app build).

**Prepared:** 5 November 2026, 07:35 UTC
**Branch:** `feat/app-change-round-2` (commits `45cf26b`…`89308ab`) → merged to `develop` as `940edf861bae`
**Companion files:** `docs/APP-CHANGE-LOG.md` (one row per change, files and test counts),
`docs/CLINICAL-REVIEW-BREATHING-COPY.md` (Dr Goswami's signed-off copy).

If this document and the change log disagree, the change log is the record of what was
built and this document is out of date.

---

## 1. What is being asked for

Four things, split by the risk each one carries. Three are already done; the fourth has not
happened yet.

| # | Approval | What it authorises | State | Risk if wrong |
|---|----------|--------------------|-------|---------------|
| **A1** | **Code release** (server, worker, therapist portal, one database migration) | Therapy-facing services roll to the new version | **Done — live 5 Nov 2026 04:21 UTC** (rollback: api `:66`, worker `:64`, portal `:66`) | A bad release is undone by pointing the services back at the previous revision |
| **A2** | **Cloud (AWS) change** | The API may read one specific encryption key | **Done — live 3 Nov 2026 18:29 UTC** (it is row 8's infra half, carried over) | Security-relevant but narrow: one role, one secret, read-and-decrypt only |
| **A3** | **App install** | The new Android build `1.0.10+11` is installed on the test phone | **OPEN — this is the only thing left** | Only affects the handset it is installed on; the previous APK reinstalls over it |
| **C2** | **Clinical sign-off** (Dr Shubhangi Goswami) | The breathing techniques, their copy, the pace numbers and the pause/break wording | **Received 3 Nov 2026 19:15 UTC** — "approved with changes", built to her text | Clinically unverified instruction reaching a client at a vulnerable moment |

**Nothing is held on clinical grounds.** Dr Goswami's reply is quoted in
`docs/CLINICAL-REVIEW-BREATHING-COPY.md` with its message id; the copy in the app carries her
version and approval date, so editing a sentence after approval is visible in the file and
needs a fresh review.

---

## 2. The changes, in plain English

### Settings

9. **The Emergency Contact phone number now saves, as a plain 10-digit number.** Type
   `9876543210`, tap Save, it saves. Anything that is not exactly ten digits shows
   "Enter a 10-digit phone number (e.g. 9876543210)" instead of sending something the server
   will refuse. *Why it was broken: the number was never the problem. The server had no
   encryption key installed and no permission to fetch one, so every save failed before the
   number was looked at. That was fixed in row 8; this round changes the format and the
   validation.*

### Breathe

10. **One drop-down instead of four big buttons, so the guide is visible.** The exercise list
    used to take most of the screen. It is now a single "Exercise" drop-down at the top, with
    the breathing visual below it fully in view.
11. **A small (i) explains each technique.** Next to the drop-down. Tap it and you get plain
    words on what the technique is, how to do it, why it helps, and what to do if it feels
    like too much — the thing you would otherwise have to remember from a therapy session.
12. **One normal pace per technique, at Dr Goswami's numbers.** Slower / Standard / Faster is
    gone: twelve choices with no guidance became four techniques each with the pace the
    therapy books use. Box 4 in / 4 hold / 4 out / 4 hold. Physiological sigh a full breath in,
    one more small sip, then a long breath out. Extended exhale 4 in / 8 out. Humming breath
    4 in / 6 hum out.
13. **The set of techniques is hers.** She read the four explanations and said Guided
    breathing and Extended exhale "are essentially the same exercise", so **Guided breathing is
    out and Humming breath (the yoga bee breath) is in**. Her wording, headings included, is
    what the (i) panel shows.
14. **A sitting is three rounds of ten breaths.** Ten breaths, then the app pauses and asks
    "Let's pause here. How are you feeling now?" with three taps — Calmer / About the same /
    Worse — and **Continue** or **Stop for now**. Continue gives another ten. After thirty
    breaths it rests: "That's 30 breaths. A good place to rest", with Done and a smaller Talk to
    Okuvu, so it is not a wall at 2 a.m. Tapping **Worse** offers Okuvu and the helplines
    straight away. Stopping early says "You took a moment for yourself" and deliberately shows
    no count, because a count reads like a score.
    **The physiological sigh pauses after five breaths** and ends at fifteen, her ceiling,
    because repeated sighing can make people light-headed.
15. **The number and the shape now move together.** They did not: the number advanced every
    0.9 seconds while the shape grew over the full 4 or 6 seconds, so the count finished early
    while the circle was still moving, and the voice reading digits stretched it further. The
    number now shows the seconds actually left in that part of the breath, the shape takes
    exactly that long, and the voice says the step instead of counting over it.
16. **Each technique looks different.** Box breathing: a dot travelling round the four sides of
    a square. Physiological sigh: a circle that fills, swells a little more, then empties, with
    no digits. Extended exhale: a wave rising quickly and falling slowly. Humming breath:
    ripples spreading from the centre while you hum.
17. **"Done. How do you feel now?" no longer appears on an exercise you never started.** The
    card kept its finished state while the screen swapped the exercise underneath it, so an
    untried technique inherited the last one's ending and a running counter kept climbing
    (`5/3`). Every technique now starts clean when you pick it.

### Dropped

18. **No physiological-sigh video.** She asked for a 20–30 second clip. You decided against
    video support and kept the on-screen animation plus her written explanation, so nothing is
    filmed, generated, downloaded or billed. The video tooling was deleted, not switched off.
    She has been told and has approved (4 Nov 2026).

---

## 3. What shipped — technical requirements

### 3.1 Server (api, worker, therapist portal) — A1, live

| Route / change | Purpose | Guards |
|---|---|---|
| `PATCH /settings/emergency-contact` | Store the contact name and 10-digit phone | Authenticated; `^\d{10}$` after stripping spaces, dashes, dots and brackets; encrypted before storage |
| `GET /journal/prompts` | Serves the 52-prompt library (round 1, ships in the same image) | Authenticated; no model call; 503 rather than an invalid library |
| `GET /sessions`, `GET /sessions/:id` | Past conversations (round 1) | Authenticated; owner-scoped `findFirst`, another user's id is a 404 |

The server's tool-card defaults also changed: one pace per technique at her numbers, plus the
new humming-breath tool, so an older client asking for a card still gets an answer.

**Database:** one migration, `20261104000000_add_humming_breath_tool` — adds the humming-breath
registry row and her one-line copy for the sigh and extended exhale, so the therapist's assigned
line and the (i) panel cannot describe different breaths. It inserts rows; it rewrites no
existing data. It ran inside the release build, before the services rolled.

**Compatibility:** the build already on a handset keeps working. Every new field is optional in
both directions, and the old three-pace table is still served for older clients.

### 3.2 Phone app (Android) — A3, built and **not yet installed**

- Build `1.0.10` / versionCode `11` (prod flavour), signed with the upload key `CCB4CA39…FF96`.
- Screens touched: Breathe (drop-down, (i) panel, four animations, session flow), Emergency
  Contact (10-digit field), plus round 1's screens which ride in the same APK.
- `apps/mobile/lib/src/features/home/breathing_content.dart` holds her approved copy as data,
  version `2.0.0`, with her approval date and reply id — the gate travels with the text.
- `apps/mobile/lib/src/features/chat/widgets/breathing_visuals.dart` draws the four visuals from
  the same animation clock the countdown uses, so a shape cannot drift from its number.

### 3.3 Infrastructure — A2, no new change this round

Row 8's secret, the two IAM statements and `AWS_SECRETS_PREFIX` were applied by hand on 3 Nov.
This release is the code that reads them.

---

## 4. Gates

| Gate | Evidence | Status |
|---|---|---|
| API test suite | 1684 tests on the merged tree | Met |
| Worker suite | 93 tests | Met |
| Therapist portal | 316 tests + `tsc --noEmit` + `next build` | Met |
| App tests | `flutter test` 333 of 333; breathing files 32 of 32 | Met |
| App analyser | `flutter analyze` clean | Met |
| Secret scan | clean on the merged tree | Met |
| Server build | `evia-beta-build:d533b39d` SUCCEEDED; POST_BUILD `OK api` / `OK worker` / `OK portal` | Met |
| Migration | `Applying migration 20261104000000_add_humming_breath_tool` then `All migrations have been successfully applied` | Met |
| Live identity | `/health` answers `{"status":"ok","commit":"940edf861bae"}`, equal to the deployed image tag | Met |
| New routes mounted | `/settings/emergency-contact` 401, `/journal/prompts` 401, `/sessions` 401, invented route 404 — authentication refused, so the handlers are in the running image | Met |
| App artifact | `verify-mobile-release.py`: RELEASE OK, 26 of 26 checks; APK sha256 `602a2f345ce8715d7b300ac323b1cbad9bc272b873e807c69338c2c3c63fb8ed`; gate matched the artifact's own commit to `/health` | Met |
| Clinical copy (C2) | "Approved with changes", 3 Nov 2026 19:15 UTC, message id `1a1a2d6769fe9e01`; built to her text | Met |
| Screen seen on a handset | **No device and no emulator on this host** — tests and analysers only | Outstanding (needs A3) |

---

## 5. State of the world — verified 5 November 2026, 07:30 UTC

- `develop` head: `1d0ecd2` (change-log entry for this rollout). Round 2 merged as `940edf861bae`.
- Deployed images: api `940edf861bae` (task definition `:67`), worker (worker suite `:65`),
  portal `:67`. `/health` 200, answering `940edf861bae`.
- Database migration applied 04:21 UTC in the same build.
- App artifact `1.0.10+11` built from `940edf861bae`, clean tree, at
  `/opt/data/okuvu/wt/ship-1.0.10/apps/mobile/build/app/outputs/flutter-apk/app-prod-release.apk`
  (59,969,491 bytes); copied for handover to
  `/opt/data/okuvu/releases/okuvu-1.0.10+11-prod.apk`.
- **Nothing is published on Play** — both listing URLs answer 404 — so distribution is the
  side-loaded APK. "Live" for every app row therefore means "installed on the handset", which
  has not happened yet.
- Round 1's app rows (1–7) are in this same APK. Their server half has been live since 3 Nov.

---

## 6. Runbook (dependency order)

Already executed, in this order, on 5 November:

1. Migrations ran inside the release build — before any service rolled. — done
2. api, worker and portal rolled to the images carrying them. — done
3. Live identity and new routes verified against the running services (401, not 404). — done
4. App artifact built from the merged commit and verified against `/health`. — done

What remains:

5. **Install `okuvu-1.0.10+11-prod.apk` on the test handset** (A3). This is the only step that
   has not happened, and it is the only way any of the app-visible rows above becomes visible.
6. Then open Breathe and Settings and confirm by eye: the exercise drop-down, the (i) panel,
   ten breaths then the pause with three taps, the rest line at thirty, and a saved 10-digit
   emergency-contact number.

**Rollback targets, recorded while they are still in hand:** api `:66`, worker `:64`, portal
`:66` (the previous revision), and the previous APK `1.0.9+10`. The migration is additive and
does not need undoing to roll back code.

---

## 7. Risks and open items

1. **No handset verification.** Every app claim here rests on tests and static analysis; no
   screen has been seen running. Install is the gate.
2. **Row 19(b) is design only — breathing outcomes are not stored.** Dr Goswami asked that the
   technique, breath count and tap answer be recorded and shown to the therapist only when
   breathing is homework or the client has shared. That needs a new table, an endpoint and a
   consent-gated therapist view: a release of its own. **Nothing is stored today, so the taps
   are not being saved.** No client data is being collected in the meantime, which is the safe
   failure direction.
3. **Row 8's unexplained item is still open.** On 2 November the app's consent screen tried to
   save twice and the server refused both times. Which build sent them is unknown, and no code
   was changed on a guess. It stays an open item until it reproduces.
4. **No Play listing.** Distribution is a side-loaded APK, so there is no staged rollout and no
   automatic update; a handset keeps whatever was installed until someone installs the new file.

---

## 8. Approval

| | Decision |
|---|---|
| **A1 — code release** | **Done** — 5 Nov 2026 04:21 UTC. No signature needed; recorded for the file. |
| **A2 — cloud change** | **Done** — 3 Nov 2026 18:29 UTC. |
| **C2 — clinical copy** | **Received** — 3 Nov 2026 19:15 UTC. |
| **A3 — app install** | Decision needed: **approved** — install 1.0.10+11 on the test phone   /   **hold** |

Owner decision: ______________________  Date: ____________

Prepared by Keel Assist for Rajwant. Technical record: `docs/APP-CHANGE-LOG.md`.
