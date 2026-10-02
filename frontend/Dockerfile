# ── Stage 1: Dependency installer ─────────────────────────────────────────────
# Install only production-relevant node_modules using the lockfile.
FROM node:22-alpine AS deps
# libc6-compat is required for some native bindings on Alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN npm install -g pnpm@latest --ignore-scripts && \
    pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 2: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./

RUN npm run build

# ── Stage 3: Production runner ────────────────────────────────────────────────
# Uses the Next.js standalone output — only includes the server bundle,
# static assets and a minimal node_modules. Target image size < 150 MB.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root for security — FE-HARD-50
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only what the standalone server needs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Lightweight healthcheck — avoids pulling extra deps
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
