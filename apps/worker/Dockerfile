FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

COPY packages/ packages/
COPY apps/ apps/
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @evia/prisma exec prisma generate
RUN pnpm --filter @evia/worker build

FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./

EXPOSE 8080

CMD ["node", "apps/worker/dist/index.js"]
