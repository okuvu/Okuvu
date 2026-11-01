# E17-S4 — clause 3: `/audit/verify` returns `ok:true` with `count > 0` after a real turn

**Status: DONE for the acceptance criterion; one deviation from the brief, stated up front.**

The acceptance criterion is met on the deployed beta stack — `GET /audit/verify` now returns
`{"ok":true,"count":1,...}` after a genuine turn served by `api.okuvu.in` against real Bedrock
(qwen3-32b), with the audit row independently confirmed in Postgres and its hash recomputed
independently.

The deviation: **the turn could not be made as a seeded therapist**, because the deployed API only
trusts the *clients* Cognito user pool, and the three seeded therapists live in the *therapists*
pool. A valid therapist ID token is rejected with `401 UNAUTHORIZED`. This is proven in §2, not
assumed. The turn in §4 was therefore made by a **real, authenticated client identity** provisioned
in the pool the API trusts (Cognito user + `User` row, exactly the state the invite-redeem flow
produces). No therapist data was read, written or deleted.

| | |
|---|---|
| Branch | `feat/E17-S4-audit-clause` (base `4c8809b`, origin/develop) |
| Deployed API commit | `4c8809bdaa9d` (`GET /health`) |
| Clause-3 verbatim | "the audit-chain verify endpoint returns ok with a count greater than zero after the run" |
| `/audit/verify` (after) | `{"ok":true,"count":1,"first_bad_seq":null,"head":"6b83d6f55959a62f0c0b3b5bcf82653462d28a9e7d43ce173e4058e4f829b565"}` HTTP 200 |
| `AuditEvent` rows (DB) | **1** (was 0) |
| Crisis set (13 suites) | **331 / 331 passed** |
| Full api suite | **1240 / 1240 passed**, 71 files |
| `tsc --noEmit` (apps/api) | exit 0 |

---

## 1. What the endpoint requires, and what writes a row

`apps/api/src/routes/audit.ts` — `GET /audit/verify`, `preHandler: [verifyCognitoJWT]`, returns
`{ok, count, first_bad_seq, head}` with **200** only when `verifyPersistedAuditChain()` verifies
every row; 500 if the chain is broken, 503 if the table cannot be read.

`apps/api/src/lib/audit-log.ts` — `verifyPersistedAuditChain()` loads every `AuditEvent` row in
`seq` order and re-checks: `prev_hash` linkage, contiguous `seq`, body re-canonicalisation, and
column↔body agreement. Empty chain ⇒ `ok:true, count:0`.

Writes (both in `apps/api/src/pipeline/orchestrator.ts`, i.e. **in the api task**, not the worker):

| Site | Action | When |
|---|---|---|
| `orchestrator.ts:331` | `SAFETY_CRISIS_ROUTED` (actor `A8`) | crisis path, before the turn returns |
| `orchestrator.ts:751` | `TURN_COMPLETED` / `TURN_FALLBACK_SERVED` / `MODEL_UNAVAILABLE_FALLBACK` / `SAFETY_UNAVAILABLE_FALLBACK` (actor `pipeline`) | every completed non-crisis turn |

The only production path that reaches `processTurn()` is the WebSocket route
(`apps/api/src/routes/websocket.ts:8`, `USER_TURN` at line 169 → `processTurn` at 306).
`POST /journal/prompt` calls Bedrock but **does not** write an audit row (it never touches the
orchestrator), so it cannot satisfy this clause.

`verifyCognitoJWT` (`apps/api/src/middleware/auth.ts`) → `verifyCognitoToken()`
(`apps/api/src/lib/cognito-auth.ts`) which, after signature/expiry checks, requires:

- `iss` == `https://cognito-idp.<region>.amazonaws.com/<COGNITO_USER_POOL_ID>`
- `aud` (ID token) or `client_id` (access token) == `COGNITO_CLIENT_ID`

Deployed values (`evia-beta-api:20` container environment):

```
COGNITO_USER_POOL_ID = ap-south-1_y2V0jvjGP   (pool "evia-beta-clients")
COGNITO_CLIENT_ID    = mqisid7kr7vjm95rvt0g10usj  (app client "evia-beta-mobile", no secret)
LLM_PROVIDER         = bedrock
BEDROCK_MODEL_ID     = qwen.qwen3-32b-v1:0
```

