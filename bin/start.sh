#!/bin/sh
set -e

# On PaaS platforms like Heroku, PORT is set automatically.
# Next.js standalone server.js reads PORT env var.
# MCP server reads MCP_PORT (defaults to 3001).

# Set APP_URL and MCP_BASE_URL from PORT if not already set
export APP_URL="${APP_URL:-http://localhost:${PORT:-3000}}"
export MCP_BASE_URL="${MCP_BASE_URL:-http://localhost:${MCP_PORT:-3001}}"

echo "Starting TeamMCP..."
echo "  Admin UI:   port ${PORT:-3000}"
echo "  MCP Server: port ${MCP_PORT:-3001}"

# Sync the database schema before starting (non-fatal: if it fails the app
# still boots and serves a friendly DB connection error instead of crashing).
if [ -n "$DATABASE_URL" ]; then
  echo "Syncing database schema..."
  bunx prisma db push || echo "WARNING: schema sync failed — app will show a DB connection error"
else
  echo "WARNING: DATABASE_URL is not set — skipping schema sync"
fi

# Start both servers
exec bun run server.js &
NEXT_PID=$!

bun run src/server/index.ts &
MCP_PID=$!

# Wait for either process to exit
wait -n $NEXT_PID $MCP_PID 2>/dev/null || wait $NEXT_PID $MCP_PID
