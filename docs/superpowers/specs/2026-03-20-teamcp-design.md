# Teamcp — Design Specification

## Overview

Teamcp is an open-source, self-hostable MCP (Model Context Protocol) gateway that gives organizations fine-grained, per-member control over AI tool access. Each team member gets a unique, personalized MCP endpoint URL. Admins configure which data sources, tools, and permissions each member has — enforced by a layered permission engine that combines hard-coded rules with AI-powered filtering.

**License:** BSL (Business Source License) — source-available, open-core model similar to Supabase.

## Architecture

### Approach: Monolith Next.js + Separate MCP Server Port

A single deployable unit containing:
- **Next.js 15 App Router** — admin web dashboard + API routes
- **MCP SSE Server** — runs on a separate port within the same process, handles member connections
- **Background Workers** — AI filtering, notification dispatch, log cleanup

**Runtime:** Bun
**ORM:** Prisma
**Database:** PostgreSQL
**UI:** Tailwind CSS + shadcn/ui
**AI:** Anthropic Claude SDK
**MCP:** `@modelcontextprotocol/sdk`

### AI-Native Architecture Principles

The codebase is designed to be **progressively replaceable by AI**:

1. **Thin code, thick prompts** — routing logic, permission decisions, and data transformations are expressed as declarative configs and prompt templates rather than imperative code wherever possible. As tokens become cheaper, more logic migrates from code to AI.

2. **Every decision point has an AI-callable interface** — permission checks, connector routing, response filtering are all structured as functions with clear inputs/outputs that can be invoked by AI agents or by code interchangeably.

3. **Tool-schema-as-contract** — the same MCP tool definitions that members consume are used internally by AI agents to reason about operations. No separate internal API.

4. **Composable, replaceable modules** — each module (permission evaluator, filter, router) is a small, focused function with a typed contract. Easy for AI to understand, modify, or wholesale replace.

5. **Config-driven behavior** — connector configs, permission rules, and routing logic stored as data (DB/JSON), not compiled code. Changes don't require redeployment.

### Project Structure

```
teammcp/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Login, signup pages
│   │   ├── (dashboard)/        # Admin dashboard pages
│   │   │   ├── dashboard/      # Overview
│   │   │   ├── members/        # Member management
│   │   │   ├── connectors/     # Connector management
│   │   │   ├── logs/           # Audit log viewer
│   │   │   ├── approvals/      # Approval queue
│   │   │   └── settings/       # Org settings, notifications
│   │   └── api/                # API routes
│   │       ├── auth/           # Auth endpoints
│   │       ├── members/        # Member CRUD
│   │       ├── connectors/     # Connector CRUD
│   │       ├── permissions/    # Permission management
│   │       ├── approvals/      # Approval actions
│   │       └── logs/           # Log queries
│   ├── server/                 # MCP proxy server
│   │   ├── index.ts            # SSE server entrypoint (separate port)
│   │   ├── auth.ts             # Token validation, member lookup
│   │   ├── router.ts           # Routes tool calls to connectors
│   │   ├── tool-builder.ts     # Builds personalized tool lists per member
│   │   └── session.ts          # MCP session management
│   ├── connectors/             # Connector implementations
│   │   ├── interface.ts        # Base connector interface
│   │   ├── postgres/           # PostgreSQL connector
│   │   ├── mongodb/            # MongoDB connector
│   │   ├── stripe/             # Stripe connector
│   │   ├── external-mcp/       # External MCP server proxy
│   │   └── registry.ts         # Connector type registry
│   ├── permissions/            # Permission engine
│   │   ├── engine.ts           # Main pipeline orchestrator
│   │   ├── toggles.ts          # Layer 1: toggle checks
│   │   ├── native.ts           # Layer 2: connector-native permissions
│   │   ├── scripts.ts          # Layer 3: custom JS/TS script runner
│   │   └── sandbox.ts          # Isolated script execution environment
│   ├── ai/                     # AI filtering layer
│   │   ├── filter.ts           # Main AI filter orchestrator
│   │   ├── prompts.ts          # Prompt templates
│   │   ├── cache.ts            # Decision caching
│   │   └── client.ts           # Claude SDK wrapper
│   ├── audit/                  # Audit logging
│   │   ├── logger.ts           # Log writer
│   │   ├── redactor.ts         # Secret/sensitive data redaction
│   │   └── retention.ts        # Log cleanup/export
│   ├── approvals/              # Approval queue
│   │   ├── queue.ts            # Queue management
│   │   ├── notifications.ts    # Multi-channel notification dispatch
│   │   └── timeout.ts          # Approval timeout handler
│   ├── db/                     # Database
│   │   └── index.ts            # Prisma client instance
│   └── lib/                    # Shared utilities
│       ├── crypto.ts           # Token generation, encryption
│       ├── config.ts           # App configuration
│       └── errors.ts           # Error types
├── prisma/
│   └── schema.prisma           # Database schema
├── docker-compose.yml
├── Dockerfile
├── package.json
├── bunfig.toml
└── .env.example
```

