# OKUVU v2.0 — Master Handoff (single source for engineering)

Date: 07 Sep 2026 · Audience: Shubham & Yash (engineers) — via Rajwant's 10-day execution plan · Clinical: all 6 prompts approved by Shubhangi · Process: branch → PR → admin review/merge. GH issues to be filed after Day-1 lock (Rajwant).

This doc is the index + ordered build plan. Details live in the companion docs it links.

## 1. What changed (one paragraph)

OKUVU (was Evia) moved from bounded daily "sessions" to continuous chat, from a hidden chatbot to honest AI identity with a real therapist in the loop, from English-only to a user-selectable English/Mirror (Hinglish) mode, and from platform-assigned care to therapist-driven care with homework. The full agent prompt set was rewritten (A1, A2, A9-pre, A9-post, worker summarisation, worker memory), A12 + onboarding chat agents were deleted, and the codebase/test-harness/docs still describe the old world. This handoff closes that gap.

## 2. Companion docs (read in order)

| # | Doc | Contents |
| --- | --- | --- |
| 1 | SYSTEM PROMPTS UPDATED/00-README-v2.0.md (+ 01–06 docx/md) | The approved prompt set + what was deleted + cross-cutting rules |
| 2 | okuvu-prompt-redesign-decisions.md | Every product decision with rationale (Topics 1–6) |
| 3 | okuvu-prompt-v2-engineering-delta.md | Code/config changes to land the prompts (8 workstreams) |
| 4 | okuvu-parity-audit-v1.md | Feature→function→code parity breaks (16 sections) |
| 5 | okuvu-doc-map-and-parity-resolutions.md | Master doc map + exact edits per doc + schema additions |
| 6 | okuvu-test-findings.md | H-1/H-2 live findings (eval-validity + false-crisis) |
| 7 | okuvu-10day-stories.md + okuvu-10day-brief-tech-team.md | Existing story board + brief (amendments in doc-map §B.5) |

## 3. Non-negotiables (from the approved prompts)

1. Continuous chat: no turn caps, no session rituals, no visible counters. User starts new thread / continues. A2 tapers at natural resting points via taper_state; never mid-crisis/grounding/technique. Silent server-side runaway bound only.

1. Identity: companion is OKUVU; honest AI disclosure; never human/therapist/doctor/crisis-line; may name-drop the real therapist; clinical topics hand to therapist.

1. Language: ${language_mode} = english | mirror (adaptive). Hinglish understood on input in both modes; A9-post reviews in the language A2 wrote.

1. Safety: A1 temp 0 + metadata; A2 receives S0–S2 only (S3/S4 deterministic out-of-band, enforced in orchestrator); A9-pre temp 0, narrow Blocked, crisis NEVER Blocked (defers to A1); A9-post temp 0, fail-closed (BLOCK on any doubt/parse failure).

1. Routing (A8): crisis ⇐ A1=S4 only; Blocked → governance path + GovernanceLog + reasonCode; Restricted → A2 boundary-hold; every decision logs reasonCode.

1. No A12, no A15, no onboarding chat agents — deleted everywhere (prompts, code, harness, docs).

1. Homework is core: schema → portal → scheduler/push → Today card → A2 coaching → Worker 05 homework_progress → Report Card (therapist-only, permission-gated).

## 4. Ordered build plan (merge of delta §8 + audit §16)

Phase 0 — code P0s (gates eval):

1. Audit 1.1 intake/day-1 slot — retire with onboarding machinery (thread model replaces it)

1. Audit 1.3 — persist every S4/crisis turn (required to eval crisis behaviour)

1. Audit 1.4 — A8: Blocked ≠ S4; crisis keys off A1-S4; add reasonCode

1. Audit 1.2 — S3 deterministic grounding enforced in orchestrator (A2 truly never sees S3)

Phase 1 — retire session machinery → thread model:

