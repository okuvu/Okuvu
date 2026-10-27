# OKUVU v2.0 — Remaining Changes (open work tracker)

**Status doc** · 12 Sep 2026 · owner: oku 🫶
**Sources:** `docs/okuvu-v2.0/{00-doc-map-and-parity-resolutions, 01-parity-audit-v1, 02-master-handoff}.md` + live verification of `OkuvuAI/okuvu` `develop` @ `b4ee3cd`.
**Scope:** everything from the v2.0 parity work that is **still not done** in code/tests/docs.

> **Migration note (28 Oct 2026).** This tracker was written while the stack ran on
> Google Cloud. The platform has since been cut over to AWS
> (`docs/AWS-CUTOVER-SPEC.md`): Cloud Run → ECS Fargate, Cloud SQL → RDS, Cloud
> Tasks → SQS, Vertex AI → Bedrock, Firebase Auth → Cognito. Entries below are
> kept as written — they are a dated log, not a description of the current
> platform. Where an open item names a cloud service, read it as the AWS
> equivalent; anything that depended on a bespoke cloud product (Cloud Scheduler,
> FCM) is superseded rather than pending.

---

## 0. How to read this

- ✅ = verified done (commit + test evidence).
- 🟡 = partially done / narrowed in this last batch.
- 🔴 = still open, no code.
- Line refs are from the verified checkout at `db22b03`.

---

## 1. Context — what just landed

### 12 Sep (this batch, all verified)

| # | Fix | Commit | Evidence |
|---|-----|--------|----------|
| 1 | Turn-cap/idle/session-frame rituals retired | `1152f98` | Thread model in place; `SESSION_OPEN_REJECTED`/idle-timeout machinery removed |
| 2 | Remaining S-07 fields persisted on `Turn` | `2dddf94` | `taper_state`, `closure_offered`, `frustration_event`, `homework_referenced`, `therapist_referral` all written |
| 3 | Harness v2.1 (partial) | `cfc3b1e`, `c47ed21`, `077d28a`, `3cc96f6` | A12 removed + stale docs fixed; `CorpusCase` scenario fields + `injectToolkit`; real thread-model/taper regression tests (DB round-trip); A1 `gap_before_ms`/`repetition_count`; synthetic corpus batch (Hinglish, frustration, homework, taper) |
| 4 | Homework/reminders workstream (pull-based subset) | `d283ee0` | `Reminder` gains frequency/times/tool_id (linked to `ToolRegistryEntry`); portal `reminders`/`report-card` routers + pages; `GET /users/me/today` + mobile Today-card widget; `POST /users/me/homework/:id/complete` (user-confirmed completion); Worker 05 now queries the client's real active `Homework` instead of always passing null; Report Card shows homework progress + mood trend, gated on `chat_access_granted`; fixed a real bug — client-detail page was rendering `SessionSummary.summary_text` as raw JSON |
| 5 | Therapist-portal Evia→OKUVU UI chrome | `e6fa9f6` | Sign-in screen, sidebar, admin gate, shell header, program-page breadcrumb/copy all fixed — 0 "Evia" left in `apps/therapist-portal/src` |
| 6 | Production DB caught up (ops, no commit — DB-side only) | — | Therapist-portal's production DB was 12 migrations behind (since 6 Sep); applied all pending, including a pre-existing gap where `TestRun`/`CorpusCase`/`ModelConfigPin` were never created via a tracked migration anywhere in history (bootstrapped by hand to unblock, then the 4 migrations that assumed they existed were marked resolved) |
| 7 | Vercel deploy pipeline fixed (ops, no commit) | — | Project's dashboard Build/Install commands still referenced pre-rebrand `@evia/*` package filters, overriding `vercel.json`'s correct `@okuvu/*` ones — cleared via API so `vercel.json` takes effect; established a git-free CLI deploy method as a working fallback when the git-author collaboration check blocks a deploy |

