# Fastify Backend — Local Dev Guide

Step-by-step guide to bring up the backend server, verify the health endpoint, and test protected routes with the local auth bypass.

---

## 1. Prerequisites

- Node.js 20+
- pnpm 9+
- All dependencies installed at the repo root:

```bash
pnpm install
```

---

## 2. Environment setup

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Your Neon branch connection string | Required for Prisma |
| `LOCAL_DEV_BYPASS_AUTH` | `"true"` | Enables local auth bypass for testing protected routes |
| `NODE_ENV` | `"development"` | Must NOT be `"production"` while using the bypass |

---

## 3. Start the server

```bash
cd apps/api
pnpm dev
```

Expected startup output:

```json
{"level":30,"msg":"Server listening at http://127.0.0.1:3000"}
```

The server uses Pino structured logging. Every request produces at least one log line with method, path, status code, and duration.

---

## 4. Verify the health endpoint

The `GET /health` route requires no authentication:

```bash
curl http://localhost:3000/health
```

Expected response (200):

```json
{"status":"ok","timestamp":"2026-06-24T13:00:00.000Z"}
```

---

## 5. Test protected routes with bypass mode

With `LOCAL_DEV_BYPASS_AUTH="true"` in `.env`, the `verifyFirebaseJWT` middleware skips real token verification and attaches the fake user id `mock-firebase-uid-1`.

Call any protected route without an `Authorization` header:

```bash
curl http://localhost:3000/protected-route
```

The middleware attaches `request.user = { uid: "mock-firebase-uid-1" }` and the request proceeds normally.

> The Authorization header is **ignored entirely** in bypass mode — even an invalid token won't cause a 401.

---

## 6. Test 401 when bypass is off

Set `LOCAL_DEV_BYPASS_AUTH="false"` in `.env` (or remove it), restart the server, then call a protected route:

```bash
curl http://localhost:3000/protected-route
```

Expected response (401):

```json
{"error":{"code":"UNAUTHORIZED","message":"Missing Authorization header"}}
```

---

## 7. Verify the production guard

The server **refuses to start** if `NODE_ENV=production` and `LOCAL_DEV_BYPASS_AUTH=true` are set simultaneously:

```bash
NODE_ENV=production LOCAL_DEV_BYPASS_AUTH=true pnpm dev
```

Expected output:

```
FATAL: LOCAL_DEV_BYPASS_AUTH is set to "true" in NODE_ENV=production.
This would leave the entire API unprotected. Refusing to start.
```

The process exits with code 1. This is a hard process-level check, not a logged warning.

---

## 8. Verify error handling

Trigger an unhandled error inside a route handler. The server does not crash and returns a clean 500:

```json
{"error":{"code":"INTERNAL_SERVER_ERROR","message":"An unexpected error occurred"}}
```

---

## 9. Run the tests

```bash
cd apps/api
pnpm test
```

All 10 tests across 4 test files must pass:

| Test file | Tests | Coverage |
|---|---|---|
| `health.test.ts` | 2 | Health endpoint returns 200, no auth required |
| `auth.test.ts` | 3 | Bypass mode (with/without header), 401 when disabled |
| `error-handler.test.ts` | 1 | Unhandled error returns 500, server stays up |
| `production-bypass.test.ts` | 4 | Hard exit in production, allows dev, strict `"true"` check |

---

## Project structure reference

```
apps/api/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── server.ts              # Entry point — loads .env, checks production bypass, starts Fastify
    ├── app.ts                 # Fastify app factory (Pino logger, error handler, routes)
    ├── lib/
    │   └── prisma.ts          # Prisma client singleton (PrismaPg adapter)
    ├── middleware/
    │   └── auth.ts            # verifyFirebaseJWT — bypass or real Firebase verification
    ├── routes/
    │   ├── index.ts           # Route registration hub
    │   └── health.ts          # GET /health (no auth)
    ├── errors/
    │   └── handler.ts         # Centralized error handler → consistent JSON error shape
    └── __tests__/
        ├── health.test.ts
        ├── auth.test.ts
        ├── error-handler.test.ts
        └── production-bypass.test.ts
```
