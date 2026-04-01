FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY admin/package.json ./admin/
RUN pnpm install --frozen-lockfile --filter admin

COPY admin ./admin
RUN pnpm --filter admin run build

FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/admin/package.json ./admin/
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

RUN pnpm install --prod --frozen-lockfile --filter admin

COPY --from=builder /app/admin/build ./admin/build

WORKDIR /app/admin

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "./build/index.js"]
