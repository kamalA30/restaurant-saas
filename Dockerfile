# ─────────────────────────────────────────
# Stage 1: Base
# ─────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./
COPY prisma ./prisma/

# ─────────────────────────────────────────
# Stage 2: Development
# ─────────────────────────────────────────
FROM base AS development
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ─────────────────────────────────────────
# Stage 3: Builder (for production)
# ─────────────────────────────────────────
FROM base AS builder
RUN npm ci --include=dev
COPY . .
RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────────────
# Stage 4: Production
# ─────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

RUN npx prisma generate

USER nestjs
EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/main"]
