# Simulator: easier multi-persona testing + production-ready UI

**Date:** 2026-08-23
**Scope:** `apps/test-harness`'s `/simulator` page (added earlier this session). Additive only — no changes to the engineer/PI-facing screens.

## Context

The Simulator page (3-pane: scenario config / live chat / plain-language flow status) shipped earlier this session so therapists can test the agent pipeline without seeing engineering internals. The product owner asked for two follow-ups: (1) make it easy to test all agents across different personas, and (2) bring the UI to production quality before real therapists use it.

## 1. Persona quick-switch (friction reduction)

Confirmed direction: switching personas always starts a **fresh session** (not mid-session injection) — simpler, safer, matches how sessions already work.

- Selecting a persona card while a session is already active immediately starts a new one with that persona's opener prefilled — no separate "Start session" click required once one exists.
- If the active conversation has turns, show a lightweight inline confirm before discarding ("Switch to [persona]? This ends the current conversation.") rather than a full modal.
- Remember the last-picked persona for the session (in-memory only, not persisted) and show it first in the list.

## 2. One-click scenario battery (report card)

Reuses `conversation.ts`'s existing `runPersonaScript` procedure — the same scripted-persona-run machinery the engineer-facing Conversation Driver already uses — rather than new backend logic.

- A "Run all scenarios" button fires all 4 built-in personas' scripts in sequence via `runPersonaScript`.
- Results render as a report card: one row per persona, a pass/warning/crisis badge (`run-status.ts` vocabulary), one-line plain-language summary.
- Clicking a row expands into the existing `ChatPane`/`FlowStatusPane` view to drill into what happened.

## 3. Production-ready UI polish

Scoped to concrete gaps, not a cosmetic rewrite:

- Proper loading states (skeleton/spinner) for `startSession`/`sendMessage`/the new battery run, replacing bare "…thinking" text, consistent with `AgentRunner.tsx`'s existing loading pattern.
- First-time empty states for the report card and right-pane status.
- Careful code-level review of the responsive grid at each breakpoint (mobile/tablet/desktop) — this was never visually verified in a real browser; fixing anything that doesn't hold up. No browser automation tool is available, so this remains code-level verification, not a screenshot.
- Double-submit protection on the new "Run all scenarios" button, matching the existing Send-button pattern.
- All new UI (report-card badges, battery status) draws from the existing `run-status.ts` color vocabulary — no new ad hoc colors.

## Out of scope

- Mid-session persona injection (explicitly ruled out in favor of fresh-session-per-persona).
- Any change to `conversation.ts`, `pipeline.ts`, or other engineer/PI screens.
- New `HarnessRole` for therapists (separately flagged, not part of this work).