## Data Model

### Prisma Schema

```prisma
model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  admins      Admin[]
  members     Member[]
  connectors  Connector[]
  settings    OrgSettings?
}

model OrgSettings {
  id                    String   @id @default(cuid())
  organizationId        String   @unique
  organization          Organization @relation(fields: [organizationId], references: [id])

  // Notification preferences
  notifyEmail           Boolean  @default(true)
  notifyWebhookUrl      String?
  notifySlackWebhookUrl String?

  // Log retention
  logRetentionDays      Int      @default(90)

  // Member auth settings
  defaultSessionDurationHours Int @default(720) // 30 days default, can be 24 for high-security
  allowedAuthProviders  Json     @default("[\"EMAIL\",\"GOOGLE\",\"GITHUB\"]") // Which auth providers members can use
  require2FA            Boolean  @default(false)

  // AI settings
  aiFilterEnabled       Boolean  @default(true)
  aiModel               String   @default("claude-sonnet-4-20250514")
  approvalTimeoutSecs   Int      @default(300)  // 5 min default
}

model Admin {
  id              String   @id @default(cuid())
  email           String
  passwordHash    String
  name            String
  role            AdminRole @default(ADMIN)
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])
  createdAt       DateTime @default(now())

  @@unique([email, organizationId])
}

enum AdminRole {
  OWNER
  ADMIN
}

model Member {
  id                  String   @id @default(cuid())
  name                String
  email               String   // Required — used for auth and invite
  organizationId      String
  organization        Organization @relation(fields: [organizationId], references: [id])
  status              MemberStatus @default(INVITED)

  // Kill switch — when set, all MCP access is blocked.
  // Stores the timestamp of when suspension began (null = not suspended).
  // Admin can suspend without removing from org or changing permissions.
  suspendedAt         DateTime?

  // Auth session config — overrides org default if set
  sessionDurationHours Int?    // e.g., 24 for daily re-auth, null = use org default

  // Global natural-language permission instructions for this member
  // e.g., "Marketing team member. No access to financial data or API keys."
  permissionInstructions String? @db.Text

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  connectorAccess     MemberConnectorAccess[]
  toolAccess          MemberToolAccess[]
  auditLogs           AuditLog[]
  approvalRequests    ApprovalRequest[]
  sessions            MemberSession[]

  @@unique([email, organizationId])
}

enum MemberStatus {
  INVITED     // Email invite sent, hasn't logged in yet
  ACTIVE      // Authenticated and active
  SUSPENDED   // Kill switch — suspendedAt is set
  REVOKED     // Permanently removed from org
}

// Member auth sessions — tracks login sessions for MCP access
model MemberSession {
  id          String   @id @default(cuid())
  memberId    String
  member      Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)

  // The MCP access token issued after successful auth
  accessToken String   @unique // crypto.randomBytes(32).toString('hex')

  // Auth provider used for this session
  authProvider AuthProvider

  expiresAt   DateTime
  createdAt   DateTime @default(now())
  lastUsedAt  DateTime @default(now())

  @@index([accessToken])
  @@index([memberId])
}

enum AuthProvider {
  EMAIL       // Magic link / email OTP
  GOOGLE      // Google OAuth
  GITHUB      // GitHub OAuth
  SSO         // Enterprise SSO (SAML/OIDC)
}

model Connector {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])
  name            String           // Display name, e.g., "Production DB"
  type            ConnectorType

  // Encrypted connection credentials (connection string, API key, etc.)
  credentialsEncrypted String @db.Text

  // Type-specific configuration (JSON)
  // e.g., for Postgres: { schemas: ["public"], readOnly: false }
  // e.g., for external MCP: { serverUrl: "https://...", transport: "sse" }
  config          Json     @default("{}")

  // Skip AI filtering for this connector (trusted source)
  skipAiFilter    Boolean  @default(false)

  status          ConnectorStatus @default(ACTIVE)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  memberAccess    MemberConnectorAccess[]
  tools           ConnectorTool[]
  auditLogs       AuditLog[]
}

enum ConnectorType {
  POSTGRES
  MONGODB
  STRIPE
  EXTERNAL_MCP
  CUSTOM         // Plugin SDK connectors
}

enum ConnectorStatus {
  ACTIVE
  DISABLED
  ERROR
}

// Discovered tools from external MCP servers
model ConnectorTool {
  id            String   @id @default(cuid())
  connectorId   String
  connector     Connector @relation(fields: [connectorId], references: [id], onDelete: Cascade)
  toolName      String
  description   String?  @db.Text
  inputSchema   Json?    // MCP tool input schema
  enabled       Boolean  @default(true)  // Global enable/disable

  memberAccess  MemberToolAccess[]

  @@unique([connectorId, toolName])
}

// Per-member access to a connector
model MemberConnectorAccess {
  id              String   @id @default(cuid())
  memberId        String
  member          Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  connectorId     String
  connector       Connector @relation(fields: [connectorId], references: [id], onDelete: Cascade)

  // Basic toggles
  readAccess      Boolean  @default(true)
  writeAccess     Boolean  @default(false)

  // Connector-native permission config (JSON)
  // e.g., Postgres: { allowedSchemas: ["public"], allowedTables: ["users", "orders"] }
  // e.g., Stripe: { scopes: ["read:charges", "read:customers"] }
  nativePermissions Json?

  // Custom JS/TS permission script
  // Function body that receives context and returns { allow, reason?, filterFields? }
  customScript    String?  @db.Text

  // Natural-language AI filtering instructions specific to this member+connector
  // e.g., "Only show orders from the US region. Never expose customer emails."
  aiInstructions  String?  @db.Text

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([memberId, connectorId])
}

// Per-member access to specific tools from external MCP servers
model MemberToolAccess {
  id              String   @id @default(cuid())
  memberId        String
  member          Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  connectorToolId String
  connectorTool   ConnectorTool @relation(fields: [connectorToolId], references: [id], onDelete: Cascade)

  allowed         Boolean  @default(true)

  // Override AI instructions for this specific tool
  aiInstructionOverride String? @db.Text

  @@unique([memberId, connectorToolId])
}

model AuditLog {
  id              String   @id @default(cuid())
  memberId        String
  member          Member   @relation(fields: [memberId], references: [id])
  connectorId     String
  connector       Connector @relation(fields: [connectorId], references: [id])
  organizationId  String

  toolName        String
  requestParams   Json?              // Input params (secrets redacted)
  responseSummary String? @db.Text   // Truncated response (first 1KB)

  aiDecision      AiDecision?
  aiReasoning     String?  @db.Text  // AI's explanation
  scriptResult    Json?              // Custom script result if applicable

  durationMs      Int?
  timestamp       DateTime @default(now())

  @@index([organizationId, timestamp])
  @@index([memberId, timestamp])
  @@index([connectorId, timestamp])
}

enum AiDecision {
  PASSED
  FILTERED
  BLOCKED
  QUEUED
  SKIPPED     // AI filter was disabled for this connector
}

model ApprovalRequest {
  id              String   @id @default(cuid())
  memberId        String
  member          Member   @relation(fields: [memberId], references: [id])
  organizationId  String

  connectorName   String
  toolName        String
  requestContext  Json              // Full context for admin review
  aiReasoning     String  @db.Text  // Why AI was uncertain

  status          ApprovalStatus @default(PENDING)
  adminResponse   String? @db.Text  // Admin's note on approve/deny
  respondedAt     DateTime?

  // If approved + update rule, the new rule to apply
  ruleUpdate      String? @db.Text

  expiresAt       DateTime          // When this auto-denies
  createdAt       DateTime @default(now())

  @@index([organizationId, status])
}

enum ApprovalStatus {
  PENDING
  APPROVED
  DENIED
  EXPIRED
}
```