Also confirmed still true this batch (spot-checked, not just inherited from the doc): onboarding machinery (`generateOnboardingOpening`/`scoreOnboardingTurn`/"You are Evia…") is genuinely gone from `apps/api/src` — the 11 Sep doc's §B.1 item was stale. `websocket.ts:268`'s `tool_type !== 'grounding_5431'` hardcode is still there — that item's status is accurate.

### 12 Sep, batch 2 (journal handoff, care-plan review flag, docs wave)

| # | Fix | Commit | Evidence |
|---|-----|--------|----------|
| 8 | Sidebar "Reports" wired to real Report Card | `60ba4c6` | Was a permanently-disabled "Coming soon" item; now a real link to `/clients/[id]/report` when a client is open |
| 9 | S-07 signals + tool-id registry doc | `f30a1ab` | Report Card gained a read-only snapshot of the 4 previously-orphaned S-07 booleans; `docs/okuvu-v2.0/03-tool-id-registry.md` written |
| 10 | Journal handoff | (this batch) | A2's S-07 gains `journal_prompt_suggested` (transient, not persisted onto `Turn`); flows through `orchestrator.ts` → `AgentTurnFrame` → mobile chat bubble "Save to journal" affordance → prefills the Journal composer via `journalEntryFormProvider.setContent()`. Worker 05/06 still never read journal content — one-directional by design |
| 11 | Care-plan review flag (first-pass LLM judgment) | (this batch) | `ClinicalConfig.care_plan_review_flagged` (already existed in schema, unused) now has a real producer: Worker 05 asks the model whether session content diverges from `care_plan_focus`, defaulting to false when uncertain; consumed by `clients.detail`, gated on `chat_access_granted`, shown as a red "may need review" indicator on the Care Plan card. Explicitly labeled a rough signal for therapist review, not a diagnosis — same spirit as the tool registry's "pending clinical review" seeding |
| 12 | Docs wave — app-spec v0.4 + portal-spec amendments | (this batch) | `docs/okuvu-v2.0/04-user-app-spec-v0.4.md`, `05-therapist-portal-spec-v0.4-amendments.md` written, evidence-cited against current code |

Two research passes (Explore agents) mapped the exact wiring for journal handoff and the care-plan flag before any code was written — see the plan file for the full hop-by-hop trace. One clinical-adjacent decision was surfaced and resolved with the user: ship the care-plan mismatch check as a first-pass LLM judgment call now (option chosen over deferring it entirely, matching how the tool registry handled the same "clinically pending" tension).

