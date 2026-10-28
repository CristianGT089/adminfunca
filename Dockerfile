# syntax=docker/dockerfile:1

# ---------- base: Node + the pnpm version pinned in package.json ("packageManager") ----------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ---------- deps: every dependency, to build ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build

# ---------- prod-deps: production dependencies only, with the Prisma client generated ----------
# prisma (migrate deploy at startup) and tsx (seed) are production dependencies on purpose.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod && pnpm prisma generate

# ---------- runner: no pnpm/corepack at runtime, code owned by root (read-only for the app) ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl tzdata
WORKDIR /app
# Colombian time: payroll months, class shifts and the times in emails are computed in the
# server's local time.
ENV TZ=America/Bogota
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
# The seed runs with tsx on the source code (it creates the first admin in production).
COPY --from=builder /app/src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Only Next's cache must be writable by the app user.
RUN chmod 0555 docker-entrypoint.sh && mkdir -p .next/cache && chown -R nextjs:nodejs .next/cache

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node_modules/.bin/next", "start"]
