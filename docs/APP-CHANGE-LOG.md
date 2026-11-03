# App Change Log — Rajwant's working list

Plain-language record of every change requested in this round. One row per change.
Nothing gets deployed until the list is finished; then everything is deployed together.

| S.No | What changes for you (user view) | Code / Git change needed | Status |
|------|----------------------------------|--------------------------|--------|
| 1 | The "Your space is ready / Let's begin" welcome page was showing every time the app opened. Now it shows only on the first launch. After you tap "Let's begin" once, later opens go straight to the home page. | Branch `feat/app-change-round-1`. Tapping "Let's begin" now saves a "welcome seen" flag on the phone (`lib/src/features/intake/cold_start_screen.dart`). Two tests added: `test/features/intake/onboarding_provider_test.dart` (flag survives an app restart) and a new case in `test/features/intake/cold_start_screen_test.dart`. 6 tests pass. | Ready |

---

## How this file works

**S.No** — just a running number. Never reused, never renumbered.

**What changes for you** — written in your words, from the user's side. What you will
actually see or be able to do. No technical terms.

**Code / Git change needed** — the actual work: the branch name, the files touched, and
the commit that carries it. This is the part you can ignore until you want detail.

**Status** — one of:
- `Wanted` — you asked for it, not started.
- `In progress` — being built.
- `Ready` — built and tested on my side, waiting for the batch deploy.
- `Live` — deployed, you can see it in the app.

## Deploy rule

All `Ready` rows are deployed together in one release at the end, not one at a time.
After the deploy, each row flips from `Ready` to `Live` and the release number is added
under "Releases" below.

## Releases

_None yet._
