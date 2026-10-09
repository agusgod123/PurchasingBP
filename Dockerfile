# syntax=docker/dockerfile:1.7
# =====================================================================
# e-Pengadaan — image untuk server sendiri (on-premise / VPS).
# Untuk Vercel/Netlify image ini TIDAK diperlukan.
#
#   docker build -t e-pengadaan .
#   docker build --target migrator -t e-pengadaan-migrator .
# =====================================================================
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Dependensi -------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build ------------------------------------------------------------
FROM deps AS build
COPY . .
# Zona waktu ditanam saat build (dipakai juga di browser).
ARG NEXT_PUBLIC_APP_TIMEZONE=Asia/Makassar
ENV NEXT_PUBLIC_APP_TIMEZONE=${NEXT_PUBLIC_APP_TIMEZONE} NEXT_OUTPUT=standalone
RUN pnpm run build

# --- Migrator: menjalankan migrasi lalu selesai -------------------------
FROM build AS migrator
ENV NODE_ENV=production
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm run db:seed"]

# --- Runtime ----------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    STORAGE_DRIVER=local STORAGE_LOCAL_PATH=/data/storage
# Runtime tidak butuh paket OS tambahan: Node membawa CA sendiri dan Prisma 7 (driver adapter) tanpa engine native.
RUN mkdir -p /data/storage && chown -R node:node /data
WORKDIR /app
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
VOLUME ["/data/storage"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
