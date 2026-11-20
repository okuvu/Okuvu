# Per-session summary sharing

Owner request, 20 Nov 2026: *"There is no option in privacy and data for 'share
session summaries' ... is there any option to share that per session?"*

There was not. The switch existed in code but (a) was labelled "Chat summaries",
(b) hid itself entirely when the client had no assigned therapist, and (c) could
only speak about the whole relationship — never about one session.

## What a client can now say

Two sentences, two switches:

1. **"Share session summaries"** (Privacy & Data) — may this therapist read
   session summaries at all? Unchanged rule: the client's own grant, 30-day
   window measured from the client's approval, revocable at any time, and only
   ever summaries — never the conversation.
2. **"Choose session by session"** (Privacy & Data → Session summaries) — a list
   of the client's sessions with a switch each. Off means that one session's
   summary is never read, even while the relationship switch is on.

The client is not shown the summary text anywhere. The summary is the
therapist's reading of the session; the client already has the conversation.
The list shows date, time and a state, nothing else.

## The rule (one copy, three readers)

`packages/shared-types/index.ts` → `sessionSummaryVisible(summary, assignment)`:

| `SessionSummary.share_with_therapist` | Meaning |
|---|---|
| `null` | no opinion — follow the relationship switch (default for every pre-existing row) |
| `false` | withheld — the therapist never reads it, whatever the relationship says |
| `true` | allowed — still requires an open relationship window, so it cannot outlive a revocation or the 30 days |

`sharedSummaryWhere()` is the matching Prisma filter. It is an explicit
`OR: [null, true]`, **not** `{ not: false }`: in SQL a nullable boolean compared
with `<> false` drops the NULL rows, which would hide every summary a client
never expressed an opinion about. Proved against a real Postgres:

```
visible rows: s-null=null, s-true=true        <- withheld s-false absent
naive {not:false} rows: s-true                <- the NULL row disappears
predicate: s-false=false, s-null=true, s-true=true
after revoke, predicate says shared: (none)
```

## Surfaces

- **App** (`apps/mobile`): the switch is always present now — before a therapist
  is linked it says so and is disabled, instead of vanishing. New screen
  `settings/session_sharing_screen.dart` with one switch per session.
- **API**: `GET /users/me/sessions/sharing` (list, no summary text) and
  `PATCH /users/me/sessions/:sessionId/summary-share` — the only writer of the
  column. A session that is not the caller's answers 404, not 403, so the route
  cannot be used to confirm someone else's session ids.
- **Portal**: all three read points filter on the same predicate — client profile
  "latest summary", Session Prep digest, Report Card. A withheld session can no
  longer become the "latest summary" card.

## What is not built

Nothing lets a *therapist* or an *operator* set, clear or read the per-session
column, and there is no UI showing a therapist which sessions were withheld —
they simply see the sessions that were shared. That is deliberate: a withhold
that the other side can see and ask about is pressure, not consent.

## Verification

- api `session-summary-sharing.test.ts` 6/6, full suite **1986/1986**
- portal `summary-withhold.test.ts` 4/4, full suite **417/417**
- shared-types `summary-sharing.test.ts` 5/5, full suite **94/94**
- mobile `flutter analyze` clean, full suite **460/460** (4 new cases on the new
  screen, plus the two settings tests that asserted the old hidden row inverted)
- `prisma migrate deploy` against a fresh PostgreSQL 17: **62 migrations applied**,
  `SessionSummary.share_with_therapist boolean` present and nullable
- portal `next build` compiles, no conversation route in the table
