#!/bin/sh
set -e

# On PaaS platforms like Heroku, PORT is set automatically.
# The unified server (server.ts) serves both the admin UI and the MCP gateway
# on a single port (PORT, defaults to 3000).

# Set APP_URL from PORT if not already set. The MCP endpoint shares the app
# origin, so MCP_BASE_URL defaults to APP_URL.
export APP_URL="${APP_URL:-http://localhost:${PORT:-3000}}"
export MCP_BASE_URL="${MCP_BASE_URL:-$APP_URL}"

echo "Starting TeamRouter..."
echo "  Server: port ${PORT:-3000} (admin UI + MCP gateway)"

# Sync the database schema before starting (non-fatal: if it fails the app
# still boots and serves a friendly DB connection error instead of crashing).
if [ -n "$DATABASE_URL" ]; then
  echo "Syncing database schema..."
  bunx prisma db push || echo "WARNING: schema sync failed — app will show a DB connection error"
else
  echo "WARNING: DATABASE_URL is not set — skipping schema sync"
fi

# Start the unified server (admin UI + MCP gateway on one port)
exec bun run server.ts
