# OKUVU — Master Doc Map + Parity Resolutions (v2.0 lock-in)

Date: 07 Sep 2026 · Purpose: "connect all docs" — one map of every OKUVU doc, its status, what supersedes it, and the exact edits needed to restore parity after the v2.0 locks (prompts approved 07 Sep; continuous-chat + therapist-driven + Hinglish + homework decisions).

Companions: okuvu-parity-audit-v1.md (the breaks) · okuvu-prompt-v2-engineering-delta.md (the code work) · this doc (the doc work).

## PART A — Master doc map

| Doc | Layer | Status today | Superseded by / action |
| --- | --- | --- | --- |
| SYSTEM PROMPTS UPDATED/01–06 | prompts | ✅ CURRENT (clinically approved 07 Sep) | — |
| okuvu/docs/user-app-spec-v0.3.md | app | ⚠️ STALE in §8 chat + §5 reminders | Needs v0.4 edits (Part B.1) |
| okuvu/docs/therapist-portal-spec-v0.1.md | portal | ✅ current, but needs homework/scheduler plumbing confirmation | Small amendments (B.2) |
| okuvu/docs/tools-inventory-v0.1.md | tools | ⚠️ chat-parity col references dead T1–T8 | Needs tool-id registry alignment (B.3) + clinical pass |
| okuvu-mvp-test-framework-v2.md | eval | ⚠️ A12 in pipeline; SD1/TL2 asserts; English-only | Needs v2.1 edits (B.4) |
| okuvu-mvp-test-harness-v2-engineering.md | harness | ⚠️ same pipeline + empty env map | v2.1 edits (B.4) |
| okuvu-10day-stories.md | backlog | ⚠️ B-1/B-6/B-7/E-1 drift | Amendments (B.5) |
| okuvu-critical-audit.md + deep-dives | code truth | ✅ historical reference | Fixes tracked in engineering delta |
| okuvu-test-findings.md | findings log | ✅ current | H-3 candidate: parity findings |
| okuvu-prompt-redesign-decisions.md | decisions | ✅ CURRENT | — |
| okuvu-prompt-v2-engineering-delta.md | engineering | ✅ CURRENT | — |
| okuvu-parity-audit-v1.md | parity | ✅ CURRENT | — |
| This doc | doc map | ✅ CURRENT | — |

## PART B — Per-doc resolutions (exact edits)

### B.1 user-app-spec-v0.3 → v0.4 deltas

1. §8 Chat: delete "~20 turns per session with taper… SD 1/day TL 2/day guardrail". Replace: continuous chat; no caps/counter; user starts new thread or continues; OKUVU closes at natural resting points (taper), never mid-moment; silent server-side runaway bound (invisible).

1. Add Settings item: Language mode = English only | Mirror (default: English until Hinglish gate passes — pending O1). Stored on profile; drives ${language_mode}.

1. §5 Reminders: promote from "not in current build" to core (already locked 06 Sep) — reference scheduler + push workstream.

1. Add Journal handoff: chat-suggested journal prompt mechanism (S-07 field or light API) — mark as being wired.

1. Add Homework (new section or under Today): homework from therapist appears on Today card; completion is user-confirmed + chat-reported; feeds Report Card (therapist-only).

1. Home: remove any residual placeholder (streak/counters) — confirm none ship; mood meter → real MoodLog write.

1. Voice naming: keep "OKUVU" (§8) — matches prompts.

### B.2 therapist-portal-spec-v0.1 amendments

1. "Session Prep" definition: digest per chat thread (or therapist-defined period) sourced from Worker-05 summaries — permission-gated.

1. Report Card: data source = Worker-05 homework_progress + UserMemory homework_track; needs Homework model + completion events.

1. Add Client flow: also captures language mode preference (if therapist-set) and confirms consent incl. raw-chat access toggle with API enforcement (§12 audit).

1. Care-plan: keep internal CP1–3 labels (therapist-facing) — confirm no client leakage; assignment now therapist-made (no auto-scoring).

### B.3 tools-inventory-v0.1 fixes

1. Replace chat parity: T1–T8 column with tool-id registry shared by: prompts (A2 ${toolkit}/S-07 tool_launched), app cards, code buildToolCard/tool-result-store, harness corpus.

1. Tool ids (proposal): grounding_5431, box_breathing, physiological_sigh, extended_exhale, breathing_478, urge_surfing, opposite_action, check_the_facts, please_check, emotion_naming, one_small_thing, … (final list = registry task).

1. Mark which tools A2 may guide in chat vs app-only card (Shubhangi review — still pending).

1. Frequency/schedule defaults per tool feed the reminder scheduler.

### B.4 test-framework/harness v2.1 edits

1. Pipeline = A1 → A9-pre → A8 → A2 → A9-post (delete A12 from §0/§2/§5 + harness; remove A12 faithfulness gate).

1. Replace §5.5 rate-limit/session-state asserts with thread-model asserts (new/continuing thread; no caps; taper state machine).

1. Scenario format: keep turns[] as messages; add languageMode, threadState, homeworkContext, toolkit, therapistName, metadata (A1 cases: pauses/register/repetition).

1. Corpus: drop day-1/onboarding-intake sets; add Hinglish input S0–S4 + governance, Hinglish mirror-output, frustration turns, homework turns, taper/closure cases, A1 metadata cases, A9-post Hinglish violations, journal-handoff (if adopted).

1. Env map: sandbox/staging/beta → real deployments table (evia-dev / evia-500215 / supervised-beta slot) — C-3 wiring.

1. Roles unchanged (Shubhangi rater/veto).

### B.5 stories amendments (10-day board)

- B-1 (intake day-1 slot): RETIRE with onboarding machinery (superseded by thread model + therapist-driven onboarding).

- B-6 (A2 under "new session model"): reword → continuous-chat model.

- B-7 (make SESSION_TURN_LIMIT real): replace with silent runaway bound + thread model (no user-facing limit).

- E-1 (push/analytics deferred): split — push/reminders pulled forward (core), analytics stays deferred.

- A-5 (delete A12): already present ✅ — extend to "delete A12 + onboarding scoring/opening + A15 copy + streak/mood-placeholder UI."

- New stories needed: homework/reminders workstream; language-mode; A1 metadata pipeline; version logging; S-07 wiring; tool-id registry; permission enforcement.

## PART C — Schema additions (Prisma) implied by parity fixes

| Model/field | Purpose | Consumed by |
| --- | --- | --- |
| Homework (+ status/timestamps) | therapist-assigned tasks | portal, Today card, A2 ${homework}, Worker 05 |
| Reminder / Schedule (+ frequency, times) | scheduler source | push service, Today card |
| User.language_mode | english\ | mirror |
| TherapistClient.chat_access_granted (or consent table field) | raw-chat permission | portal reads, summaries API |
| Turn.prompt_version / Turn.model | attribution | regression, harness |
| SessionSummary JSON fields | homework_progress, safety_flags, open_loops | portal Session Prep/Report Card |
| UserMemory.homework_track | continuity | A2 |
| Tool registry table (or shared JSON) | canonical tool ids + scripts | prompts, app, portal, harness |
| Helpline canonical source (table/config) | single crisis-number set | app overlay, crisis content, tests |

## PART D — Sequence to close the loop

1. Shubhangi: pass the B.1/B.2/B.3 doc edits (or delegate to me to produce v0.4/v2.1 drafts).

1. Fold A–D into one engineering handoff for Shubham/Yash (branch → PR → admin).

1. Day-1 discussion with Rajwant → file GH issues from the delta + this map.

1. Re-run parity audit after each workstream (audit is a living doc).

Doc map v1 — 07 Sep 2026.
