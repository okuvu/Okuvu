# Summary-only consent (2026-11-19)

Status: **built, tested, not deployed.** Branch `feat/summary-only-consent` off
`feat/A6-summary-consumer` (the commit production runs).

## What changed, in user terms

A client's switch in the app has always said **"Chat summaries — see the themes
from what you discuss"**, and the therapist's request banner has always said
**"themes … not your messages"**. Behind that switch the system stored
permission to read the **raw conversation**, and the portal had a Conversation
tab that showed it. The promise and the behaviour disagreed.

Now:

- The client grants **session summaries**. That is all a grant opens.
- The therapist portal has **no conversation view at all** — the page, the tab,
  the profile-page link and the server route are deleted, not hidden.
- The therapist's client-profile summary card is **gated** like the other two
  tabs. It used to read `SessionSummary` directly and show the narrative to any
  assigned therapist, consented or not.
- The operator console can no longer record consent on the client's behalf
  (both "assign client" forms lost their checkbox). Consent is the client's tap.
- The privacy policy, terms and marketing copy no longer describe a raw-chat
  switch that does not exist.

## Schema

`20261119120000_summary_access_consent` renames the four columns on
`TherapistClient`:

| was | now |
|---|---|
| `chat_access_granted` | `summary_access_granted` |
| `chat_access_requested_at` | `summary_access_requested_at` |
| `chat_access_granted_at` | `summary_access_granted_at` |
| `chat_access_closed_at` | `summary_access_closed_at` |

Data is kept. Narrowing what a grant unlocks is safe; revoking and re-asking
would withdraw a consent no client withdrew. Every read gate measures the
30-day window from `summary_access_granted_at`, so a row whose boolean was set
by the old therapist-side attestation (no timestamp) still opens nothing.

## Verification that actually ran

| check | result |
|---|---|
| `apps/api` `tsc --noEmit` | clean |
| `apps/api` vitest | 111 files, **1980 passed** |
| `apps/therapist-portal` `tsc --noEmit` | clean |
| `apps/therapist-portal` vitest | 38 files, **413 passed** |
| `packages/shared-types` vitest | 8 files, **89 passed** |
| `apps/mobile` `flutter analyze lib test` | No issues found |
| `apps/mobile` `flutter test` | **456 passed** |
| `next build` (portal) | compiled; `/clients/[id]/conversation` absent from the route list |
| `prisma generate` | clean against the renamed schema |
| `prisma migrate diff --from-empty --to-schema` | produces the four `summary_access_*` columns; zero `chat_access` hits |

New tests pin the behaviour that was broken:

- `clients.detail` shows no summary to a therapist who set the flag themselves
  (boolean, no client timestamp) — `summary.status === 'not_shared'`.
- `clients.detail` shows no summary once the 30-day window has expired.
- `PATCH /users/me/summary-access` grants/denies/validates as before.
- The deprecated `PATCH /users/me/chat-access` path still works, for installed
  app builds.

## What this did not do, on purpose

- **The migration was not applied to a live Postgres in this session.** There is
  no server or Docker daemon on this host. The file was generated against
  `schema.prisma` and compared column by column; the apply is the deploy step.
- The consent sentence in the portal dialog ("Summaries only — never their
  messages") and the app subtitle reuse the wording already shipped in the
  request banner rather than composing new clinical copy. New client-facing
  sentences still need the clinical owner's sign-off; the two that changed in
  `privacy/page.tsx` and `terms/page.tsx` are factual corrections, but they are
  published legal text and need the owner's approval before the portal deploys.
- Consent age-out (should summaries stop being readable when raw chat access
  would have expired?) was already the 30-day window and is unchanged.

## Known gaps

- The profile card's new `not_shared` branch has **no component test**: this repo
  has no React component test setup (vitest runs `environment: 'node'`). The
  server value it depends on is tested.
- Older app builds (`<= 1.0.22`) still PATCH `/users/me/chat-access` and read
  `therapistChatAccess` / `pendingChatAccessRequest`. Both are kept as
  deprecated aliases on both sides; remove them after the Play rollout.
- `prisma generate` in a fresh worktree writes through pnpm's store; if another
  session runs a generate from the shared checkout it overwrites the client
  there. Regenerate after switching branches.
