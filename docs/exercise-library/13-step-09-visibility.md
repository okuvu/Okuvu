# Step 9 — seeing what clients share

Branch `feature/exercise-library`, worktree `/opt/data/okuvu/exercise-lib-wt`.
Commits for this step are on that branch only; nothing merged, no APK.

Owner's instruction, 9 Nov 2026. Build on the existing **Shared with me** tab —
not a second one — and add a short section to the existing Session Prep.

## 0. What was already true

The tab existed from Step 6 and already had the two properties that matter:

- every query filters on `shared_with_therapist = true`;
- a live `TherapistClient` link (`ended_at` null) is required.

Both are kept, and both are now pinned harder: the link check moved into a
shared `assertLiveLink` in `server/trpc.ts`, because `assertClientAssigned`
matches the compound key and therefore still *finds* a link that has ended.
Anything that shows the client's own writing now calls the live-link check.
`Session Prep` calls `assertClientAssigned` first (so "not assigned" is still the
message an unrelated therapist sees) and then `assertLiveLink`.

## 1. Shared entries and notes

Unchanged in substance, one addition: each worksheet item now carries its
`barriers` ("what got in the way") so the tab and the patterns section agree.

The rule "unshared items must not appear at all: no titles, no counts, no dates
and no gaps" is a property of the WHERE clause, not of the renderer. An unshared
row is never in the result set, so there is nothing to filter out downstream.

## 2. Patterns

`shared.list` now returns `patterns`: one entry per exercise, built from the
shared worksheet responses only.

- `occurrences` — how many shared responses. Never counts private ones.
- `points` — the before/after rating and the helped answer, oldest first.
- `beforeRange` / `afterRange` — lowest and highest the client gave.
- `barriers` — "what got in the way", newest first.
- `textOnly` — true when the exercise was shared as text with no ratings.

Deliberately absent: any score, any grade, any direction word. The portal draws
two unlabelled lines and prints the raw pairs (`9→6 · 7→4`). "Improving" and
"getting worse" are conclusions the therapist draws, not ones this page draws
for them.

## 3. Unshared work

The one thing a therapist may know about work the client did **not** share is
whether the assignment was done: the ask was theirs, and "done" is not the
client's words. So `shared.list` returns `assignments`:

```
{ homeworkId, label, assignedAt, dueAt, done, lastDoneAt, repeating }
```

`label` is the exercise label or the therapist's own written homework line. The
select reaches for no `answers`, no `barriers`, no `feeling_*` — a test asserts
those strings are absent from the select object.

## 4. Session preparation

`reportCard.sessionPrep` was restructured. It used to return `{ granted: false }`
and nothing else when the client had not granted chat access. That is now wrong:
the shared half is shown because the client shared it, and a client may share
their journal while keeping chat private.

New shape:

```
{
  chatGranted: boolean,
  entries: [...],                    // chat summaries — only when chatGranted
  since: ISO,                        // last session, else now - days
  shared: { total, journal, worksheets, notes, items[{kind,title,at}] },
  assignments: [{ label, done, dueAt, lastDoneAt, repeating }],
  bringToSession: string | null,     // ws_bring_to_session, only if shared
}
```

- `since` is the client's last non-cancelled past appointment with this
  therapist; if there is none, the caller's window (default 30 days).
- The chat query **does not run** when `chatGranted` is false. A query that never
  runs cannot leak, and `VIEW_SESSION_PREP` is only logged when the chat half is
  read.
- `bringToSession` is taken from the shared worksheet responses, so an unshared
  "What I want to bring to session" is null — indistinguishable from never
  written.
- Everything in the descriptive half is a title, a date, or done/not-done. A
  test asserts the serialized section contains none of: better, worse, improv,
  deteriorat, declin, non-compliant, resistant, unmotivated, poor, good progress,
  no progress, struggl, engaged, score.

## 5. Record keeping

Every share and every unshare appends to the hash-chained audit log
(`apps/api/src/routes/sharing.ts`):

```
actor:  'client'
action: 'SHARE_ENABLED' | 'SHARE_STOPPED'
object: '<kind>:<id>'
detail: { shared, surface }
```

No title, no body, no excerpt, no therapist, no client id. A test asserts the
serialized event contains none of those and that `detail` has exactly two keys.

The append is best-effort twice over: `recordAuditEvent` already swallows its own
failures, and the route wraps it again. A record that cannot be written must not
break the client's share switch — a test makes the audit append throw and expects
the share to still return 200.

## 6. Checks

Portal: 415 tests across 38 files pass; `tsc --noEmit` clean.
API: 103 test files pass; `tsc --noEmit` clean.

The four owner-named checks:

1. **Unshared never appears** — `shared-router.test.ts` asserts
   `shared_with_therapist: true` is in all three WHERE clauses and in the
   pattern-source query; `session-prep-step9.test.ts` asserts the same for the
   three session-prep reads. Both also assert a dead link reads nothing.
2. **Stopping a share removes it everywhere straight away** — covered from
   Step 6 and unchanged here: visibility is the boolean, so the next read of the
   same row is empty. Nothing caches or copies it.
3. **A therapist no longer linked sees nothing** — the live-link check moved to
   `assertLiveLink`; a test asserts the tab refuses before querying and that
   Session Prep refuses before querying.
4. **No judgement words in session preparation** — the test above.

## 7. Known gaps

- No database was applied. This step adds no migration (every column it reads
  already existed), so the Step 13 gate is unchanged: all migrations, real
  Postgres, before any APK.
- "Patterns" only covers worksheet responses. Journal entries and Treasure notes
  have no ratings, so there is no series to draw; they appear as items with
  their dates.
- Session Prep shows at most 20 shared items in the list while the count is the
  true total; the full set is on the Shared with me tab.
