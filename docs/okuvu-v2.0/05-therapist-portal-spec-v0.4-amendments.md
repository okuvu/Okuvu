# Therapist Portal Spec v0.1 → amendments

**Written** 12 Sep 2026 · resolves `00-doc-map-and-parity-resolutions.md` §B.2 (`okuvu-remaining-changes.md` §F.2). Each item quotes the original §B.2 instruction, then states what's actually built, citing files.

## 1. "Session Prep" definition

**Original instruction:** digest per chat thread (or therapist-defined period) sourced from Worker-05 summaries — permission-gated.

**Status: done.** `apps/therapist-portal/src/server/routers/report-card.ts`'s `sessionPrep` procedure: a `days`-windowed (default 30) digest of `SessionSummary` rows, each parsed back out of Worker 05's JSON blob (`narrative_summary`, `themes`, `open_loops`) and rendered on `/clients/[id]/report`. It is period-based (a rolling N-day window), not literally "per chat thread" — the underlying `SessionSummary` model is one row per `SessionLog`/session, and there is no separate multi-session "thread" grouping construct in the schema to digest by instead. **Not permission-gated** — unlike Report Card below, `sessionPrep` currently returns to any therapist who passes `assertClientAssigned`, matching the older, ungated pattern the existing "Latest Session Summary" card also uses. This is a real inconsistency worth a decision, not an oversight: does Session Prep need the same `chat_access_granted` gate Report Card now has, given they read the same underlying data?

## 2. Report Card — data source

**Original instruction:** data source = Worker-05 `homework_progress` + `UserMemory.homework_track`; needs Homework model + completion events.

**Status: done, and extended.** `reportCard.reportCard` combines: `homework_progress` (parsed from the last 5 `SessionSummary` rows), `UserMemory.homework_track`, real `Homework` row counts (assigned/completed), a mood trend from `MoodLog`, and — added this session — a read-only snapshot of the 4 previously-orphaned S-07 signals (`taper_state`, `closure_offered`, `frustration_event`, `therapist_referral`) over the last 30 days, plus a `care_plan_review_flagged` indicator on the client-detail page's Care Plan card. **This procedure is gated on `chat_access_granted`** — the first real consumer of that consent field, which existed in the schema since 10 Sep but was enforced nowhere until this workstream. There is still no consent-capture UI for a client to actually set it to `true`, so every client shows the "not granted" empty state today by default — this is expected, not a bug, until that UI exists.

## 3. Add-Client flow — language mode + consent/raw-chat toggle

**Original instruction:** also capture language mode preference (if therapist-set) and confirm consent including the raw-chat-access toggle with API enforcement (audit §12).

**Status: not done.** There is no Add-Client flow in the portal at all today — client accounts are created via the mobile app's own signup, and a therapist's only way to associate with one is the Admin page's "Assign a client" mutation (`apps/therapist-portal/src/server/routers/admin.ts`), which takes a phone number and a therapist, nothing about language mode or consent. `chat_access_granted` is enforced (see §2), but there is no UI anywhere for a client to grant it, nor for a therapist to set a client's language-mode preference on their behalf. This remains a real gap, not a documentation-only one.

## 4. Care-plan — internal labels only, no auto-scoring

**Original instruction:** keep internal CP1–3 labels (therapist-facing) — confirm no client leakage; assignment now therapist-made (no auto-scoring).

**Status: done.** `decideAssignment()`/onboarding auto-scoring is confirmed deleted from `apps/api/src` (commit `1a30ce5`). Care-plan assignment today is exclusively therapist-made via `clients.ts`'s `setCarePlan` mutation (`/clients/[id]/program`), which always writes `assignment_state: 'confirmed'` — there is no code path left that auto-assigns or auto-confirms a plan. CP1–3 labels (`Anxiety & Worry`, `Low Mood & Depression`, `Stress & Burnout`) are rendered only in therapist-portal UI; the mobile client never receives `care_plan_id` or a plan name, only the free-text `care_plan_focus` A2 uses in its own prompt context — confirmed no portal or API route returns `care_plan_id` to a mobile-facing endpoint.

## New since v0.1 (not anticipated by the original spec)

- **Homework** (`/clients/[id]/homework`) and **Reminders** (`/clients/[id]/reminders`) scheduling pages — full write paths, not anticipated as separate portal pages in the original v0.1 spec but required by the Phase 5 homework/reminders workstream.
- **Sidebar "Reports" link** now points at the real Report Card page instead of showing a permanent "Coming soon" placeholder — the other two placeholder items (Schedule, Safety Reviews) remain "Coming soon" since no feature exists behind either yet.
- **`ToolRegistryEntry`** — a shared tool-id registry (see `03-tool-id-registry.md`), seeded with 3 clinically-pre-approved tools, now linked from `Reminder.tool_id` for the reminders-scheduling dropdown.

## Not covered by this amendment (open, tracked elsewhere)

- Session Prep's permission-gating inconsistency (§1) — needs a decision, not just code.
- Add-Client flow, language-mode capture, and consent-capture UI (§3) — genuinely unbuilt.
- Canonical helpline source and crisis-response script content — clinically owned.
- The full tool-id list beyond the 3 already-approved tools — pending clinical review (`03-tool-id-registry.md`).
