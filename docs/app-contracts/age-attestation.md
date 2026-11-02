# App-side contract — 18+ attestation (hand-off to the mobile task)

Status: **portal and API sides are built** (branch `feat/portal-p0-safety-plumbing`).
This document is the contract the Flutter app has to implement; it is a
separate task in `apps/mobile` and nothing in this branch touches the app.

## Why this exists

Okuvu is for adults 18+. Two attestations are recorded, separately, with
timestamps, because they are two different people making the statement:

| Who | Field | When |
|---|---|---|
| Therapist | `TherapistClient.age_confirmed_by_therapist_at` (+ `age_confirmed_by_therapist_id`) | when they add the client in the portal |
| Client | `User.age_confirmed_at` or `User.age_declined_at` | the first time they sign in, in the app |

The therapist's confirmation is an audit record of their belief. It is **not** a
gate. The client's own answer is what decides activation.

## The screen

After sign-in, and **before** the first call to `GET /users/me/today` or
`GET /users/me/context`, show a single blocking screen:

> **Okuvu is for adults 18 and over.**
> Please confirm your age to continue.
>
> [ I am 18 or over ]   [ I am under 18 ]

No dismiss, no back-out into the app, no "remind me later". This is the only
screen in the product where the answer changes whether the account exists.

The answer is stored server-side, so a reinstall does not re-ask: the app should
read `ageConfirmed` from `GET /users/me/context` (added below) or simply rely on
the 403 described under "Declined".

## The endpoint

`POST /users/me/age-attestation`, Cognito-authenticated like every other
`/users/me` route.

Request:

```json
{ "adult": true }
```

Confirmed response (HTTP 200):

```json
{ "adultConfirmed": true, "accountActive": true }
```

Declined response (HTTP 200 — the client answered; the answer is recorded):

```json
{ "adultConfirmed": false, "accountActive": false }
```

400 `INVALID_BODY` when `adult` is missing or not a boolean. 401 when the token
does not map to a live user.

## Declined

The client's answer is final for that account until they answer again:

- `User.age_declined_at` is stamped, `User.age_confirmed_at` cleared.
- `activated_at` is never written for that client (guarded in
  `markClientActivatedIfNeeded`), so the portal shows
  **"Couldn't activate: age"** instead of "Invited · not signed in yet".
- Each active therapist gets one email naming the client's label and the time.
- `GET /users/me/today` and `GET /users/me/context` answer **403**
  `{ "error": { "code": "UNDER_18" } }` — see "What the API will do", below.

The app should, on a declined response:

1. sign the client out (clear the Cognito session) and
2. show a closing screen: *"Okuvu is only available to adults 18 and over. Your
   account has not been activated. If this was a mistake, talk to your
   therapist."* — no support email address until clinical sign-off supplies one.

Do not offer a retry on the same screen. A second attempt is a second answer
from the same person, and treating a tapping error as a re-ask makes the gate
feel negotiable. Signing in again is the recovery path, and it asks once more.

## What the API will do (and does not yet)

The 403 on `today`/`context` is **not** implemented in this branch: those
handlers do not read the attestation yet, because the app cannot be blocked by
an endpoint it never calls and adding the 403 now would break every existing
build on the beta track. It is the API half of the mobile task, and it is three
lines in `apps/api/src/lib/today-card.ts` + `getAgentContextBundle`.

Until it lands, the app is the only thing stopping an under-18 from using the
product, which is why the screen above must ship with (not after) the mobile
work.

## Chat access — one change on the same call

`PATCH /users/me/chat-access` keeps its request body:

```json
{ "therapist_id": "...", "granted": true }
```

What changed server-side (Portal P0):

- `granted: true` stamps `chat_access_granted_at`, which starts the 30-day
  read-only window. Approving again after a revocation reopens it.
- `granted: false` stamps `chat_access_closed_at`, which closes the window
  immediately.

The app needs a UI affordance to **revoke** ("Stop sharing my chat"), because
revocation is now a real, immediate control rather than a flag nobody reads. If
one already exists, nothing to do but verify it sends `granted: false`.
