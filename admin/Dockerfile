FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile --filter frontend

COPY frontend ./frontend
RUN pnpm --filter frontend run build

FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/frontend/package.json ./frontend/
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

RUN pnpm install --prod --frozen-lockfile --filter frontend

COPY --from=builder /app/frontend/build ./frontend/build

WORKDIR /app/frontend

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "./build/index.js"]