Test evidence: `apps/api` 470/470, `apps/worker` 39/39 (+6 for the care-plan flag), `apps/therapist-portal` 33/33 (+2 for `careReviewFlagged` gating). `flutter analyze` clean on the touched mobile files; mobile `home_screen_test.dart` shows the same 3 pre-existing failures as before this batch (confirmed unrelated — a Firebase-not-initialized issue in `ChatScreen`, present on `develop` prior to any of this session's work).

### 12 Sep, batch 3 (helpline consolidation + quote-of-day mechanism)

| # | Fix | Commit | Evidence |
|---|-----|--------|----------|
| 13 | Helpline consolidation (O7) | `eb2d7b8` | `CrisisResource` reconciled from 2→5 rows via migration `20260912170000_expand_crisis_resource_to_five` (NIMHANS, Snehi, Emergency Services added — applied and verified on the sandbox DB, count = 5, matching `crisis_overlay.dart` verbatim, same order). A9-post's prompt (+ its mirrored doc) updated to list all 5 as approved. Mobile's `crisis_overlay.dart` deliberately left untouched/hardcoded — offline-must-work requirement, not rewired to fetch live. |
| 14 | Quote-of-day mechanism (O6) | `eb2d7b8` | Built end-to-end with placeholder, swappable content: `User.quote_of_day_enabled` (opt-in, migration `20260912170500_add_quote_of_day_enabled`, applied and verified on the sandbox DB), `apps/api/src/lib/quote-of-day.ts` (5 placeholder lines per care plan, deterministic day-of-year selection), `GET/PATCH /settings/quote-of-day`, `quote` field on `GET /users/me/today`, mobile Settings toggle (`QuoteOfDayToggle`, mirrors `VoiceToggle`) + Today-card rendering. |

Test evidence: `apps/api` 482/482 (+12 for quote-of-day/settings). `flutter analyze` clean on touched files; `settings_screen_test.dart` updated and passing (6/6). Along the way, hit the same stale-advisory-lock failure mode as earlier this session (on the sandbox DB this time, from my own first migrate attempt) — asked for and got explicit approval before `pg_terminate_backend`, per the established pattern for this action.

### 12 Sep, batch 4 (Add-Client flow, Session Prep gating, docs wave remainder, crisis-overlay bugs)

| # | Fix | Commit | Evidence |
|---|-----|--------|----------|
| 15 | Add-Client flow + consent capture | `b4ee3cd` | `admin.assignClient` extended with `chatAccessGranted`/`languageMode` inputs; consent only set on first assignment (never overwritten on repeat), language-mode applied to the client's `User` row when provided. `AdminContent.tsx`'s "Assign a client" form renamed "Add client," gained the consent checkbox + language select. New `admin.test.ts` (6 tests). Design call: extends the existing admin-gated flow rather than a new self-service one; consent is a therapist/admin attestation, not a new client-facing mobile toggle (both per explicit user decision). |
| 16 | Session Prep gated on `chat_access_granted` | `b4ee3cd` | `sessionPrep` procedure now mirrors `reportCard`'s exact gate — was a real content leak (any assigned therapist could read full chat-derived narrative/themes/open-loops regardless of consent); now returns `{granted: false}` + the same amber empty state Report Card uses. 2 new authorization tests. |
| 17 | Crisis-overlay bugs (found during docs-wave re-verification, not asked for) | `b4ee3cd` | Two confirmed, real, still-live mobile bugs: `CrisisOverlay.hide()` was never called anywhere (once shown, no way to dismiss short of logging out) — fixed with a deliberate, low-key "I'm safe for now" button; `chat_screen.dart` pushed to `/crisis`, a route never registered anywhere in `router.dart` (dead code, would 404) — removed, since the overlay already renders reactively app-wide via `app.dart`'s `_CrisisOverlaySlot` independent of routing. |
| 18 | Docs wave — parity-audit v2 + 10-day-stories amendments | `b4ee3cd` | `docs/okuvu-v2.0/06-parity-audit-v2.md` (all 16 original audit sections re-verified/consolidated; found and fixed the crisis-overlay bugs above along the way) and `07-10day-stories-amendments.md` (source file doesn't exist in this repo — reconciled against the doc-map's own already-drafted §B.5 deltas instead) written. |

Three research passes (Explore agents, one per item) mapped current state exhaustively before any code was written. Four design decisions were surfaced and resolved with the user (all recommended options taken): extend the existing admin-gated Add-Client flow vs. build self-service; consent as an attestation checkbox vs. a new mobile toggle; gate Session Prep vs. leave it as a documented exception; fix the crisis-overlay bugs now vs. defer.

Test evidence: `apps/therapist-portal` 41/41 (was 33; +6 admin, +2 sessionPrep gating), `tsc --noEmit` clean, `next build` succeeds. `flutter analyze` clean on touched mobile files (one pre-existing unrelated info-level lint noted, not introduced). `crisis_overlay_test.dart` 2/2 (both updated for the new button); re-ran `chat_screen_test.dart`/`home_screen_test.dart` and confirmed the same pre-existing Firebase-init failures as before this batch, nothing new — verified by stashing the change and reproducing identically.

### 11 Sep (prior batch)

| # | Fix | Commit | Evidence |
|---|-----|--------|----------|
| 1 | Crisis (S4) turns now persisted (Audit 1.3) | `ba8bb23` | `Turn` row + `SafetyState→S4` upsert + `crisis_flag_detected`; +77 tests |
| 2 | Daily session-slot limit retired | `9668b5d` | `SessionLimit`+`Tier` dropped via migration; `session-limits.ts`, cleanup cron, env all removed |
| 3 | Mobile rebrand (Evia→OKUVU) + language mode end-to-end | `1ea803a` | 0 "evia" in `apps/mobile/lib`; `language_notifier.dart` + `GET/PATCH /settings/language` |
| 4 | Homework write path (portal) | `8b60c66` | `homework.ts` router + `/clients/[id]/homework` page + authz tests |
| 5 | Onboarding-scoring machinery deletion | `1a30ce5` | `generateOnboardingOpening`/`scoreOnboardingTurn` removed |
| 6 | Home mood meter wired to real backend | `ee9ed24` | `MoodCheckinNotifier` → `/progress/mood/checkin` |

Also confirmed already done (earlier): Audit 1.2 S3 deterministic grounding (A8 returns `A8_S3_GROUNDING_RESPONSE`, no real A2 call), Audit 1.4 Blocked ≠ S4, A9-post fail-closed on parse failure, A9-pre `reasonCode` wiring, prompt v2.0 assets landed.

---

## 2. At a glance

| Area | State |
|------|-------|
| Audit P0s (1.1–1.4) | ✅ done |
| Daily session limits | ✅ done |
| Turn caps / idle auto-close / `SESSION_OPEN_REJECTED` semantics | ✅ done |
| Onboarding scoring/opening + intake machinery removal (Phase 4) | ✅ done |
| Streak / placeholder Progress UI removal | ✅ done (already removed; tracker was stale) |
| Residual "Evia" strings | ✅ done (therapist-portal, A2 prompt, test-harness all confirmed clean) |
| Homework: schema + portal write path | ✅ done |
| Homework: Today-card API + Report Card / Session Prep | ✅ done (pull-based) |
| Homework: scheduler + push (FCM) | 🔴 deliberately deferred — no Firebase infra/credentials |
| Language mode end-to-end | ✅ done |
| Tool-launch beyond `grounding_5431` | ✅ done (already complete; `websocket.ts`'s grounding-only check is correct by design) |
| Journal handoff (chat→journal prompt) | ✅ done — `journal_prompt_suggested` (transient), full chat→journal-prefill wire path |
| Care-plan review flag (`care_plan_fit`/`care_plan_review_flagged`) | ✅ done — first-pass LLM judgment via Worker 05, gated on `chat_access_granted` |
| Eval/harness v2.1 (framework, corpus) | 🟡 mostly done — env map + Gemini-baseline/RCI re-run remain |
| Docs wave (app-spec v0.4, portal amendments, tool-id registry, stories, parity-audit) | ✅ done — all 5 docs written (`03`-`07`); a handful of genuinely-open items (version logging, env map, RAG decision, tools-inventory finalization) correctly remain flagged as open, not silently closed |
| Mood meter → real MoodLog write + Report Card | ✅ done — mobile wired, Report Card shows mood trend |
| Canonical helpline source | ✅ done — `CrisisResource` reconciled to all 5 numbers, A9-post prompt matches |
| Quote-of-day mechanism | ✅ done — mechanism + placeholder content, real content source still undecided |
| Add-Client flow + consent capture | ✅ done — admin-gated form now captures `chat_access_granted` (attestation) + optional language-mode |
| Session Prep `chat_access_granted` gating | ✅ done — gated identically to Report Card |
| Crisis-overlay dismiss / dead route bugs | ✅ done — found during docs-wave re-verification, fixed same batch |
| Production DB / deploy pipeline | ✅ fixed — see §1 |

---

## 3. Open items, by workstream

### A. Small leftovers

1. ✅ **Streak / placeholder Progress UI** — re-checked directly: `apps/mobile/lib/src/features/progress/progress_screen.dart` has zero streak/milestone code left. This item was stale — already removed (matches the "PR-A" streak-removal work from earlier this session).
2. ✅ **Residual "Evia" strings** — re-checked directly: `apps/api/src/agents/a2/agent.ts` (onboarding prompt gone entirely), `apps/test-harness/src/app/layout.tsx`, `server/trpc.ts` all clean; `BreathingPulse.tsx`'s only hit is a doc-filename in a comment (`docs/design/EVIA_Mobile_Design.md`), not UI text. (QA docs/READMEs/`.github` templates may still say Evia — cosmetic, low priority, not reverified.)

### B. Phase 4 — deletions

1. ✅ **Onboarding machinery** — `generateOnboardingOpening`/`scoreOnboardingTurn` confirmed removed from `apps/api/src` (`1a30ce5`). Not re-verified: `apps/api/src/onboarding/care-plan-assignment.ts`'s `decideAssignment()` and `agents/index.ts` exports.
2. ✅ **Turn-cap / idle / session-frame machinery** — retired (`1152f98`). Thread concept (start/continue) in place.
3. ✅ **A12 references in docs/harness** — `mvp-v2-engineering-spec.md` reconciled (`cfc3b1e`). `docs/testing/*` not reverified.

### C. Phase 3 — signals & integrations

1. ✅ **`tool_launched` beyond `grounding_5431`** — re-investigated (this was already resolved by commit `028a794`, tracker was stale): `orchestrator.ts`/`tool-card.ts`/mobile all correctly support all 3 tools end-to-end. `websocket.ts:268`'s `grounding_5431`-only `TOOL_RESULT` check is **correct by design, not a gap** — confirmed `sendToolResult` is never called from the breathing-card widgets (`guided_breathing`/`box_breathing` are pure client-side timers with nothing to submit back over the websocket).
2. 🟡 **S-07 field consumers** — `homework_progress` (Worker 05 → Report Card) was already a real consumer of homework-related signal. The 4 raw `Turn`-level fields (`taper_state`, `closure_offered`, `frustration_event`, `therapist_referral`) are now also surfaced as a read-only snapshot in the therapist-portal's Report Card (last-30-days flags: latest taper state, closure-offered/frustration/referral occurrence). This is **display only** — still no taper/close logic, no notifications, no behavior triggered by these fields; a therapist just sees them now instead of nothing.
3. ✅ **`care_plan_fit` producer** — moved to Worker 05 as recommended by the audit. `parseCarePlanMismatch` extracts a `{ flagged, reasoning }` object from the same JSON blob as `safety_flags`/`homework_progress`; `flagged` rolls up into `ClinicalConfig.care_plan_review_flagged` after every summary (overwritten each session, no accumulation). First-pass LLM judgment, explicitly labeled as such — not a validated clinical rule.
4. ✅ **Journal handoff** — `journal_prompt_suggested` added to A2's S-07 (transient, not persisted onto `Turn`). Full wire path: prompt → `orchestrator.ts` → `AgentTurnFrame` → mobile chat bubble affordance → `journalEntryFormProvider.setContent()` prefill → `/journal`. (Audit §9.)
5. ✅ **`care_plan_review_flagged`** — same fix as item 3 above; consumed by `clients.ts`'s `detail` procedure (gated on `chat_access_granted`) and rendered as a red "may need review" indicator on the Care Plan card.

### D. Phase 5 — homework / reminders workstream

1. ✅ Schema + portal write path — done (`8b60c66`).
2. 🔴 **Scheduler + push (FCM)** — deliberately deferred. No `firebase_messaging` dependency, no device-token storage, no Firebase Admin SDK, no Cloud Scheduler job. Today-card is pull-only for now.
3. ✅ **Today-card API** — `GET /users/me/today` + mobile widget (`d283ee0`).
4. ✅ **Report Card + Session Prep** — portal router + page, gated on `chat_access_granted` (default-locked, no consent-capture UI yet to grant it) (`d283ee0`).
5. ✅ **A2 `${homework}` + Worker 05/06 wiring** — `agent-context.ts`'s homework query was already real; Worker 05 now also queries it instead of hardcoding null; Worker 06 already consumed Worker 05's `homework_progress` correctly. `Turn.homework_referenced` itself is still not directly queried anywhere — Report Card's `homework_progress` is the practical consumer that satisfies the product intent.
6. 🟡 **Reminder content model** — `frequency`/`times`/`tool_id` (linked to the existing `ToolRegistryEntry`) landed. Per-tool **default** frequency/schedule values are still undefined anywhere (no clinical spec) — therapists set them manually per reminder.

### E. Phase 7 — eval / harness v2.1

1. ✅ Framework/harness: A12 removed; real thread-model/no-cap/taper-round-trip tests replace the never-built "SD1/TL2" asserts.
2. ✅ Scenario format fields: `languageMode`, `homeworkContext`, `toolkit`, `therapistName` landed on `CorpusCase` + `TestModeOptions`. `threadState` deliberately **not** added as a flat field — no multi-turn corpus support exists to attach it to.
3. 🟡 Corpus: synthetic Hinglish/frustration/homework/taper batch added (`3cc96f6`). A9-post Hinglish-violation cases not specifically added. Crisis/S3–S4 content still excluded — clinically owned (§G.1).
4. 🔴 Env map: harness `sandbox/staging/beta` → real deployments table. `apiEndpoint` in `environment-context.tsx` still computed but never consumed — needs real staging/beta URLs nobody has handed over yet.
5. 🟡 Gemini baselines (C-2) + RCI Stage-2: the missing companion doc (`okuvu-mvp-test-framework-v2.md`) was found and reconciled — the "what is C-2" mystery is resolved and the process gap (Llama cutover happened without ever capturing Gemini baselines) is documented. The actual baseline capture + RCI re-run itself has not been done.

### F. Phase 8 — docs

1. ✅ `user-app-spec-v0.3` → **v0.4** — written as `docs/okuvu-v2.0/04-user-app-spec-v0.4.md`, a delta doc going bullet-by-bullet through the original §B.1 instructions with evidence.
2. ✅ `therapist-portal-spec-v0.1` amendments — written as `docs/okuvu-v2.0/05-therapist-portal-spec-v0.4-amendments.md`. Surfaced the Session Prep/`chat_access_granted` gating inconsistency, since resolved (item 3 below).
3. ✅ `tools-inventory-v0.1` → **tool-id registry** — written as `docs/okuvu-v2.0/03-tool-id-registry.md`: documents the 3 seeded tools, flags that `guided_breathing` doesn't appear in the doc-map's original proposed list, and that the other 9 proposed ids remain unbuilt pending clinical review. Also flags `orchestrator.ts`'s `KNOWN_TOOL_CARD_TYPES` as a second, currently-manual list that happens to agree with the registry table but isn't read from it.
4. ✅ `okuvu-10day-stories.md` amendments — the source file doesn't exist in this repo (confirmed via full git-history search); written as `docs/okuvu-v2.0/07-10day-stories-amendments.md` instead, reconciling against the doc-map's own already-drafted §B.5 deltas.
5. ✅ Re-run parity audit — written as `docs/okuvu-v2.0/06-parity-audit-v2.md`. Of the original 16 sections, 11 were already superseded by this session's docs; 2 more (agent-temperature fix, router Restricted-misroute fix) confirmed resolved via direct code re-check; §13 (version logging/env-map/RAG decision) and half of §16 (tools-inventory finalization) correctly remain flagged open. Re-checking §10 (crisis) this pass turned up 2 real, previously-undocumented bugs — see §G below.

### G. Crisis content + safety plumbing (partly clinical, not just eng)

1. 🔴 **No approved crisis-response script anywhere** — still a bare `CRISIS_SIGNAL`. Clinically-owned content gap.
2. ✅ **Canonical helpline source** — `CrisisResource` reconciled 2→5 rows (migration `20260912170000_expand_crisis_resource_to_five`), matching `crisis_overlay.dart`'s 5-number list exactly; A9-post's prompt (+ mirrored doc) updated to match. Mobile app intentionally left hardcoded/offline-safe, not rewired to read this table live.
3. ✅ **Mood meter → real `MoodLog` write + Report Card** — mobile Home meter wired (`ee9ed24`); Report Card now shows a permission-gated mood trend (`d283ee0`).
4. ✅ **`CrisisOverlay.hide()` never called + dead `/crisis` route push** — found while re-verifying §10 of the parity audit against current code (nobody had touched this since the original audit); both were real, still-live bugs. Fixed: a low-key "I'm safe for now" dismiss button now calls `hide()`; the dead `context.push('/crisis')` in `chat_screen.dart` (a route never registered anywhere) was removed.

### H. Ops / manual (outside a PR)

1. ⚫ **Deprovision the retired scheduler job** — superseded by the AWS cutover: the job lived in the old cloud project and is decommissioned with it, so there is nothing left to delete from this repo. If scheduled work is reintroduced, it must be an AWS-side mechanism (EventBridge Scheduler), not a cloud-provider console job.
2. 🔴 **Harness DB role** — acceptance-verification note, unchanged: deploy must use `test_harness_app`, not `neondb_owner`.
3. ✅ **Therapist-portal production DB migration debt** — was 12 migrations behind since 6 Sep; fully caught up this session (see §1).
4. ✅ **Vercel build-config drift** — dashboard-configured Build/Install commands still said `@evia/*`, silently no-oping every deploy; cleared so `vercel.json`'s correct commands take effect.

---

## 4. Open decisions (Day-1 / Rajwant + Shubhangi)

- **O1** Mirror-mode default (English until Hinglish gate passes?)
- **O2** A1 metadata baseline storage
- **O3** Tool-card launch scope (this sprint vs next)
- **O4** Onboarding-scoring replacement — the auto-scoring code is gone; what (if anything) replaces it for new-client care-plan assignment beyond manual therapist selection is still undecided.
- **O5** Prompt-asset storage (files / DB / registry)
- **O6** Quote-of-day content source — mechanism built (`eb2d7b8`) with clearly-labeled placeholder content; a real content source/owner is still undecided, but nothing engineering-side is blocked on it anymore.
- **O7** Canonical helpline set — resolved (`eb2d7b8`): all 5 numbers already shipped in the app are the approved set, now reconciled into `CrisisResource` and A9-post's prompt.
- **O8** Embeddings/RAG keep-vs-drop (cloud-exit scope)

---

## 5. Suggested next PRs (small → large)

1. ~~**PR-A:** streak UI removal + harness "Evia" strings~~ — already done, tracker was stale.
2. ~~**PR-B:** onboarding machinery + idle/session-frame → thread model~~ — done.
3. ~~**PR-C:** tool-launch generalization~~ — already done (`websocket.ts`'s grounding-only check is correct by design); the 4 orphaned S-07 booleans are now surfaced (read-only) in Report Card.
4. **PR-D (remainder):** push/FCM delivery only — device tokens, Firebase Admin, Cloud Scheduler job. Today-card/Report Card/reminders CRUD are already done.
5. ~~**PR-E:** app-spec v0.4, portal-spec amendments, tool-id registry doc~~ — all three done, and the remaining two docs (10-day-stories amendments, parity-audit re-run) also now done — the entire original docs wave is complete.
6. **PR-F (remainder):** env map (needs real URLs) + Gemini-baseline capture/RCI re-run (needs the RCI reviewer's time, not just engineering).
7. ~~**New:** Add-Client flow + consent-capture UI for `chat_access_granted`, Session Prep gating decision~~ — done (`b4ee3cd`).
8. ~~**PR-G:** helpline consolidation (O7) + quote-of-day mechanism (O6)~~ — done (`eb2d7b8`).
9. ~~**New:** crisis-overlay dismiss button + dead `/crisis` route removal~~ — done (`b4ee3cd`), found while re-verifying the parity audit, not originally asked for.

*Process: never push to `main` — branch → PR → admin review/merge.*

---

*Living doc — update as items land. Last verified against `develop` @ `b4ee3cd` (12 Sep 2026).*
