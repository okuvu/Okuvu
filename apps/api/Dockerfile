FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

COPY packages/ packages/
COPY apps/ apps/
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @evia/prisma exec prisma generate
RUN pnpm --filter @evia/api build

FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy api-level node_modules first (pnpm symlinks to direct deps)
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

# Copy root node_modules (.pnpm store + Prisma generated client)
COPY --from=builder /app/node_modules ./node_modules

# Copy workspace packages
COPY --from=builder /app/packages ./packages

COPY --from=builder /app/package.json ./

EXPOSE 8080

CMD ["node", "apps/api/dist/server.js"]