## 2. Finding: a seeded therapist cannot authenticate to the API

The three seeded therapists live in a **different** user pool, `ap-south-1_eaJaK7g4g`
(`evia-beta-therapists`, app client `7bcn376flgj7rt35a05a14pk7g` — "evia-beta-portal"), which is
what `https://okuvu.in` signs them into. That pool/client is not in the API's allow-list, and the
therapist portal is a Next.js app that reads Postgres through its own tRPC layer — it never calls
`api.okuvu.in` (no `API_URL`/`Bearer` call site anywhere in `apps/therapist-portal`).

A real therapist ID token was minted for `ananya.rao@okuvu.in` with `USER_PASSWORD_AUTH` +
`SECRET_HASH` (password read from SSM `/evia-beta/therapists/ananya.rao/password`, client secret
from Secrets Manager `evia-beta/portal-cognito-client-secret`; neither is printed anywhere in this
file). Claims observed — redacted, and note pool + audience:

```
iss       = https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_eaJaK7g4g   <-- not the API's pool
aud       = 7bcn376flgj7rt35a05a14pk7g                                          <-- not the API's client
token_use = id
```

```
$ curl -sS -H "Authorization: Bearer <therapist id token>" https://api.okuvu.in/audit/verify
2026-10-29T05:06:18Z
{"error":{"code":"UNAUTHORIZED","message":"Invalid or expired token"}}
HTTP 401
```

The middleware deliberately keeps the failure opaque (auth.ts comment), but the only two claims
that could fail here both differ from the deployed config above, and the identical call with a
token from the trusted pool returns 200 (§5). So: **therapists have no API surface in beta today**;
the API is the mobile client's API. Closing this properly is an auth-config decision (accept a
second pool/client, or issue therapist tokens from a portal-side service), not something this
clause should paper over.

## 3. Identity used for the turn

Provisioned in `ap-south-1_y2V0jvjGP` only, so the API's verifier accepts it:

- Cognito user, username/`phone_number` `+919****0001`, `phone_number_verified=true`,
  `email=e17s4-audit-probe@okuvu.in`, `MessageAction=SUPPRESS` (no SMS sent), permanent password
  generated locally into a `0600` file and never printed.
- `User` row in Postgres with `auth_subject` = the token's `sub` (`01037dea-…`), i.e. the state
  `POST /invites/redeem` produces. Inserted through `scripts/in-vpc-db-task.sh`:

```sql
INSERT INTO "User" (id, auth_subject, phone_number, email, full_name, created_at, updated_at)
VALUES ('8f1c2d34-5e6a-4b7c-9d0e-1a2b3c4d5e6f', '<sub>', '+919999900001',
        'e17s4-audit-probe@okuvu.in', 'E17-S4 audit probe', now(), now());
```

No seeded therapist row was touched (`Therapist` count 3 before and after; `AuditEvent` was empty
and nothing was cleared).

## 4. The turn (real, over wss://api.okuvu.in/ws)

`SESSION_OPEN` → `SESSION_OPEN_CONFIRMED` → `USER_TURN` → `AGENT_TURN`. Raw frames:

```
2026-10-29T05:02:32.697Z {"event":"ws_open","url":"wss://api.okuvu.in/ws"}
2026-10-29T05:02:32.749Z {"event":"sent","frame":"SESSION_OPEN"}
2026-10-29T05:02:32.821Z {"event":"frame","type":"SESSION_OPEN_CONFIRMED",
  "payload":{"session_id":"a6c7c01d-186a-416f-8303-fdb3b65581a0",
             "session_started_at":"2026-10-29T05:02:32.798Z","crisis_bypass":false}}
2026-10-29T05:02:32.824Z {"event":"sent","frame":"USER_TURN","message":"Hi, I just got set up on the app and wanted to say hello. I've had a long week at work and I'm feeling a bit drained, but I'm doing okay."}
2026-10-29T05:02:35.363Z {"event":"frame","type":"AGENT_TURN",
  "session_id":"a6c7c01d-186a-416f-8303-fdb3b65581a0","turn_count":1,
  "turn_id":"8f125116-3230-4c12-bd01-9c4896e9ebee","fallback":null,
  "message":"Hi — welcome to the app. Glad you're here. A long week sounds exhausting — it's totally okay to feel drained after that. Want to try a quick breathing exercise to help reset a bit?"}
2026-10-29T05:02:35.363Z {"event":"result","ok":true,"elapsed_ms":2721}
```

