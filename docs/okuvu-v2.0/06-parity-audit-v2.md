# Parity Audit v2 — re-run against current code

**Written** 12 Sep 2026 · re-verifies `01-parity-audit-v1.md`'s 16 sections against `develop` as of this batch. Companion to `okuvu-remaining-changes.md` (the living engineering tracker) — this doc is the audit-shaped consolidation, that doc is the day-to-day punch list. Where the two disagree, trust the tracker; it's updated more often.

## Method

Of the original audit's 16 sections, most turned out to already be fully covered by docs written this session (the tracker, `03-tool-id-registry.md`, `04-user-app-spec-v0.4.md`, `05-therapist-portal-spec-v0.4-amendments.md`) — this pass consolidates those rather than re-investigating from scratch. Two sections (§1, §3) had specific findings neither the tracker nor 03/04/05 stated explicitly, so those were re-checked directly against code this pass. One section (§10) had a thread nobody had touched since the original audit — re-checking it turned up two real, still-live bugs, fixed as part of this same batch. A remaining handful (§13, half of §16) are genuinely untouched and stay open.

## Section-by-section verdict

| § | Topic | Verdict |
|---|---|---|
| 1 | Agent roster (A1/A2/A8/A9/A12/onboarding/Worker05/06) | **Superseded**, plus one thing confirmed fresh this pass: the audit's temperature-default concern is resolved — `apps/api/src/agents/{a1,a9,a9-post}/agent.ts` all now hard-code `temperature: 0.0` (each with a comment noting the prior 0.7-provider-default bug). A12 and onboarding-scoring machinery removal: see tracker §B. |
| 2 | Conversation model (turns/caps/thread) | **Superseded** — `04-user-app-spec-v0.4.md` §1 + tracker §1 item 1. The audit called this "the biggest break"; it's now the most thoroughly closed-out item, verified by a real DB round-trip test. |
| 3 | Router logic (A8 contract vs code) | **Superseded**, plus one thing confirmed fresh this pass: the audit's flagged "Restricted→grounding-only misroute" no longer exists in code — `apps/api/src/agents/a8-router.ts` only special-cases `governance_state === 'Blocked'` (routes to A2 in blocked mode); `Restricted` falls through to normal A2 routing along with `Active`, same as everything else. `reasonCode` also exists in code today (`a9/types.ts`, `a9/prompts.ts`, referenced across `orchestrator.ts`/tests). |
| 4 | Care-plan taxonomy (CP1–3) | **Superseded** — tracker §C.3 (`care_plan_fit` producer restored via Worker 05) + `05-therapist-portal-spec-v0.4-amendments.md` §4. |
| 5 | Signals S-06→S-07 table | **Superseded** — `03-tool-id-registry.md` (tool_launched/technique_used), tracker §C.2/C.4 (taper_state/closure_offered/frustration_event/therapist_referral/journal_prompt_suggested), `04` §4 (journal handoff). One residual nuance already correctly tracked, not a re-run discovery: the 4 surfaced S-07 fields are display-only in Report Card — no taper/close logic consumes them yet. |
| 6 | Homework (audit's "biggest machinery gap") | **Superseded** — tracker §D + `04` §5. Full schema/portal/Today-card/Report-Card loop built; only scheduler+push remains, and that's a known, explicitly-deferred item (no Firebase infra/credentials), not an unknown. |
| 7 | Reminders/push/quote-of-day | **Superseded** — `04` §3 + tracker (O6 quote-of-day mechanism, O7 helpline consolidation, both done this session). Push/FCM remains open by deliberate scope. |
| 8 | Mood meter & streaks | **Superseded** — `04` §6 (streak removal + mood-meter wiring, both confirmed against code). |
| 9 | Journal | **Superseded** — `04` §4 (`journal_prompt_suggested` producer/wiring, built exactly per the audit's suggested fix). |
| 10 | Crisis | **Mixed, now resolved this batch.** Helpline-set reconciliation: done (see this file's own inline "Resolved (12 Sep, O7)" note, and tracker item 13). The audit's other two code-bug findings — `CrisisOverlay.hide()` never called (stuck if opened), and a dead `context.push('/crisis')` call to an unregistered route — were **not mentioned in any doc since the original audit**; re-checking them this pass confirmed both were still real and live. Both fixed this batch: `crisis_overlay.dart` gained a deliberate, low-key "I'm safe for now" dismiss button wired to `crisisOverlayProvider.hide()`; `chat_screen.dart`'s dead push call was removed (the overlay already renders reactively app-wide via `app.dart`'s `_CrisisOverlaySlot`, independent of routing). Crisis-response script content itself remains open — clinically owned, not an engineering gap (tracker §G.1). |
| 11 | Language mode | **Superseded** — `04` §2 + tracker (built end-to-end). |
| 12 | Consent & therapist-read model | **Superseded, and extended this batch** — `05-therapist-portal-spec-v0.4-amendments.md` §§1-3 covered `chat_access_granted`'s enforcement on Report Card and the (at the time) still-ungated Session Prep, plus the Add-Client/consent-capture gap. All three are now closed: Session Prep gated identically to Report Card (`report-card.ts`'s `sessionPrep` procedure); an Add-Client flow now exists (`admin.assignClient`, extended with a consent-attestation checkbox + optional language-mode capture) — admin-gated by design, not self-service, and consent is still a therapist/admin attestation rather than a client-facing toggle (no mobile UI for that exists, deliberately out of scope — see `07-10day-stories-amendments.md`'s "permission enforcement" note). |
| 13 | Data/versioning/env naming | **Still open — not superseded by anything.** Per-turn model/prompt version logging, harness env-name mapping (`sandbox/staging/beta` → real deployments, tracker §E.4), and the embeddings/RAG keep-vs-drop decision (tracker O8) are all untouched since the original audit. This is the one section where a re-run would find the same gaps again. |
| 14 | Test harness/framework stale items | **Mostly superseded** — tracker §E (A12 removed, thread-model tests replace SD1/TL2 asserts, scenario fields landed). Two deliberate deviations from the audit's assumption, not gaps: `threadState` was not added as a flat field (no multi-turn corpus support exists to attach it to); crisis/S3–S4 corpus content stays excluded (clinically owned). |
| 15 | No-owner/no-machinery register | **Nearly fully superseded** — of the original 10 no-owner items, only reminders/push (scheduler + FCM) remains genuinely unowned/unbuilt; everything else now has a producer and is documented across the tracker + `03`/`04`/`05`. |
| 16 | Priority order | **Mostly superseded** — items 1, 3-8 done (item 2's temp/reasonCode/fail-closed sub-items confirmed via §1/§3 above); items 9 (version logging/env naming) and 10 (finalize tools inventory, pending clinical review) remain open — same two gaps as §13. |

## What's still genuinely open (no doc supersedes these)

- Per-turn model/prompt version logging (§13, §16 item 9) — nobody has built this; scope not yet even sketched.
- Harness env-name mapping — `environment-context.tsx`'s `apiEndpoint` computed but never consumed; needs real staging/beta URLs nobody has handed over.
- Embeddings/RAG keep-vs-drop decision (O8) — a scope call, not an engineering task.
- Tools-inventory finalization (§16 item 10) — the 9 proposed-but-unbuilt tool ids from `03-tool-id-registry.md` still need clinical review before any of them get built.
- Crisis-response script content (§G.1) — clinically owned.

Everything else this audit originally flagged is closed, either by a prior batch's doc or by this one.
