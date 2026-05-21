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

# Next.js standalone build（next.config.mjs 需有 output: 'standalone'）
RUN npm run build

# ──────────────────────────────────────────────────────────────
# Stage 3: runner
#   最小化映像：只含 standalone 產物與 production runtime
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

# 複製 Next.js standalone 產物
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 複製 Prisma schema 和 migrations（讓 prisma migrate deploy 可在啟動時執行）
COPY --from=builder /app/prisma ./prisma
# 複製 Prisma client（standalone 不會自動包含 query engine）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
# 安裝 Prisma CLI（版本與 package.json 對齊，避免 npx 抓到 latest major）
RUN npm install -g prisma@5.22.0

# 設定目錄擁有者
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# Next.js standalone 模式的入口點
CMD ["node", "server.js"]