1. Delete turn caps (CAP_TURN_LIMIT=10), idle auto-close rituals, daily-slot limits (SESSION_LIMIT_*), SessionLimit/day-slot UX, Turn turn_number closure semantics

1. Introduce thread concept: start/continue; silent runaway bound; summarisation trigger on thread end/checkpoint

1. Update WS frame semantics (no SESSION_OPEN_REJECTED DAILY_LIMIT; keep reconnect-replay)

Phase 2 — prompt assets + runtime vars:

1. Land 01–06 as versioned assets; log prompt+model version per Turn

1. A2 runtime vars: user_name, therapist_name, care_plan_focus, homework, toolkit, language_mode, memory, history; drop session_number/turn_number

1. A1 metadata pipeline (gap_before_ms, reply_latency_ms, length trend, register shift, repetition, hour, language, prior states) — per-chat baseline storage (Postgres)

1. A9-pre reasonCode; A9-post language_mode + care_plan_focus

Phase 3 — signals & integrations:

1. S-06 → S-07 (schema: technique_used, tool_launched, taper_state, closure_offered, frustration_event, homework_referenced, therapist_referral, intensity, mood_inference); verify emission/parse on Llama (H-2 signal:null fix)

1. A9-post reviews user-facing text only; strip signal first

1. tool_launched → buildToolCard + tool-result-store: extend beyond grounding_5431; fix GroundingCard shadowing (audit 2.2)

1. care_plan_fit producer moved to Worker 05 (S-07 dropped it); keep therapist review flag fed from summaries

Phase 4 — deletions:

1. A12 (code + harness + framework docs), onboarding scoring/opening + intake flow, A15/CP4 stale copy, streaks/placeholder ProgressSummary UI, mood-placeholder reads

Phase 5 — homework + reminders workstream (biggest new build):

1. Schema: Homework, Reminder/Schedule, User.language_mode, TherapistClient.chat_access_granted, tool registry, canonical helpline source

1. Portal write paths (assign homework, schedule tools/reminders, welcome note, consent incl. raw-chat toggle)

1. Scheduler + push (FCM) — deterministic, NO LLM agent; Today-card API; quote-of-day source decision

1. Report Card + Session Prep: Worker 05 outputs → therapist views, permission-enforced

1. A2 ${homework} + Worker 05/06 fields wired end-to-end

Phase 6 — language mode end-to-end:

1. App setting (English | Mirror) + profile + injection into A2/A9-post

1. Hinglish probe on real OpenRouter Day-1 config (Shubhangi/Rajwant side) → confirm mirror default (O1)

Phase 7 — eval/harness updates:

1. Framework/harness v2.1: pipeline without A12; thread-model asserts; scenario format fields (languageMode, threadState, homeworkContext, toolkit, therapistName, metadata)

1. Corpus additions: Hinglish input S0–S4 + governance; Hinglish mirror-output; frustration turns; homework turns; taper/closure; A1 metadata; A9-post Hinglish violations

1. Env map: harness sandbox/staging/beta → real deployments (evia-dev / evia-500215 / beta slot)

1. Regression default + Gemini baselines (C-2) + RCI Stage-2 re-run before any gate

Phase 8 — docs:

1. Apply doc-map resolutions: app-spec v0.4 deltas (§B.1), portal amendments (B.2), tools-inventory tool-id registry (B.3), stories amendments (B.5)

1. Re-run parity audit after each phase (living doc)

## 5. Open questions (Day-1 / Rajwant)

- O1 mirror-mode default · O2 metadata baseline storage · O3 tool-card launch scope (this sprint vs next) · O4 onboarding-scoring replacement (portal-side intake?) · O5 prompt-asset storage (files/DB/registry) · O6 quote-of-day source · O7 canonical helpline set (iCall+Vandrevala minimum, decide rest) · O8 embeddings/RAG keep-vs-drop (cloud-exit scope)

Master handoff v1 — 07 Sep 2026. Docs 3–5 supersede any conflicting earlier statement in 10-day docs.
