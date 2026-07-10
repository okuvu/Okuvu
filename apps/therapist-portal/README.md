# Evia Therapist Portal

> Next.js 14 (App Router) portal for licensed therapists to oversee care plans, review session notes, and manage users.
> **Internal use only — Suvok Systems LLP, Bengaluru**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| API layer | tRPC v11 (server + React Query client) |
| Auth | NextAuth v4 + Google OAuth (therapists) + Firebase Auth (server-side token verification) |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via Prisma (shared `@evia/prisma` package) |
| Shared types | `@evia/shared-types` |

---

## Prerequisites

1. **Node.js 20+** and **pnpm 9+** — install pnpm with `npm install -g pnpm`, then verify with `pnpm -v`
2. **Access to the shared Neon workspace** — see [docs/neon-setup.md](../../docs/neon-setup.md)
3. **Google OAuth credentials** — create at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials (add `http://localhost:3001/api/auth/callback/google` as an authorized redirect URI)
4. **Firebase Admin SDK** — download from Firebase Console → Project Settings → Service Accounts (optional if using the auth emulator)

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
| `NEXTAUTH_SECRET` | Yes | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | `http://localhost:3001` |
| `GOOGLE_CLIENT_ID` | Yes | From Google Cloud Console OAuth credentials |
| `GOOGLE_CLIENT_SECRET` | Yes | From Google Cloud Console OAuth credentials |
| `NEXT_PUBLIC_FIREBASE_*` | Yes | From Firebase Console → Project Settings → General → Your apps → Web |
| `FIREBASE_ADMIN_*` | Only if not using emulator | Firebase Admin SDK service account values |

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

### Option A: With Firebase Auth Emulator (recommended for local dev)

```bash
# Terminal 1 — Start the Firebase Auth Emulator
cd apps/therapist-portal
pnpm emulator

# Terminal 2 — Start the Next.js dev server
cd apps/therapist-portal
pnpm dev
```

Set these in `apps/therapist-portal/.env`:
```
FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
NEXT_PUBLIC_FIREBASE_USE_EMULATOR="true"
```

The emulator UI is available at `http://localhost:4000`.

### Option B: With real Firebase project

Leave `FIREBASE_AUTH_EMULATOR_HOST` empty and `NEXT_PUBLIC_FIREBASE_USE_EMULATOR="false"`, then:

```bash
cd apps/therapist-portal
pnpm dev
```

The portal runs on **`http://localhost:3001`** by default.

---

## Available scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server (port 3001) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run Next.js lint |
| `pnpm emulator` | Start Firebase Auth Emulator (port 9099, UI on 4000) |

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

Auth flow: therapist logs in via Google OAuth (NextAuth) → Firebase Admin SDK verifies the session server-side → tRPC context injects the authenticated user.

---

## Related docs

- [Contributing guide](../../CONTRIBUTING.md) — branch naming, PR process, code conventions
- [Neon local DB setup](../../docs/neon-setup.md)
- [Root README](../../README.md) — monorepo overview, environments, contacts
