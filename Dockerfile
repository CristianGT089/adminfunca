# syntax=docker/dockerfile:1
#
# Two images from one Dockerfile:
#   --target runner    the web app (Next.js standalone server): small, no build tools, no Prisma CLI
#   --target migrator  one-off job: applies the Prisma migrations (and runs the seed on demand)
# Keeping migrations out of the app image is also the first step towards a separate back end.

# ---------- base: Node + the pnpm version pinned in package.json ("packageManager") ----------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ---------- deps: every dependency, to build ----------
# Flat ("hoisted") node_modules: Next's standalone output traces files through pnpm's symlinked
# layout incompletely (e.g. @swc/helpers ends up missing at runtime).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted

# ---------- builder ----------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build

# ---------- migrator: prisma migrate deploy (default) / seed ----------
FROM base AS migrator
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod && pnpm prisma generate
# The seed imports the encryption helpers from the source.
COPY src/lib/core/crypto.ts ./src/lib/core/crypto.ts
COPY tsconfig.json ./
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs migrator
USER migrator
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---------- runner: the app; code owned by root (read-only for the app user) ----------
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

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Only Next's cache must be writable by the app user.
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next/cache

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
