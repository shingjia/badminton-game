# ──────────────────────────────────────────────────────────────
# Stage 1: deps
#   安裝所有 npm 依賴（含 devDependencies，Prisma CLI 需要）
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ──────────────────────────────────────────────────────────────
# Stage 2: builder
#   生成 Prisma Client、執行 next build
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 生成 Prisma client（schema.prisma 需在此階段可見）
RUN npx prisma generate

# Build Next.js（不用 standalone 模式 — Next.js 文件明確禁止 standalone + custom server）
RUN npm run build

# ──────────────────────────────────────────────────────────────
# Stage 3: prod-deps
#   只裝 production deps（保留 prisma CLI 因為它在 devDependencies）
#   分一個 stage 而不直接 reuse deps stage，是為了拿到不含 dev tooling 的乾淨 node_modules
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS prod-deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json ./
# Prisma CLI 在 devDependencies 但 prod 需要跑 migrate deploy，所以全裝
RUN npm ci

# ──────────────────────────────────────────────────────────────
# Stage 4: runner
#   完整 next build artifacts + node_modules + 自訂 server.js
#   image 較大，但 custom server + Socket.IO 不能用 standalone（官方限制）
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 建立非 root 使用者
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Build artifacts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Prisma schema 與 migrations（讓 prisma migrate deploy 可執行）
COPY --from=builder /app/prisma ./prisma

# 完整 node_modules（包含 next 全套 + socket.io + prisma + 所有 transitive deps）
COPY --from=prod-deps /app/node_modules ./node_modules
# Prisma client 是 build 階段 generate 的，要從 builder 拿
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 設定目錄擁有者
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# 啟動 custom server（含 Socket.IO）
CMD ["node", "server.js"]