## MCP Proxy Server — Request Flow

```
Member's MCP Client (Claude Desktop, Cursor, etc.)
  │
  ▼
SSE Connection to: http://host:MCP_PORT/mcp/{org-slug}
  │ (with access token in Authorization header or query param)
  ▼
┌─────────────────────────────────────┐
│  1. AUTH: Validate access token     │
│     → Look up MemberSession         │
│     → Check session not expired     │
│     → Check member status = ACTIVE  │
│     → Check suspendedAt is null     │
│     → Load member + org + perms     │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  2. TOOL LIST: Build dynamic list   │
│     → All connectors member has     │
│       access to (via MemberAccess)  │
│     → For external MCP: only        │
│       cherry-picked tools           │
│     → Return personalized tool list │
└─────────────┬───────────────────────┘
              │
              ▼ (on tool call)
┌─────────────────────────────────────┐
│  3. HARD PERMISSION CHECK           │
│     Layer 1: Toggle checks          │
│     Layer 2: Connector-native       │
│     Layer 3: Custom JS/TS script    │
│     → If any layer blocks → deny    │
│       + audit log                   │
└─────────────┬───────────────────────┘
              │ (passed)
              ▼
┌─────────────────────────────────────┐
│  4. PRE-EXECUTION AI CHECK          │
│     (write operations only)         │
│     → AI evaluates the request      │
│       against member permissions    │
│     → Can block before execution    │
└─────────────┬───────────────────────┘
              │ (passed)
              ▼
┌─────────────────────────────────────┐
│  5. EXECUTE: Call the connector     │
│     → Built-in: run query/API call  │
│     → External MCP: proxy to remote │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  6. POST-EXECUTION AI FILTER        │
│     → Response + NL permissions     │
│       sent to Claude                │
│     → Decision: pass/filter/block/  │
│       uncertain                     │
│     → uncertain → approval queue    │
│     → filter → redact + return      │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  7. AUDIT LOG                       │
│     → Full request/response logged  │
│     → AI decision recorded          │
│     → Secrets redacted in storage   │
└─────────────┬───────────────────────┘
              │
              ▼
         Return filtered response to member
```

