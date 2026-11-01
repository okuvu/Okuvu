# Evia Therapist Portal

> Next.js 14 (App Router) portal for licensed therapists to oversee care plans, review session notes, and manage users.
> **Internal use only — Suvok Systems LLP, Bengaluru**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| API layer | tRPC v11 (server + React Query client) |
| Auth | NextAuth v4 + Amazon Cognito (therapist user pool) |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via Prisma (shared `@evia/prisma` package) |
| Shared types | `@evia/shared-types` |

---

## Prerequisites

1. **Node.js 20+** and **pnpm 9+** — install pnpm with `npm install -g pnpm`, then verify with `pnpm -v`
2. **Access to the shared Neon workspace** — see [docs/neon-setup.md](../../docs/neon-setup.md)
3. **Access to the therapist Cognito app client** — the client id, client secret and issuer URL for the therapist user pool (see [docs/AWS-CUTOVER-SPEC.md](../../docs/AWS-CUTOVER-SPEC.md)). For local UI work you can skip this and set `LOCAL_DEV_BYPASS_AUTH="true"` instead.

---

## Setup

### 1. Copy environment variables

```bash
cp apps/therapist-portal/.env.example apps/therapist-portal/.env
```

### 2. Fill in `.env`

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Your Neon branch connection string (same as the API) |
| `NEXTAUTH_SECRET` | Yes | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` or `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Local yes | `http://localhost:3001`. In ECS it is unset on purpose: NextAuth then derives the origin from the request's `Host` (with `AUTH_TRUST_HOST=true`), so `okuvu.in`, `www.okuvu.in` and `portal.okuvu.in` all complete sign-in |
| `COGNITO_THERAPIST_CLIENT_ID` | Yes | Therapist app client id from the Cognito user pool |
| `COGNITO_THERAPIST_CLIENT_SECRET` | Yes | Therapist app client secret |
| `COGNITO_ISSUER` | Yes | `https://cognito-idp.<region>.amazonaws.com/<COGNITO_THERAPIST_POOL_ID>` |
| `COGNITO_REGION` / `COGNITO_THERAPIST_POOL_ID` | Yes | Region and pool id, for reference and ops tooling |
| `LOCAL_DEV_BYPASS_AUTH` | No | `true` skips Cognito entirely for local UI work; refused when `NODE_ENV=production` |

### 3. Install dependencies (from repo root)

```bash
pnpm install
```

### 4. Run the database migration (once)

```bash
cd apps/api && pnpm prisma migrate dev && cd ../..
```

---

## Running the portal

```bash
cd apps/therapist-portal
pnpm dev
```

The portal runs on **`http://localhost:3001`** by default.

With `COGNITO_*` set, sign-in redirects to the therapist Cognito hosted UI
(email + password, then the pool's MFA challenge) and returns to
`/api/auth/callback/cognito`. Without a Cognito app client, set
`LOCAL_DEV_BYPASS_AUTH="true"` in `.env` to reach the authenticated pages
without signing in (never accepted when `NODE_ENV=production`).

---

## Available scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server (port 3001) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Type-check (`tsc --noEmit`) |
| `pnpm test` | Run the Vitest suite |

---

## Architecture

```
src/
├── app/              Next.js App Router pages and API routes
│   ├── api/          tRPC HTTP handler
│   ├── auth/         NextAuth configuration
│   ├── clients/      Client management pages
│   ├── components/   Shared UI components
│   ├── login/        Login page
│   └── page.tsx      Dashboard / home page
├── lib/              Utility functions
├── server/           tRPC server (routers, context, middleware)
├── trpc/             tRPC React Query client setup
└── types/            Portal-specific type definitions
```

Auth flow: therapist signs in through the Amazon Cognito therapist user pool (NextAuth `cognito` provider) → the `signIn` callback checks the returned email against `prisma.therapist` and rejects unknown accounts → tRPC context injects the authenticated user.

---

## Related docs

- [Contributing guide](../../CONTRIBUTING.md) — branch naming, PR process, code conventions
- [Neon local DB setup](../../docs/neon-setup.md)
- [Root README](../../README.md) — monorepo overview, environments, contacts
