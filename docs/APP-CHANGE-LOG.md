# App Change Log — Rajwant's working list

Plain-language record of every change requested in this round. One row per change.
Nothing gets deployed until the list is finished; then everything is deployed together.

| S.No | What changes for you (user view) | Code / Git change needed | Status |
|------|----------------------------------|--------------------------|--------|
| 1 | The "Your space is ready / Let's begin" welcome page was showing every time the app opened. Now it shows only on the first launch. After you tap "Let's begin" once, later opens go straight to the home page. | Branch `feat/app-change-round-1`. Tapping "Let's begin" now saves a "welcome seen" flag on the phone (`lib/src/features/intake/cold_start_screen.dart`). Two tests added: `test/features/intake/onboarding_provider_test.dart` (flag survives an app restart) and a new case in `test/features/intake/cold_start_screen_test.dart`. 6 tests pass. | Ready |
| 2 | On the Breathe screen you only had Box breathing. Now the screen shows all four techniques your therapist portal offers — Box breathing (still the one that opens first), Guided breathing, Physiological sigh, and Extended exhale — and you tap one to switch. Each technique keeps its own Slower / Standard / Faster setting, so changing the pace of one doesn't change the others. If your therapist assigned you a technique, that one is marked "from your therapist". **This one has a server piece**: the app now asks the server for each technique's saved pace, so the server must be released together with the app. | Same branch `feat/app-change-round-1`. `apps/mobile/lib/src/features/home/breathing_screen.dart`: the exercise chooser is now always shown with all four exercises (was: box breathing plus whatever was assigned); per-exercise pace is held per tool instead of one global default; the card container is scrollable because the always-on chooser took vertical space. `apps/mobile/lib/src/features/home/providers/today_card_provider.dart` parses the new `toolPacePresets`. `apps/api/src/lib/today-card.ts` + `packages/shared-types/index.ts` now return every saved pace (the query already loaded them; only box breathing's was exposed). Tests: `test/features/home/breathing_screen_test.dart` rewritten to 7 cases (all four listed, switching plays the right exercise, each exercise reads back its own saved pace, pace change PATCHes the right tool, assigned technique marked, assigned grounding kept without a pace picker) — 7 of 7 pass; `apps/api` `users-today-and-tool-preference.test.ts` 14 of 14 pass, `quote-of-day.test.ts` 17 of 17; `flutter analyze` clean on the touched files, `tsc --noEmit` clean, full app suite 268 of 268 pass. | Ready |

| 3 | The chat screen promised "Your conversation will be saved" but there was no way to read anything back. Now there is a small history (clock) icon at the top of the chat screen, and it opens **Past conversations** — every chat you have finished, newest first, with its date, how many messages it holds, and the first thing you said. Tap one and you read the whole conversation back. The end-of-session message now also says where to find it. A saved conversation opens read-only, with a "Start a new conversation" button — you cannot type into an old one, because that would need the safety checks to treat a finished conversation as live again. **This one has a server piece**: two new server endpoints read the saved chats, so the server must be released together with the app. | Same branch `feat/app-change-round-1`. Server: `apps/api/src/routes/sessions.ts` gains `GET /sessions` (list, this user only, sessions that actually hold messages, 50 max) and `GET /sessions/:id` (transcript; owner-scoped `findFirst`, so another user's id is a 404 rather than a readable conversation). `packages/shared-types/index.ts` gains `PastSessionSummary` / `SessionTranscriptTurn` / `SessionTranscript`. App: new `lib/src/features/history/{past_session,history_provider,session_history_screen,session_transcript_screen}.dart`; routes `/history` and `/history/:id` in `lib/src/router/router.dart`; chat screen gains the history icon (`context.push`, so back returns to the live chat) and the dialog copy now names the destination. Nothing new is stored — `SessionLog` and `Turn` rows were already being written on every turn; this change is the missing read path. Tests: `apps/api/src/__tests__/sessions-history.test.ts` 13 of 13 (list shape, owner scoping, preview flattening + truncation, blank preview, unclosed session still listed, message count from stored rows, bad limit 400, 401, transcript, other-user 404); mobile `test/features/history/` 12 of 12. Full API suite 1659 of 1659, full app suite 280 of 280, `tsc --noEmit` and `flutter analyze` clean. Query shapes typechecked against a freshly generated Prisma client; no database on this host, so the SQL itself was not run. | Ready |

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
