# TeamRouter

Self-hostable MCP gateway with per-member AI tool access control. Give your team fine-grained access to databases, APIs, and AI tools — enforced through a layered permission engine with optional AI-powered filtering.

## One-Click Deploy

### Heroku

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

Deploys using the container stack with a managed PostgreSQL database. After deploy:

1. Open the app URL to create your admin account
2. Set `APP_URL` and `MCP_BASE_URL` in your Heroku config vars to match your app URL
3. Optionally add `ANTHROPIC_API_KEY` for AI-powered permission filtering

### DigitalOcean

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/ksaitor/teamrouter/tree/main)

Deploys to DigitalOcean App Platform with a managed PostgreSQL database. After deploy, update the `ENCRYPTION_KEY`, `AUTH_SECRET`, and `ANTHROPIC_API_KEY` environment variables in the App Platform dashboard.

## Quick Start (Docker)

```bash
# Clone the repo
git clone https://github.com/ksaitor/teamrouter.git
cd teamrouter

# Copy env file and set your secrets
cp .env.example .env
# Edit .env — at minimum set ENCRYPTION_KEY and AUTH_SECRET:
#   openssl rand -hex 32    → ENCRYPTION_KEY
#   openssl rand -base64 32 → AUTH_SECRET

# Start with Docker Compose
docker compose up -d
```

The admin dashboard is available at `http://localhost:3000` and the MCP server at `http://localhost:3001`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Yes | 64 hex chars for encrypting connector credentials (`openssl rand -hex 32`) |
| `AUTH_SECRET` | Yes | Secret for signing session tokens (`openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY` | No | Enables AI-powered permission filtering |
| `APP_URL` | No | Public URL of admin UI (default: `http://localhost:3000`) |
| `MCP_BASE_URL` | No | Public URL of MCP server (default: `http://localhost:3001`) |
| `MCP_PORT` | No | MCP server port (default: `3001`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | No | GitHub OAuth |
| `SMTP_URL` | No | SMTP connection string for email notifications |

## Architecture

TeamRouter runs two servers in a single process:

- **Port 3000** — Admin dashboard (Next.js) for managing members, connectors, and permissions
- **Port 3001** — MCP SSE server that team members connect their AI tools to

### Permission Engine (4 Layers)

1. **Toggles** — Simple on/off access controls (instant)
2. **Native permissions** — Connector-specific rules (instant)
3. **Custom scripts** — Admin-written JS/TS sandboxed functions (fast)
4. **AI filtering** — Post-execution Claude evaluation with caching (async)

## Development

```bash
bun install
bunx prisma generate
bunx prisma db push
bun run dev         # Admin UI on :3000
bun run mcp:dev     # MCP server on :3001
```

## License

BSL — see [LICENSE](LICENSE) for details.
