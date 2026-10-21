FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app/gateway
COPY gateway/package.json ./
RUN pnpm install

FROM base AS builder
WORKDIR /app/gateway
COPY --from=deps /app/gateway/node_modules ./node_modules
COPY gateway/ .
RUN pnpm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV USER_SERVICE_URL=http://unified-service:3002
ENV MAIL_SERVICE_URL=http://unified-service:3002
ENV UI_SERVICE_URL=http://lark-ui:5173

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressapp

COPY --from=builder --chown=expressapp:nodejs /app/gateway/dist ./dist
COPY --from=builder --chown=expressapp:nodejs /app/gateway/package.json ./package.json
COPY --from=deps --chown=expressapp:nodejs /app/gateway/node_modules ./node_modules

USER expressapp

EXPOSE 3000

CMD ["node", "dist/main.js"]
