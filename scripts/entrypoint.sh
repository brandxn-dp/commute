#!/bin/sh
# Container entrypoint.
#
# Runs the pre-flight (config validation, migrations, bootstrap) as a separate
# fatal step BEFORE the server starts. `set -e` guarantees that if the pre-flight
# exits non-zero — e.g. a failed migration (§7.2) — the container fails instead
# of serving requests against a broken schema.
set -e

echo "[entrypoint] Commute starting…"

# Pre-flight: exits non-zero on any config/migration/bootstrap failure.
node /app/dist/server/startup.cjs

# Only reached if the pre-flight succeeded.
echo "[entrypoint] Pre-flight OK — starting server on port ${PORT:-3000}"
exec node /app/server.js
