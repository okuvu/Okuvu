# OKUVU — Cross-Document Parity Audit v1 (feature → function → code)

Date: 07 Sep 2026 · Scope: connect client-app spec v0.3 + therapist-portal spec v0.1 + tools inventory v0.1 + system prompts v2.0 (01–06, all clinically approved) + code reality (critical audit/deep dives) + test framework v2 / harness / 10-day stories.

Method: each feature traced across layers: Product spec → Prompt v2.0 → Code → Test/eval. Verdict: ✅ parity · ⚠️ drift (works, inconsistent) · 🔴 break (contradiction / missing machinery) · ❓ decision needed.

Companion docs: okuvu-prompt-v2-engineering-delta.md (implementation), SYSTEM PROMPTS UPDATED/ (prompts).

## 1. Agent roster — old vs v2.0 vs code vs harness

| Agent | Evia v1.0 | Prompt v2.0 (approved) | Code reality | Framework/harness v2 | Verdict |
| --- | --- | --- | --- | --- | --- |
| A1 Safety | ✅ | ✅ 01 | ✅ (temp 0.7 → must be 0) | ✅ | ⚠️ temp fix |
| A2 Companion | ✅ | ✅ 02 | ✅ | ✅ | ✅ |
| A8 Router | deterministic | deterministic (no prompt) | ✅ | ✅ | ✅ (logic changes needed, §3) |
| A9-pre Governance | ✅ | ✅ 03 | ✅ (temp 0.7 → 0; parse-fail → Restricted ✓) | ✅ | ⚠️ temp fix |
| A9-post Reviewer | ✅ | ✅ 04 | ✅ (parse-fail → APPROVED fail-open 🔴) | ✅ | 🔴 fail-open vs prompt fail-closed |
| A12 Renderer | ✅ | DELETED | built, never called | 🔴 still in pipeline doc as "to be wired"; stories A-5 deletes it | 🔴 doc contradiction |
| A15 | deferred | not referenced | no code | stale-copy cleanup only | ✅ delete all copy |
| Onboarding scoring/opening | ✅ | RETIRED | code still wired (3-turn intake + decideAssignment + generateOnboardingOpening) | stories B-1 still about intake day-1 slot | 🔴 remove machinery |
| Worker summary | ✅ | ✅ 05 | ✅ (Cloud Tasks, retries) | ✅ | ✅ |
| Worker memory | ✅ | ✅ 06 | ✅ UserMemory | ✅ | ✅ |

## 2. Conversation model — the biggest break

Decision (07 Sep): continuous chat. No turns. No caps. No session rituals. User starts new / continues. A2 tapers at natural resting points. Silent server-side runaway bound only.

| Layer | What it says | Verdict |
| --- | --- | --- |
| App spec v0.3 §8 | "~20 turns per session with taper… invisible guardrail SD 1/day, TL 2/day" | 🔴 STALE (pre-dates 07 Sep lock) |
| Portal spec | client rows show "# sessions"; "Session Prep" = digest since last session | ❓ needs thread-based definition of "session" |
| Code | CAP_TURN_LIMIT=10 + IDLE_TIMEOUT_MS hardcoded (websocket.ts); daily slots SESSION_LIMIT_SD_DAILY=1/TL_DAILY=2; SESSION_OPEN_REJECTED; Turn @@unique([session_id,turn_number,role]); closure scripts T8/9/10; 15-min idle auto-close | 🔴 all turn/slot machinery contradicts v2.0 |
| Prompts v2.0 | no caps/turns; taper_state + dynamic closure; no session_number input | ✅ source of truth |
| Harness/framework | asserts rate limits SD1/TL2 (§5.5); A8 truth-table includes session-state; B-7 "make SESSION_TURN_LIMIT real" | 🔴 contradicts lock |
| Stories | B-1 intake-slot bug, B-6 "A2 under the new session model" | ❓ B-1 moot if intake dies; B-6 now = continuous-chat model |

Action: retire cap/slot/idle machinery; keep thread concept (chat thread = unit of summarisation, start/continue). Redefine portal "session" = thread (or therapist-defined period) → Session Prep pulls thread digests. Silent cost bound only. Update app spec → v0.4 note. Update framework §5.5/B-7.

## 3. Router logic vs prompt semantics