## Permission Engine

### 4-Layer Pipeline

**Layer 1 — Toggle Checks** (instant, zero cost)
- Is the connector enabled for this member (`MemberConnectorAccess` exists)?
- Does the member have the right access type (`readAccess`/`writeAccess`)?
- For external MCP: is this specific tool allowed (`MemberToolAccess.allowed`)?

**Layer 2 — Connector-Native Permissions** (instant, zero cost)
- PostgreSQL: schema/table/column restrictions checked against the query
- MongoDB: collection-level restrictions
- Stripe: API scope validation
- External MCP: N/A (handled by Layer 1 tool cherry-picking)

**Layer 3 — Custom Script Rules** (fast, sandboxed)
- Admin writes JS/TS functions per member-connector pair
- Function signature:
  ```typescript
  type PermissionScript = (context: {
    member: { id: string; name: string; email?: string };
    connector: { id: string; name: string; type: string };
    toolName: string;
    params: Record<string, any>;
    operation: 'read' | 'write';
  }) => {
    allow: boolean;
    reason?: string;
    filterFields?: string[];  // Fields to redact from response
  };
  ```
- Runs in isolated sandbox (Bun's `Worker` or `isolated-vm`)
- No network/DB access, 100ms timeout
- Errors default to deny

**Layer 4 — AI Filtering** (post-execution, API cost)
- Only runs if Layers 1-3 passed AND connector's `skipAiFilter` is false
- Input: response data + member's NL permissions + connector-level NL instructions + tool-level NL overrides
- Claude returns: `{ decision: 'pass' | 'filter' | 'block' | 'uncertain', reasoning: string, filteredData?: any }`
- Caching: hash of (permission rules + tool + param pattern) → cached decision (TTL: 1 hour)
- Model selection: configurable per org (default: claude-sonnet-4-20250514)

## Connector Framework

### Interface

```typescript
interface Connector {
  type: ConnectorType;

  // Discovery
  listTools(config: ConnectorConfig): Tool[];
  getNativePermissions(): NativePermissionDef[];

  // Execution
  executeTool(
    toolName: string,
    params: Record<string, any>,
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult>;

  // Health
  testConnection(config: ConnectorConfig, credentials: DecryptedCredentials): Promise<boolean>;
}
```

### Built-in Connectors

| Connector | Read Tools | Write Tools | Native Permissions |
|-----------|-----------|-------------|-------------------|
| **PostgreSQL** | `query(sql)`, `list_tables()`, `describe_table(name)` | `execute(sql)` | Schema, table, column restrictions |
| **MongoDB** | `find(collection, filter)`, `list_collections()` | `insert()`, `update()`, `delete()` | Collection-level access |
| **Stripe** | `list_customers()`, `get_invoice()`, `list_charges()` | `create_refund()`, `update_customer()` | Stripe scope mapping |

### External MCP Server Proxy

1. Admin adds remote MCP server URL + optional auth
2. Teamcp connects via SSE, calls `tools/list` to discover tools
3. Each tool is stored as a `ConnectorTool` record
4. Admin cherry-picks tools per member via `MemberToolAccess`
5. At runtime: tool call is proxied to remote server → response is AI-filtered → returned to member

### Plugin SDK

- Package: `@teammcp/connector-sdk`
- Connector = a class implementing the `Connector` interface
- Registered via config file referencing local path or npm package
- Future: connector marketplace

## Admin Web Application

### Auth (Admins)
- Email/password signup (bcrypt hashed)
- Session-based auth (HTTP-only cookies)
- First user becomes org OWNER

### Auth (Members)
- **Invite flow**: Admin adds member by email → member receives invite email with link
- **Login**: Member authenticates via OAuth (Google, GitHub) or magic link (email)
- **Session**: On successful auth, a `MemberSession` is created with an `accessToken`
- **MCP auth flow**: When member connects MCP client, they are redirected to login page → authenticate → session token is issued and used for MCP endpoint access
- **Session expiry**: Configurable per org (default 30 days) or per member (e.g., 24 hours for high-security roles). Member must re-authenticate when session expires.
- **2FA**: Optional, configurable per org
- **Kill switch**: Admin can suspend a member instantly (`suspendedAt` timestamp set) — all active sessions are invalidated, MCP access blocked. No permission changes needed.

### Member Minimal Dashboard

Members have a lightweight view (not the full admin panel):

| Route | Purpose |
|-------|---------|
| `/me` | Member home: list of orgs they belong to |
| `/me/[orgSlug]` | Org view: their MCP endpoint URL, connection status, auth status |

Members cannot see or modify permissions, connectors, or other members. They only see their endpoint and which orgs they're part of.

### Admin Pages

| Route | Purpose |
|-------|---------|
| `/login`, `/signup` | Admin authentication |
| `/dashboard` | Overview: member count, active connections, recent audit entries, pending approvals |
| `/members` | List/add/remove members, copy MCP endpoint URL |
| `/members/[id]` | Member detail: connected connectors, per-connector permission config, NL instructions, custom scripts |
| `/connectors` | List connectors, add new, test connection status |
| `/connectors/[id]` | Config, credentials, for external MCP: tool list with per-tool enable/disable |
| `/logs` | Audit log table with filters: member, connector, time range, AI decision |
| `/approvals` | Pending approval queue with context, approve/deny buttons |
| `/settings` | Org settings: notification channels, AI model, log retention, approval timeout |

### UI Components
- shadcn/ui component library
- Data tables with sorting, filtering, pagination for logs and member lists
- Monaco/CodeMirror editor for custom JS/TS permission scripts
- Real-time updates for approval queue (polling or WebSocket)

## Audit Logging

### What's Logged
- Every MCP tool call (successful or denied)
- Full request params (secrets redacted via pattern matching)
- Response summary (truncated to 1KB for quick viewing)
- AI decision + reasoning
- Custom script results
- Duration

### Redaction
- Automatic pattern matching for: API keys, passwords, tokens, secrets, SSNs, credit card numbers
- Custom redaction patterns configurable per connector

### Retention
- Configurable per org (default: 90 days)
- Background job cleans up expired logs
- Export to JSON/CSV before deletion

## Approval Queue

### Flow
1. AI filter returns `uncertain` → `ApprovalRequest` created
2. Notification dispatched to admin via configured channels:
   - **In-app**: real-time badge/counter on approvals page
   - **Email**: via configurable SMTP or service (Resend/SendGrid)
   - **Webhook**: POST to configured URL with request payload
   - **Slack**: post to configured webhook URL
3. Admin reviews context (who, what tool, what data, AI reasoning)
4. Admin action:
   - **Approve** → held response delivered to member
   - **Deny** → member gets access denied
   - **Approve + Update Rule** → approve AND update NL permissions to auto-allow similar future requests
5. **Timeout**: configurable (default 5 min), auto-denies on expiry

### Member Experience During Hold
- MCP tool call hangs (waiting for response)
- If MCP client supports notifications: send "awaiting approval" notification
- On timeout: return a clear error message explaining the request required approval and timed out

## Deployment

### Docker (Primary for v1)

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"    # Admin web UI
      - "3001:3001"    # MCP SSE server
    environment:
      - DATABASE_URL=postgresql://...
      - ANTHROPIC_API_KEY=...
      - ENCRYPTION_KEY=...        # For credential encryption
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Claude API key for AI filtering |
| `ENCRYPTION_KEY` | 256-bit key for encrypting connector credentials |
| `ADMIN_PORT` | Admin web UI port (default: 3000) |
| `MCP_PORT` | MCP SSE server port (default: 3001) |
| `MCP_BASE_URL` | Public URL for MCP endpoints (for generating member URLs) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (optional) |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID (optional) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret (optional) |
| `SMTP_URL` | SMTP connection string for sending invite/auth emails |
| `APP_URL` | Public URL of the admin web app (for OAuth callbacks and invite links) |

## Security Considerations

- **Credential encryption**: All connector credentials encrypted at rest using AES-256-GCM with the `ENCRYPTION_KEY`
- **Secret token rotation**: Admin can regenerate a member's secret token (invalidates old URL)
- **Script sandboxing**: Custom permission scripts run in isolated environment — no network, no filesystem, no DB access, 100ms timeout
- **SQL injection**: For Postgres connector, parameterized queries enforced; raw SQL mode requires explicit admin opt-in
- **Audit trail**: Every access logged, immutable within retention period
- **Default deny**: When AI is uncertain, default behavior is to queue for approval (never auto-allow uncertain access)
- **Rate limiting**: Basic rate limiting on MCP endpoints to prevent abuse

## Startup & Process Model

Both servers run from a single entrypoint (`src/index.ts`):

```typescript
// src/index.ts
import { startAdminServer } from './app';        // Next.js on ADMIN_PORT
import { startMcpServer } from './server/index';  // MCP SSE on MCP_PORT

await Promise.all([
  startAdminServer(),
  startMcpServer(),
]);
```

Single process, two ports. Docker exposes both. In production, a reverse proxy (nginx/Caddy) can route by domain or path.

## Error Handling Strategy

| Failure | Behavior |
|---------|----------|
| Connector down / unreachable | Return MCP error to member with "connector unavailable" message. Log to audit. |
| AI API fails (Anthropic down) | Fall back to hard permissions only (Layers 1-3). Log that AI was skipped. Admin gets notified. |
| Custom script throws/times out | Default deny. Log the script error. Return "permission check failed" to member. |
| Approval queue timeout | Auto-deny. Member gets "request timed out awaiting approval" error. |
| Database unreachable | MCP server returns 503. Admin UI shows error page. |
| Invalid/expired session token | Return 401 on SSE connection. MCP client should redirect to auth page. |
| Member suspended (kill switch) | Return 403 with "account suspended" message. Immediate effect. |

All errors are logged to audit with appropriate context. The system never silently fails — every failure is visible in logs.

## Non-Goals for v1

- Role-based permission templates (designed for but not implemented — per-member config only)
- Multi-region deployment
- Connector marketplace
- OAuth/SSO for admin login (email/password only)
- Real-time WebSocket for approval queue (polling-based for v1)
