# syntax=docker/dockerfile:1
#
# Multi-stage, multi-arch (linux/amd64 required, linux/arm64 supported) build.
# Every base image is pinned (operational requirement §7.1) — no floating tags.

# ---- Build stage ----------------------------------------------------------
FROM node:22.15.0-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies from the committed lockfile (deterministic; no floating
# versions ever resolved at build or runtime).
COPY package.json package-lock.json ./
RUN npm ci

# Build the Next.js standalone server and bundle the ops scripts (pre-flight,
# migrator, CLI) into self-contained JS so the runtime needs neither a package
# manager nor tsx.
COPY . .
RUN npm run build && npm run build:ops

# ---- Runtime stage --------------------------------------------------------
FROM node:22.15.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle

# Run as a non-root user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs commute

# Next.js standalone server output (includes only the traced production deps).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Self-contained ops bundles and the plain-SQL migrations they apply.
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && chown -R commute:nodejs /app
USER commute

EXPOSE 3000

# Health check verifies schema, not just liveness (§7.3): /api/health returns
# 503 if the DB is unreachable or required tables are missing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
