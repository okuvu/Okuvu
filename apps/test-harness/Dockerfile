# Test harness — AWS ECS Fargate image.
#
# Mirrors apps/therapist-portal/Dockerfile: built from the monorepo root because
# the harness imports @okuvu/prisma, @okuvu/shared-types and (on the Bedrock
# path) apps/api's prompt/pipeline modules.
#
#   docker build -f apps/test-harness/Dockerfile -t <registry>/evia-beta/test-harness:<sha> .
#
# Runs `next start` on port 3002 (the harness's own dev/start port) — every
# tRPC procedure and the NextAuth credentials provider need a Node runtime, so
# there is no static-export path here.
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

COPY packages/ packages/
COPY apps/ apps/
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @okuvu/prisma exec prisma generate
RUN pnpm --filter @okuvu/test-harness build

FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3002
ENV NEXT_TELEMETRY_DISABLED=1

# Whole workspace, same reason as the portal: Next's server bundle resolves
# workspace packages through the pnpm store at run time.
COPY --from=builder /app ./

EXPOSE 3002

# /api/health is a plain route handler: no auth, no DB.
CMD ["pnpm", "--filter", "@okuvu/test-harness", "start"]
