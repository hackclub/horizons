FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
RUN pnpm install --frozen-lockfile --filter backend
COPY backend/prisma ./backend/prisma
RUN pnpm --filter backend exec prisma generate
COPY backend/src ./backend/src
COPY backend/tsconfig*.json ./backend/
COPY backend/nest-cli.json ./backend/
RUN pnpm --filter backend run build

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
RUN pnpm install --frozen-lockfile --filter backend --prod
COPY --from=builder /app/backend/generated ./backend/generated

FROM base AS runner
WORKDIR /app/backend
ENV NODE_ENV=production

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/prisma ./prisma

EXPOSE 3002

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
