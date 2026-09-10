# OKUVU — System Prompts (Updated) v2.0

Date: 07 Sep 2026 · Status: full redesigned set per the OKUVU prompt-redesign discussion (Topics 1–6). Built for Llama-3.1-8B-Instruct (OpenRouter), temp-0 on all classifiers, guided JSON + fail-closed everywhere.

## The set

| # | File | Agent | What it does | Status |
| --- | --- | --- | --- | --- |
| 01 | A1 — Safety Gate | apps/api | Classifies user messages S0–S4 with communication-metadata context (pauses, register, cadence). Supremacy rule: literal crisis language always outranks context. | ✅ Passed by Shubhangi |
| 02 | A2 — Support Companion | apps/api | The OKUVU companion: honest AI identity, therapist-aware, continuous chat with taper sensing (no turn caps), frustration handling, homework coaching, mirror/Hinglish language mode. | ✅ Delivered for review |
| 03 | A9-pre — Governance Gate | apps/api | Classifies Active/Restricted/Blocked on user input. Narrow Blocked; crisis NEVER Blocked (defers to A1); injections judged by structure, not heat. | ✅ Delivered for review |
| 04 | A9-post — Clinical Content Reviewer | apps/api | Reviews A2's draft before delivery. Helpline-integrity + persona checks added; fail-closed; language-aware review (English + Hinglish). | ✅ Delivered for review |
| 05 | Worker — Session Summarisation | apps/worker | Summarises an ended chat thread: narrative, themes, techniques, homework progress, safety flags with verbatim quotes, open loops. Feeds memory + (with permission) the therapist. | ✅ Delivered for review |
| 06 | Worker — Memory Extraction | apps/worker | Merges summaries into persistent memory. Explicit-facts only; homework_track added; safety/crisis content does NOT enter chat-personalisation memory. | ✅ Delivered for review |

## What was removed (and why)

- A12 — Response Renderer — DELETED. Dead code (renderText never called) and it conflicted with A2 (2–3 sentence rewrite vs A2's own voice rules). A2 now writes final OKUVU-voice copy directly.

- A2 Onboarding Scoring + A2 Onboarding Opening Message — RETIRED. Self-serve onboarding was scrapped in the OKUVU pivot; onboarding is therapist-driven (therapist adds client, care plan comes from the portal). Any scoring need moves to the therapist portal, not a chat agent.

- A8 (Router) — no prompt (deterministic rule-based). Not in this set. Its H-2 crisis-mapping bug is a code fix, not a prompt fix.

## Cross-cutting rules baked into every prompt

1. Identity: the companion is OKUVU — one identity, honest AI disclosure, never claims human/therapist/doctor/crisis-line.

1. Therapist in the loop: every agent knows a human therapist exists; A2 may name-drop from the care plan; clinical topics hand to the therapist.

1. Language: ${language_mode} = english | mirror (adaptive Hinglish). A1/A9 understand Hinglish input in both modes; A9-post reviews in the language A2 wrote.

1. No turn rituals: continuous chat; A2 tapers only at natural resting points (solution reached / pacifying / nowhere) — never mid-crisis or mid-technique.

1. Metadata as signal, never verdict: pauses/reaction-time/register/code-switch modulate classification upward only; they never override literal content and never downgrade.

1. Fail-closed everywhere: parse failure → S2 (A1) / Restricted (A9-pre) / BLOCKED (A9-post). No silent passes.

## Engineering gates still required (not part of prompts)

- Hinglish probe set on the real OpenRouter endpoint (Day-1 config) — naturalness + safety accuracy in Hinglish.

- A1 metadata plumbing (timestamps, gaps, cadence) computed server-side per message.

- S-07 signal schema (A2) wiring; taper_state logging.

- Eval corpus additions: Hinglish output cases, homework-referencing turns, frustration turns — before any gate passes.

- Deployment still requires the standing gates: corpus thresholds + RCI Stage-2 review on the new model.
