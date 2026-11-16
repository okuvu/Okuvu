# App contract — self-serve signup (`POST /auth/signup`)

Status: **API, app and operator console are built.** This replaces the therapist
portal's Add-Client wizard as the *way most clients arrive*. The wizard still
works and is still the right path for a client who has never opened the app.

## Why

Before this, a `User` row could only be created by the portal, so anyone who
installed OKUVU without being registered first hit a waitlist and could go no
further. Now they sign in with Google and create their own account.

The rule that did **not** change: verifying an identity creates nothing.
`POST /auth/google` still answers `has_account: false` for a stranger and writes
no row. Account creation is a separate call that carries the client's own answers
— 18+, and consent — so a replayed sign-in token can never mint accounts, and an
account cannot exist without those answers recorded against it.

## The flow

1. `POST /auth/google` → `200`, `has_account: false`, plus a session token.
2. App shows the 18+ question and the consent cards (`/onboarding/signup`).
3. `POST /auth/signup` with the same Google ID token and the answers.
4. `200` → the app marks onboarding complete and goes to Home.

An existing client (registered by a therapist) never sees step 2–3: their first
sign-in binds the subject to the row the portal created and returns
`has_account: true`.

## The request

```json
{
  "id_token": "<Google ID token from the same sign-in>",
  "adult": true,
  "consents": {
    "safety_monitoring": true,
    "mood_inference": false,
    "assessment": false,
    "emergency_contact": false
  }
}
```

- `adult` — required boolean. `false` creates nothing.
- `safety_monitoring` — must be `true`; it is the "Always on" card. A payload
  without it is `400 CONSENT_REQUIRED`, because the gate lives in the write, not
  only in the screen.
- `mood_inference` / `assessment` — the single chat-share toggle sets both.
- `emergency_contact` — the API always stores `false`; the emergency-contact
  screen owns that consent.

## Responses

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ has_account, user_id, email, linked, already_registered, token, expires_at }` | Row created (`linked: false`) or the invited row was bound (`linked: true`), or it already existed (`already_registered: true`, nothing written) |
| 400 | `INVALID_BODY` / `CONSENT_REQUIRED` | Missing `adult`, missing `id_token`, or safety monitoring not accepted |
| 401 | `INVALID_GOOGLE_TOKEN` | Token failed verification (opaque on purpose) |
| 403 | `UNDER_18` | The client said they are under 18 — nothing created |
| 403 | `ACCOUNT_DELETED` | The row is soft-deleted; signing in never resurrects it |
| 409 | `EMAIL_IN_USE` | That email is bound to a different Google subject; support fixes by hand |
| 503 | `SIGN_IN_NOT_CONFIGURED` | Server misconfiguration, not a client error |

The `200` carries a fresh session token, so a build that reaches this screen
after losing its stored session still finishes signed in.

## What the new account does not have

- **No therapist assignment** — the client is in the console's unassigned list
  (`Today → No therapist`, and the Clients table's "Assign therapist" action).
- **No care plan** — `ClinicalConfig` is created by the therapist, not at signup.
  Until then `care_plan` is `null`, `care_plan_focus` reaches the agent as
  `null`, and the agent's turns are non-directional rather than a guess at CP1.
- **No `client_code`** — the number is derived from legal name, birth year and
  gender. The console's "Set ID details" action issues it once known.

Everything else is the same: chat, journal, exercises, mood check-ins, safety
flows — an unassigned client sees the whole app.

## Age gate, server-side

The app blocks an under-18 before it calls anything, but the server refuses too:

- `GET /users/me/context` → `403 UNDER_18` (the bundle is empty and flagged).
- `GET /users/me/today` → `403 UNDER_18`, before any activation write.
- `GET /ws` (chat) → `403` at the handshake.

The predicate is `isAgeDeclined` in `packages/shared-types` — one function, so
the app, the API and the console cannot drift. A client who has never been asked
(both timestamps null — every row created before this, and every build already in
the field) passes; refusing them would lock existing users out on deploy.

## Console

- `admin.overview.unassignedCount` — how many people joined and have nobody
  looking after them.
- `admin.listClients` already returns these rows with `therapyState: 'unassigned'`.
- `admin.assignClientUser({ therapistId, clientUserId, chatAccessGranted?, languageMode? })`
  attaches a therapist by row id. `admin.assignClient` (phone lookup) stays for
  the older flow and is useless for these clients, who have no phone number.