No safety notice, no fallback — a normal S0 turn, so the write site that fired is
`orchestrator.ts:751` (`TURN_COMPLETED`).

API log for the same request (`/ecs/evia-beta/api`, `reqId=req-56`):

```
05:02:32 {"event":"user_turn","request_id":"3e5c8f4b-…","session_id":"a6c7c01d-…","msg_len":137,"msg":"Processing USER_TURN"}
05:02:35 {"event":"budget_usage","model_calls":4,"input_tokens":14780,"output_tokens":186,
          "total_tokens":14966,"turn_cost_usd":0.002792,"counter_store":"redis"}
05:02:35 {"event":"user_turn","outcome":"success","turn_count":1,"fallback_used":false,
          "fallback_source":null,"safety_code":null,
          "timing":[{"stage":"layer3_rag","elapsedMs":385},{"stage":"A1","elapsedMs":1052},
                    {"stage":"A9_pre","elapsedMs":1361},{"stage":"A8_router","elapsedMs":0},
                    {"stage":"A2_response","elapsedMs":515},{"stage":"A9_post","elapsedMs":320}],
          "msg":"Turn completed"}
```

Four real Converse calls and real token counts ⇒ inference genuinely happened. The model id is the
task's `BEDROCK_MODEL_ID=qwen.qwen3-32b-v1:0` (`LLM_PROVIDER=bedrock`); the app does not log the
model id per call, so the binding is env-derived rather than a log line — stated plainly rather than
dressed up.

## 5. `GET /audit/verify` — before and after

Before (baseline, same token, fetched immediately after provisioning):

```
$ curl -sS -H "Authorization: Bearer <client id token>" https://api.okuvu.in/audit/verify
{"ok":true,"count":0,"first_bad_seq":null,"head":"0000000000000000000000000000000000000000000000000000000000000000"}
HTTP 200
# corroborated by the API log: 05:00:47 {"event":"audit_verify","ok":true,"count":0,...}
```

After the turn:

```
$ curl -sS -H "Authorization: Bearer <client id token>" https://api.okuvu.in/audit/verify
2026-10-29T05:02:38Z
{"ok":true,"count":1,"first_bad_seq":null,"head":"6b83d6f55959a62f0c0b3b5bcf82653462d28a9e7d43ce173e4058e4f829b565"}
HTTP 200
# API log: 05:02:38 {"event":"audit_verify","ok":true,"count":1,"first_bad_seq":null,"msg":"Audit chain verified"}
```

Re-checked at `05:06:18Z` — identical body, `count:1`, same head.

## 6. Independent confirmation in the database

Census through `scripts/in-vpc-db-task.sh` (one-off Fargate task in the VPC; DATABASE_URL composed
from the `evia-beta/database` secret):

```
before 2026-10-29T04:57Z  {"audit_events":"0","max_seq":0,"users":"0","turns":"0","sessions":"0"}
after  2026-10-29T05:03Z  {"audit_events":"1","max_seq":1,"users":"1","turns":"2","sessions":"1"}
```

(`turns:2` = the user turn + the assistant turn; `Therapist` stayed 3 throughout.)

The row:

```
seq=1  actor=pipeline  action=TURN_COMPLETED  object=turn:8f125116-3230-4c12-bd01-9c4896e9ebee
at=2026-10-29T05:02:35.349Z  prev_hash=0000…0000  hash=6b83d6f55959a62f…  body_len=355
```

Body (the exact bytes that were hashed):

```json
{"action":"TURN_COMPLETED","actor":"pipeline","at":"2026-10-29T05:02:35.349Z","detail":{"classifier_fallback":false,"fallback_source":"none","governance_state":"Restricted","safety_code":"none","safety_state":"S0"},"object":"turn:8f125116-3230-4c12-bd01-9c4896e9ebee","prev_hash":"0000000000000000000000000000000000000000000000000000000000000000","seq":1}
```

