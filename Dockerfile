# ─── Stage 1: 의존성 설치 ───────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# ─── Stage 2: 빌드 ──────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# OpenSSL (Prisma 엔진 detect용)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Prisma 클라이언트 생성
RUN npx prisma generate

# Next.js 빌드
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: 실행 ──────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 nextjs

# 빌드 결과물 복사 (public 폴더 포함 — manifest/아이콘)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Prisma 런타임용 OpenSSL + 엔진 디렉터리 쓰기권한
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN chown -R nextjs:nodejs /app/node_modules/@prisma /app/node_modules/.prisma 2>/dev/null || true

USER nextjs
EXPOSE 3000

# 시작 시 비파괴 스키마 동기화 후 실행. 파괴적 변경은 수동 백업 후 별도 적용.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
