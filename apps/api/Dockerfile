FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/prisma/package.json packages/prisma/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile

COPY packages/prisma/ packages/prisma/
COPY apps/api/ apps/api/
COPY packages/shared-types/ packages/shared-types/

RUN pnpm --filter @evia/prisma exec prisma generate
RUN pnpm --filter @evia/api build

FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/apps/api/dist ./dist

# Copy node_modules in full to preserve Prisma generated client
# (node_modules/.prisma/client/). A production-only deploy via
# `pnpm deploy --prod` would require re-running prisma generate
# in the runtime stage, which fails without prisma CLI (devDep).
# Optimisation tracked separately.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./

EXPOSE 8080

CMD ["node", "dist/server.js"]