Independent recomputation (Python, from the DB row, not through the API):

```
stored : 6b83d6f55959a62f0c0b3b5bcf82653462d28a9e7d43ce173e4058e4f829b565
recalc : 6b83d6f55959a62f0c0b3b5bcf82653462d28a9e7d43ce173e4058e4f829b565   (sha256(prev_hash + body))
match  : True
```

So the endpoint is not returning a canned `ok` — the sealed row really chains from genesis.

Note the pipeline ran at `governance_state: Restricted` / `safety_state: S0` and still served a
normal reply: A9-pre being unreachable/unpinned resolves to `Restricted` by design and does not
change the user's path (already recorded as a known, unchanged behaviour in `E17-S4.md` §7 item 9).

## 7. Regression check for clauses 1–2

Fresh worktree, so the Prisma client had to be generated before typechecking (the first `tsc` run
failed on `Module '"@prisma/client"' has no exported member 'PrismaClient'` plus cascading implicit
`any`s — an ungenerated-client artefact, not a code regression):

```
pnpm install --frozen-lockfile        # 5.1s, lockfile unchanged
pnpm --filter @okuvu/prisma generate  # Prisma Client v7.8.0

cd apps/api && npx tsc --noEmit       -> exit 0
```

The crisis-detection selection from `evidence/E17-S4.md` §5, re-run verbatim:

```
cd apps/api && npx vitest run src/__tests__/a1.test.ts src/__tests__/a8-router.test.ts \
  src/__tests__/orchestrator.test.ts src/__tests__/orchestrator.testMode.test.ts \
  src/__tests__/pipeline-v2.test.ts src/__tests__/a12.test.ts src/__tests__/a13.test.ts \
  src/__tests__/a15.test.ts src/__tests__/a9-post.test.ts \
  src/__tests__/safety-fail-closed.test.ts src/__tests__/safety-fail-closed-wire.test.ts \
  src/__tests__/token-budget.test.ts src/__tests__/websocket-budget.test.ts

 Test Files  13 passed (13)
      Tests  331 passed (331)        # start 05:05:41
```

Whole api suite:

```
cd apps/api && npx vitest run
 Test Files  71 passed (71)
      Tests  1240 passed (1240)      # start 05:06:10
```

No regression in clauses 1–2, and `/audit/verify` has its own live-path coverage in
`safety-fail-closed-wire.test.ts` ("the audit chain verifies with a count greater than zero after
these runs"), which is part of the 331.

## 8. What is still open

1. **Therapists have no API identity.** The brief asked for a therapist turn; the deployed API
   trusts only `evia-beta-clients` / `evia-beta-mobile`. Proving clause 3 needed a client identity.
   Fixing the therapist path is an auth decision (second pool/client in `verifyCognitoToken`, or a
   portal service token) — out of scope here, and the reason this file leads with the deviation.
2. **A probe client now exists in beta**: Cognito user `+919****0001` /
   `e17s4-audit-probe@okuvu.in` and `User` id `8f1c2d34-5e6a-4b7c-9d0e-1a2b3c4d5e6f`, with 1
   `SessionLog` and 2 `Turn` rows. It was left in place because the `AuditEvent` row references
   `turn:8f125116-…`; removing it needs an explicit decision (and would leave an audit row pointing
   at a deleted turn).
3. **The chain now has one row and cannot be rewound**: deleting `AuditEvent` rows to "retest from
   zero" would both break the honest `count` and violate the brief. Any future clean-slate
   measurement must record the before-count, as this file does.
4. **Tail truncation is still undetectable** by `verify` (deleting the newest rows leaves a shorter
   but internally valid chain) — unchanged known limitation, needs an external head witness.
5. **Model id is inferred from task env**, not from a per-call log line; `budget_usage` proves the
   calls happened and what they cost ($0.002792 for 14,966 tokens across 4 calls).
6. `journal/prompt` writes no audit row (verified by reading its handler) — worth deciding, since
   it is a real model call on an HTTP path and currently leaves no chain entry.
