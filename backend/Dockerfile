FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS builder
WORKDIR /app
COPY backend/package.json ./
RUN pnpm install
COPY backend/prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma
COPY backend/src ./src
COPY backend/tsconfig*.json ./
COPY backend/nest-cli.json ./
RUN pnpm run build

FROM base AS deps
WORKDIR /app
COPY backend/package.json ./
RUN pnpm install --prod
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY backend/templates ./templates

EXPOSE 3002

CMD ["node", "dist/main"]