| Topic | Prompt v2.0 (A8 contract) | Code today | Verdict |
| --- | --- | --- | --- |
| Crisis trigger | A1 = S4 only | A8: S4→crisis ✓ but Blocked coerced → S4→crisis (CA 1.4) | 🔴 fix: Blocked → governance path |
| S3 | deterministic grounding out-of-band; A2 never sees S3 | A8: S3→A2 grounding-only, but mode is destructured and never used → S3 reaches A2 unrestricted (CA 1.2) | 🔴 enforce in orchestrator (B-3) |
| Restricted | boundary-hold → A2 proceeds holding policy line | A8: Restricted→grounding-only | 🔴 misroute; rework |
| First thread | no alliance-building concept (A2 opens warm naturally) | A8: first-ever session turn1 → alliance-building | ❓ remove or map to thread-open |
| reasonCode | every A8 decision carries reason | none | 🔴 add |

## 4. Care-plan taxonomy (CP1/CP2/CP3)

- Product: client never sees care plan; tools are care-plan-neutral; A2 v2.0 gets care_plan_focus (nullable, broad) + ${toolkit} by therapist selection — no CP gating.

- Code: CP assignment (decideAssignment), ClinicalConfig, session tier CP3→TL(2/day), care_plan_fit → care_plan_review_flagged — all CP-keyed.

- Harness/corpus/stories: scenario format carePlan (CP1|CP2|CP3); technique fidelity T1–T8 per CP; framework assert CP-fidelity.

- Verdict: ❓ decision: keep CP1–3 as internal therapist-facing taxonomy (portal rows, corpus labels, review flags) but never gate A2 on them. If yes → reconcile: care_plan_fit/possible_mismatch was the S-06 → care_plan_review_flagged producer, but S-07 dropped it → therapist review-flag has no producer. Either restore a care_plan_fit field in S-07 or move mismatch detection to Worker 05. (I recommend Worker 05 — A2 signal is already fat.)

## 5. Signals — S-06 → S-07

| Field | v1.0 S-06 | v2.0 S-07 | Code consumer | Verdict |
| --- | --- | --- | --- | --- |
| estimated_intensity | ✅ | intensity | orchestrator | ⚠️ rename in parser |
| crisis_language_detected | ✅ | (A1 owns; kept in summary 05) | → crisis_flag_detected | ❓ keep in S-07 too? A2 shouldn't see crisis; A1 owns → drop from S-07 ✅ |
| care_plan_fit | ✅ | dropped | → care_plan_review_flagged | 🔴 producer lost → move to Worker 05 |
| tool_launch_recommended + breathing_config | ✅ | tool_launched (tool id) | buildToolCard; tool-result-store only accepts grounding_5431 | 🔴 extend to all breathing/tools; config per tool not per plan |
| technique_used | T1–T8 | tool_id (T-codes gone) | — | ⚠️ inventory chat-parity column still references T1–T8 → stale |
| taper_state / closure_offered / frustration_event / homework_referenced / therapist_referral | — | ✅ new | none yet | 🔴 new consumers needed (taper close, logging, report card) |
| S-06 consumed "by A8 and A15" | copy | removed | only orchestrator actually consumed it | ✅ cleanup (A-5) |

## 6. Homework — prompt-only concept today (biggest machinery gap)

- Prompts: A2 ${homework} + coaching rules; Worker 05 homework_progress; Worker 06 homework_track; A2 signal homework_referenced.

- Portal spec: homework + reminders config, Report Card (therapist-only).

- App spec: reminders on Today card + push; (homework appears via Today/reminders).

- Code: no Homework/Reminder/Schedule model in Prisma schema; no push (no firebase_messaging; FCM_SERVER_KEY unused); no scheduler.

- Harness/stories/framework: "homework" appears in none of them.

- Verdict: 🔴 the entire homework→reminder→report-card loop has spec + prompts but zero code, zero tests, zero stories. Priority: add to engineering plan as its own workstream (schema, portal write path, scheduler + push, Today API, summary/report-card feed, corpus cases).

## 7. Reminders / notifications / push

- Product (06 Sep lock): reminders = CORE feature. App: push + Today card; portal: schedule with frequency (off / 1–3×/day at times / as-needed) + custom text; optional quote-of-day (care-plan-aware, Settings toggle).

- Code: nothing. notifications_screen.dart stub, no entry point; analytics only from SRS modal.

- Stories: E-1 defers push/analytics.

- **Resolved (12 Sep, O6):** quote-of-day mechanism now built end-to-end with placeholder content (no real source/owner decided yet — swappable): `User.quote_of_day_enabled` (opt-in, default false), `apps/api/src/lib/quote-of-day.ts` (5 placeholder lines per care plan, deterministic day-of-year selection), `GET/PATCH /settings/quote-of-day`, a `quote` field on `GET /users/me/today`, a Settings toggle, and Today-card rendering. Push/scheduler delivery remains out of scope (pull-based, same as the rest of the Today card).

