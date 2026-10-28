FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

COPY packages/ packages/
COPY apps/ apps/
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @okuvu/prisma exec prisma generate
RUN pnpm --filter @okuvu/worker build

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

# dist/index.js only re-exports buildApp (see src/index.ts) — it starts nothing,
# so the process exited 0 immediately and the API's startup assertion
# (assertWorkerReachable, A1) then killed the api task. The worker's own start
# script is `node dist/server.js`.
CMD ["node", "apps/worker/dist/server.js"]
