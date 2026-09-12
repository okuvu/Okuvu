# 10-Day Stories — amendments

**Written** 12 Sep 2026 · resolves the `okuvu-10day-stories.md` amendments gap flagged in `00-doc-map-and-parity-resolutions.md` §B.5 (`okuvu-remaining-changes.md` §F.4).

## Why this doc exists instead of editing the source file

`okuvu-10day-stories.md` does not exist anywhere in this repo — not under `docs/`, not at the repo root, and not in git history on any branch (confirmed via `git log --all -p -- "*10day*"`). It lives wherever Rajwant/Shubhangi's own planning materials are kept, outside this checkout. §B.5 already drafted the exact deltas the source file needs, as if it were in hand. Following `03`/`04`/`05`'s established pattern for exactly this situation (a spec that can't be edited directly), this doc quotes each §B.5 item and gives it a current-status verdict, so the reconciliation exists somewhere even though the original file doesn't.

## §B.5 items — original delta, then status

- **B-1 (intake day-1 slot): RETIRE with onboarding machinery (superseded by thread model + therapist-driven onboarding).**
  **Done.** Onboarding scoring/opening machinery removed (`1a30ce5`); intake's day-1 slot concept has no equivalent in the current thread model, which has no day-numbered onboarding sequence at all.

- **B-6 (A2 under "new session model"): reword → continuous-chat model.**
  **Still needs the actual story-text reword** — nobody has edited the (inaccessible) source, so here's the replacement wording for whoever applies it: *"A2 operates under OKUVU's continuous-chat model: no per-session turn caps, no idle-timeout auto-close, no `SESSION_OPEN_REJECTED` gating. A conversation is a single ongoing thread the client can start or continue at will; A2's behavior adapts within that thread via S-07 signals (taper_state, closure_offered) rather than a hard session boundary."*

- **B-7 (make SESSION_TURN_LIMIT real): replace with silent runaway bound + thread model (no user-facing limit).**
  **Done.** `SessionLimit`/`Tier` dropped entirely (`9668b5d`); no user-facing turn limit exists. (A silent, non-user-facing runaway/cost bound may still exist at the infra layer — out of scope for this story amendment either way.)

- **E-1 (push/analytics deferred): split — push/reminders pulled forward (core), analytics stays deferred.**
  **Partially done, needs the story split written up.** Reminders (schedule/frequency/tool-link, Today-card, Report Card) were pulled forward and shipped this session (tracker §D) — this is the "reminders" half of the split, done. Push/FCM delivery itself remains deferred (no Firebase Admin SDK, no device-token storage, no Cloud Scheduler job) — correctly still deferred, not a gap. Analytics stays deferred as originally decided. Suggested replacement story text: *"Reminders: schedule/frequency/tool-linked, therapist-configured, pull-based delivery via the Today card — shipped. Push notification delivery for reminders: deferred, no infra. Analytics: deferred, unchanged."*

- **A-5 (delete A12): already present ✅ — extend to "delete A12 + onboarding scoring/opening + A15 copy + streak/mood-placeholder UI."**
  **Done**, and confirmed via direct re-verification this session (not just inherited): A12 removed (`cfc3b1e`), onboarding scoring/opening removed (`1a30ce5`), streak/placeholder Progress UI confirmed already removed (`progress_screen.dart` has zero streak/milestone code). "A15 copy" removal not independently re-verified this pass.

## New stories needed (§B.5's list) — current status

| Story | Status |
|---|---|
| Homework/reminders workstream | ✅ Done — schema, portal write path, Today-card, Report Card (tracker §D). |
| Language-mode | ✅ Done — end-to-end, `GET/PATCH /settings/language` + mobile Settings screen (tracker, `04` §2). |
| A1 metadata pipeline | 🔴 Still open — no story written, no implementation started. |
| Version logging | 🔴 Still open — same gap as `06-parity-audit-v2.md` §13; per-turn model/prompt version isn't logged anywhere. |
| S-07 wiring | ✅ Done — all fields persisted on `Turn`, 4 of them surfaced read-only in Report Card, `journal_prompt_suggested` wired chat→journal (tracker §C). |
| Tool-id registry | ✅ Done — `03-tool-id-registry.md`, seeded with the 3 tools already live in code; the other 9 proposed ids remain unbuilt pending clinical review (not a story-writing gap, a content decision). |
| Permission enforcement | 🟡 Mostly done — `chat_access_granted` now enforced on Report Card, Session Prep, and `clients.detail`'s `careReviewFlagged` (this batch closed the last gap, Session Prep). Still open: there's no client-facing consent UI — consent is captured today only as a therapist/admin attestation via the Add-Client flow (`admin.assignClient`), not something the client grants themselves. Building that would be a separate mobile feature, not yet scoped. |

## What this doc does not do

It does not reconstruct `okuvu-10day-stories.md` as a whole, or invent day-by-day sequencing for a board this repo never received. It resolves exactly the drift §B.5 already identified — no more, no less.
