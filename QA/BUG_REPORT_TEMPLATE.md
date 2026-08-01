# Evia — Bug Report Template

**How to use:** Copy the template below into a GitHub Issue (per CONTRIBUTING.md / E13-S01, every bug must have reproduction steps). Delete the `<!-- ... -->` comments and fill every section. Do not leave placeholders.

> **E13-S01 requirement:** Every bug log entry must have reproduction steps — "the app crashed" with no steps is not acceptable. A1 / crisis-screen issues must be escalated same-day to the Senior Engineer, not just logged.

---

## Bug Report

```markdown
## Title
<!-- One line: what broke, where. e.g. "T-02 crashes when latest summary is FAILED" -->

## Environment
- **Component:** Therapist Portal / Mobile / API / Infra
- **Build/Commit:** <!-- commit hash or "develop" -->
- **URL/Route:** <!-- e.g. http://localhost:3000/clients/<id> -->
- **Browser:** <!-- Chrome 1xx / Firefox 1xx / Edge / Safari -->
- **OS / Device:** <!-- e.g. Windows 11 / iPhone 15 -->
- **Viewport:** <!-- e.g. 1440x900 -->
- **Env vars relevant:** <!-- e.g. LOCAL_DEV_BYPASS_AUTH=true -->

## Severity / Priority
- **Severity:** <!-- Critical / High / Medium / Low -->
- **Priority:** <!-- P0 / P1 / P2 -->

## Story / Requirement reference
- **Story ID:** <!-- e.g. E10-S06, or N/A -->
- **AC / FR violated:** <!-- e.g. E10-S06 AC-3 -->

## Preconditions
<!-- What must be true before the bug can happen, e.g. "Client has a FAILED session summary." -->

## Test data
<!-- Exact data used: client id, phone, care plan, note text, account email -->

## Steps to reproduce
1. <!-- First step -->
2. <!-- Second step -->
3. <!-- ... -->

## Expected result
<!-- What should happen per spec/design -->

## Actual result
<!-- What actually happened -->

## Screenshots / screen recording
<!-- Attach images; for console errors, paste the stack trace -->

## Related test case
<!-- e.g. F-CLNT-003, API-011, EDGE-028 -->

## Suggested fix (optional)
<!-- e.g. "Pass session_started_at instead of session_id to formatDateTime." -->
```

---

## Fill-in example (from BUG-C-1)

```markdown
## Title
Client overview page can crash when the latest session summary has status FAILED or SKIPPED_TRIVIAL

## Environment
- Component: Therapist Portal
- Build: develop
- URL: http://localhost:3000/clients/<client2-id>
- Browser: Chrome 126
- OS/Device: Windows 11 / Desktop
- Viewport: 1440x900

## Severity / Priority
- Severity: Critical (page renders blank / throws during render)
- Priority: P0

## Story / Requirement reference
- Story ID: E10-S06
- AC: E10-S06 AC-3 (missing summary → honest "not yet available")

## Preconditions
- Logged in as a therapist who has a client whose most recent SessionSummary.status is FAILED or SKIPPED_TRIVIAL (so session_id exists but no summary text).

## Test data
- Client2 with session_summaries.status = 'SKIPPED_TRIVIAL', session_id = '<uuid>'.

## Steps to reproduce
1. Seed a client whose latest SessionSummary has status SKIPPED_TRIVIAL (session_id set, summary_text null).
2. Log in to the portal and open /clients/<that client id>.
3. Observe the "LATEST SESSION SUMMARY" card.

## Expected result
A clear "No session summary available yet." message, page renders normally.

## Actual result
The page renders `Last session: {formatDateTime(session_id)}` where session_id is a UUID; `new Date(uuid)` is Invalid, and `.toLocaleDateString()` throws `RangeError: Invalid time value`, so the page fails to render.

## Related test case
F-CLNT-003, EDGE-028, API-011

## Suggested fix
In `clients/[id]/page.tsx`, pass the summary's session_started_at (a real timestamp) instead of session_id, or omit the line when no valid date exists.
```