- Verdict: 🔴 conflict between "reminders core" lock and E-1 deferral + zero code. Who handles notifications? No LLM agent — correct answer: deterministic scheduler + push service (non-LLM); agents never push. Reminder text = therapist-authored + tool scripts (content repo). Re-scope E-1: pull reminders/push forward; keep analytics deferred. Quote-of-day: content source still undecided (open item) — needs owner.

## 8. Mood meter & streaks

- Product: mood meter on Home, 1–5, one tap; no streaks/gamification (logo deepens instead).

- Code: MoodLog + POST /progress/mood/checkin + chart exist but zero mobile callers (CA 2.1); Home ProgressSummary hardcodes placeholder streak '3'/check-ins '12' (TODO E8-S01); streak fields have no writers (only reads in agent-context).

- A2 S-07: mood_inference (companion estimate of primary emotion) — distinct from user's self-report meter.

- Verdict: 🔴 wire Home mood meter → MoodLog (and decide: does the therapist Report Card see mood trends? suggest: yes, permission-gated). Delete placeholder ProgressSummary/streak UI + reads (product killed streaks). Clarify relationship: user meter = self-report (Report Card); A2 mood_inference = session signal (summary), don't merge.

## 9. Journal

- Product: private, write or voice, prompt box (curated platform prompts), emotion-word chips, chat can feed a "worth holding onto" prompt into journal box; journal never chats back. Accepted MVP gap: free text unscanned (risk register), crisis tap always present.

- Code: JournalEntry plaintext; UI claims private/never read; no encryption; no safety scan (accepted); voice = client flutter_tts; server tts_url always null.

- Prompts v2.0: A2 may suggest journaling at closure; no signal field for journal-prompt handoff; Worker 05/06 never read journal (privacy).

