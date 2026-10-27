# Therapist portal — AWS ECS Fargate image.
#
# Replaces nothing: the portal previously had no container at all (it was a
# Next.js app with a Vercel-shaped build). It is built from the monorepo root
# because it imports @okuvu/prisma and @okuvu/shared-types:
#
#   docker build -f apps/therapist-portal/Dockerfile -t <registry>/evia-beta/portal:<tag> .
#
# Runs `next start` (not a static export): every tRPC procedure hits Postgres
# server-side, and NextAuth needs a Node runtime.
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

COPY packages/ packages/
COPY apps/ apps/
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @okuvu/prisma exec prisma generate
RUN pnpm --filter @okuvu/therapist-portal build

FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

ENV NODE_ENV=production
# next start binds to 0.0.0.0 by default; be explicit so the ALB target group
# health check on the container port always answers.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# The whole workspace comes across: Next's server bundle resolves workspace
# packages through the pnpm store at run time, so a hand-picked subset breaks
# with ERR_MODULE_NOT_FOUND on the first tRPC call.
COPY --from=builder /app ./

EXPOSE 3000

# Health endpoint is /api/health (a plain route handler, no auth, no DB).
CMD ["pnpm", "--filter", "@okuvu/therapist-portal", "start"]