- Verdict: ⚠️ privacy-consistent (agents don't read journal ✅). 🔴 chat→journal prompt has no producer signal or API → add optional journal_prompt_suggested to S-07 or separate lightweight API + app hook. Voice journal: if voice notes are stored, decide transcription (out of agent scope; needs product decision + storage/DPDP note).

## 10. Crisis

- Product: persistent crisis button every screen; deterministic S3/S4 out-of-band; A1 v2.0 classifies; A2 never recites helplines.

- Code: CrisisOverlay hide() never called (stuck if opened); /crisis route unregistered → NotFound (CA 1.4); 5 helplines hardcoded offline (iCall 9152987821, Vandrevala 1860-2662-345, NIMHANS, Snehi, 112). S4 turns never persisted (CA 1.3).

- Prompts: A1 01 (S4 literal supremacy) ✅; A2 02 fail-safe = escalate, never generate numbers ✅; A9-pre 03: crisis NEVER Blocked, defer ✅.

- Verdict: 🔴 code bugs (route, hide, persistence) — known P0s (1.3/1.4), in engineering delta. ⚠️ helpline set inconsistency: app hardcodes 5; approved content package (B-5) needs ONE canonical set — decide (iCall + Vandrevala minimum; others?) and single-source it (prompts reference "verified helplines", app/overlay/summary must read same source).

- **Resolved (12 Sep, O7):** canonical set decided — all 5 numbers already shipped in `crisis_overlay.dart` are the approved set. `CrisisResource` reconciled from 2→5 rows (migration `20260912170000_expand_crisis_resource_to_five`), and A9-post's prompt (`apps/api/src/agents/a9-post/prompts.ts` + its mirrored doc) now names all 5 as approved. The app's own crisis-overlay rendering is deliberately left hardcoded/offline-safe, not rewired to read `CrisisResource` live — see `docs/verification/E6-S04-crisis-screen-offline.md`'s offline-must-work requirement.

## 11. Language mode (english | mirror)

- Prompts: ${language_mode} injected into A2 + A9-post; mirror = adaptive Hinglish; A1/A9 understand Hinglish input in both modes.

- App spec v0.3: no language-mode setting anywhere (Settings = consent, emergency contact, voice, account, quote toggle).

- Code: no language_mode field on User/profile; A2 v1.0 was English-only-output.

- Harness/framework: scope line "English-only MVP"; Hinglish only as input sets (C-1/D-1/C-4); no mirror-output eval.

- Verdict: 🔴 add language_mode to app Settings + User profile + payload → A2/A9-post. Update framework scope (dual-mode) + corpus: Hinglish output cases + A9-post Hinglish review set.

## 12. Consent & therapist-read model

- Portal spec: consent once at onboarding; raw-chat access = client permission toggle; therapist reads summaries/digests.

- App spec: consent screen — safety monitoring locked (condition of use); mood/progress/emergency = opt-in.

- Code: POST /users/me/consent exists (safety_monitoring locked) — no evidence of a raw-chat-permission toggle or enforcement on therapist-facing reads; TherapistNote/TherapistClient exist.

- Prompts: Worker 05 flagged "therapist-readable only with permission".

- Verdict: 🔴 explicit permission field (e.g., chat_access_granted) + API enforcement + portal gating needed; verify summaries API enforces it. (Also the earlier open question — setup-consent vs per-conversation — resolved to setup-once + raw-chat toggle in portal spec v0.1.)

## 13. Data / versioning / env naming

| Item | Reality | Verdict |
| --- | --- | --- |
| Per-turn model+prompt version logging | absent everywhere; filename-only versioning | 🔴 required by framework §5.1 + regression; add to Turn row |
| Model pins | docs say Gemini 3.1 Pro/Flash-Lite; code pins gemini-2.5-flash; plan = Llama-3.1-8B | ⚠️ align docs+code+prompt headers (v2.0 prompts already clean) |
| Env names | GCP: evia-dev / evia-500215 / evia-production; harness picker: sandbox/staging/beta (endpoint map empty) | ⚠️ map harness labels → real deployments (C-3); naming table needed |
| Embeddings/RAG | SessionLog summary_embedding pgvector 768 + HNSW; worker embeds summaries | ❓ v2.0 A2 uses ${history} (thread summaries) — keep RAG or drop? decide (embeddings model in cloud-exit scope?) |
| Memory | UserMemory model ✅; no per-thread memory versioning | ⚠️ fine; add homework_track field |

## 14. Test harness / framework — stale items

1. Pipeline includes A12 (framework §0/§2/§5, harness) + A12 faithfulness gate "once wired" → 🔴 remove (prompt set + stories A-5 deleted it).

1. §5.5 rate-limit asserts (SD1/TL2) + session-open asserts → 🔴 rewrite for continuous chat + thread model.

1. A8 truth table dimension "session-state" → thread-state (new/continuing).

1. Scenario format carePlan + turns[] → keep turns as messages; add languageMode, threadState, homeworkContext, toolkit, therapistName fields.

1. Corpus sets: remove day-1/onboarding-intake sets; add: Hinglish input (S0–S4, governance) + Hinglish mirror-output, frustration turns, homework-referencing turns, taper/closure cases, A1 metadata cases (pause-farewell, register collapse, over-bright masking), A9-post Hinglish violations, journal-handoff (if adopted).

1. Hard-fail invariants H-1/H-2 carry over (fallbackUsed, crisis×non-S4, crisis×null).

1. Framework roles ✅ (Shubhangi rater/veto — consistent with clinical pass).

## 15. No-owner / no-machinery register (features with spec but no code/producer)

1. Homework end-to-end (schema → portal → scheduler → Today → report card) — §6

1. Reminders/push (scheduler + FCM) — §7

1. Quote-of-the-day content source + care-plan awareness — §7

1. Chat→journal prompt handoff producer/API — §9

1. Report Card real data (homework_progress from Worker 05) — §6

1. Session Prep digest surfaced from Worker 05 output (permission-gated) — §12

1. language_mode setting + profile + injection — §11

1. Care-plan review flag (care_plan_fit producer after S-07 drop) — §4

1. Tool-id registry shared across inventory/prompts/app-cards/code/harness — §5

1. Canonical helpline source (app overlay vs crisis content vs tests) — §10

## 16. Priority order (suggested)

1. Retire session/turn/slot machinery → thread model (unblocks prompts + app + harness)

1. A8/orchestrator fixes: Blocked→governance, S3 deterministic, Restricted→boundary-hold, reasonCode

1. A1/A9/A9-post config: temp 0 + A9-post fail-closed (code) + A1 metadata plumbing

1. Delete: A12, onboarding machinery, streaks/placeholder UI, A15 copy

1. Homework + reminders workstream (new schema/scheduler/push/report-card) — biggest new build

1. Language mode end-to-end + Hinglish corpus

1. Worker 05/06 schema + therapist permission-gated reads (Session Prep/Report Card)

1. Tool-id registry + tool-card wiring (fix GroundingCard shadowing, extend beyond grounding_5431)

1. Version logging per turn; env-name mapping; framework/harness updates

1. Finalize tools inventory (scripts, chat-vs-app, frequencies) in lockstep with tool registry

Audit v1 — 07 Sep 2026. Re-run after each workstream lands. Companion: engineering delta doc.
