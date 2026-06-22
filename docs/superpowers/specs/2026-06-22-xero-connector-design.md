# Xero Connector — Design

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan

## Goal

Add a first-class **Xero** connector so an org owner (the TeamRouter "client")
can connect their Xero accounting organisation and expose scoped Xero tools to
their employees through the MCP gateway. The connector runs server-side like the
existing built-in connectors (`STRIPE`, `POSTGRES`).

The reference implementation is the user's standalone `xero-auth.ts` /
`xero_auth.py` scripts (Xero OAuth2 authorization-code flow). **No keys,
secrets, organisation names, scopes-as-configured, or ports from those scripts
are carried into this codebase** — only the protocol shape is reused.

## Decisions (locked)

| Decision | Choice |
|---|---|
| OAuth app credentials | **Per-connector** — each client registers their own Xero app and enters Client ID + Secret. The input fields are genuinely required (each deployment has its own redirect URI). No operator-wide env vars. |
| Tool scope | **Read + full writes** — contacts, invoices, bank transactions, accounts, payments, manual journals, organisation. Writes are gated per-employee by TeamRouter's existing write-access layer. |
| Multi-organisation | **Build the picker now** — after OAuth, list all authorized Xero orgs and let the client choose which one this connector targets (auto-select when only one). |
| Setup instructions | **Inline in the wizard** — collapsible "How to set up a Xero app" steps with the exact redirect URI to copy. |

## Approaches considered

- **A. Reuse `EXTERNAL_MCP` + official `@xeroapi/xero-mcp-server`** — rejected.
  That package is a local *stdio* MCP server (`npx`); TeamRouter's external-mcp
  client only connects to *hosted* HTTP MCP servers by URL. Xero has no hosted
  MCP endpoint.
- **B. Native built-in `XERO` connector (chosen)** — new `src/connectors/xero/`
  implementing `ConnectorInstance`, doing Xero OAuth2 directly. Clean fit with
  the gateway pipeline.
- **C. Variant of B with tokens stored only in `credentialsEncrypted`** —
  rejected. Refresh tokens rotate on every refresh and the router passes
  credentials read-only; reusing the encrypted `ConnectorOAuth` row for token
  persistence is cleaner.

## Architecture

### Data model

- Add `XERO` to:
  - `ConnectorType` enum in `prisma/schema.prisma`
  - the zod `type` enum in `src/app/api/connectors/route.ts`
  - the `ConnectorType` union in `src/lib/connectors-catalog/types.ts`
- **`connector.credentialsEncrypted`** = `encrypt(JSON.stringify({ clientId, clientSecret }))`
  — the client's own Xero app credentials.
- **`connector.config`** = `{ tenantId?, tenantName?, scopes }`. `tenantId`/
  `tenantName` are set once a tenant is chosen.
- **`ConnectorOAuth` row** (reused, no schema change):
  - `serverUrl = "https://api.xero.com"` (placeholder to satisfy the non-null column)
  - `state` — transient CSRF value, cleared after callback
  - `tokensEnc` = `encrypt(JSON.stringify({ access_token, refresh_token, expires_at }))`
  - `discoveryState` (Json) — transient store for the full `/connections` list
    between the callback and the tenant-picker commit.

### OAuth flow (plain `fetch`, no MCP SDK)

New module `src/connectors/xero/oauth.ts` with Xero endpoints:
- authorize: `https://login.xero.com/identity/connect/authorize`
- token: `https://identity.xero.com/connect/token`
- connections: `https://api.xero.com/connections`

Scopes (request set): `openid offline_access accounting.contacts
accounting.settings accounting.transactions accounting.journals.read
accounting.reports.read accounting.attachments`. (Final list confirmed during
implementation; Xero silently drops unsupported ones.)

Routes:
1. `POST /api/connectors/[id]/xero/start` — admin-only. Loads the connector's
   `clientId`, generates + saves `state`, returns the authorize URL. UI redirects
   the browser to it.
2. `GET /api/connectors/xero/callback` — matches `state` to the `ConnectorOAuth`
   row, verifies org ownership, exchanges the code for tokens (with `clientSecret`),
   computes `expires_at`, saves `tokensEnc`, fetches `/connections`, and:
   - if exactly one org → write `tenantId`/`tenantName` to config, status `ACTIVE`,
     redirect to the connector detail page.
   - if multiple → stash the list in `discoveryState`, redirect to the detail page
     in a "choose org" state (status stays `PENDING`).
   - on error → status `ERROR`, redirect with error message.
3. `POST /api/connectors/[id]/xero/tenant` — admin-only. Accepts the chosen
   `tenantId`, validates it against the stashed list, writes `tenantId`/
   `tenantName` to config, clears `discoveryState`, flips status to `ACTIVE`.

**Redirect URI** registered in the Xero app = `{APP_URL}/api/connectors/xero/callback`
(from `getConfig().APP_URL`). The wizard displays this exact string to copy.

### Token refresh

`src/connectors/xero/client.ts` exports a helper used by every API call:
1. Load `tokensEnc` from the `ConnectorOAuth` row (via `config._connectorId`).
2. If `expires_at` is within ~5 minutes, POST a `refresh_token` grant using the
   connector's `clientId`/`clientSecret`, then **persist the rotated tokens**
   (Xero rotates the refresh token on every refresh — failing to save it breaks
   the next refresh).
3. Return `{ accessToken, tenantId }`.
4. On refresh failure (revoked/expired), set connector status `ERROR` so the
   existing reauth banner (`connectors/[id]/reauth-banner.tsx`) surfaces it, and
   throw.

### Connector implementation

`src/connectors/xero/index.ts` — `class XeroConnector implements ConnectorInstance`,
`type = "XERO"`, default-exported (auto-discovered by `registry.ts`).

- `listTools()` — static list (read + write tools below).
- `getOperationType(name)` — `write` if name contains `create`/`update`/`delete`,
  else `read`. (Gateway filters per-member read/write access.)
- `getNativePermissions()` — a `scopes` `string[]` permission, defaulting to the
  read scopes.
- `executeTool()` — resolves a bearer + `tenantId` via the refresh helper, calls
  `https://api.xero.com/api.xro/2.0/<resource>` with `Authorization: Bearer …`,
  `Xero-tenant-id: …`, `Accept: application/json`. Returns JSON text content;
  errors as `{ isError: true }`.
- `testConnection()` — calls `GET Organisation` and returns boolean.

Tools (v1):

| Read | Write |
|---|---|
| `xero_get_organisation` | `xero_create_contact` |
| `xero_list_contacts` | `xero_update_contact` |
| `xero_get_contact` | `xero_create_invoice` |
| `xero_list_invoices` | `xero_create_bank_transaction` |
| `xero_get_invoice` | `xero_create_payment` |
| `xero_list_bank_transactions` | `xero_create_manual_journal` |
| `xero_list_accounts` | |
| `xero_list_payments` | |
| `xero_list_manual_journals` | |

### UI

- Catalog entry `src/lib/connectors-catalog/entries/xero.ts`:
  `defineConnector({ slug: "xero", type: "XERO", label: "Xero", icon: SiXero,
  available: true, description: … })`. No `credentialField` — uses a dedicated
  wizard, like `EXTERNAL_MCP`.
- `new/[type]/page.tsx` — add a `XERO` branch rendering `<XeroWizard />`
  (mirrors the `EXTERNAL_MCP` branch; `needsCredentialField` check updated to
  exclude `XERO`).
- `XeroWizard` (`new/[type]/xero-wizard.tsx`, `"use client"`):
  - Collapsible **"How to set up a Xero app"**: create app at
    developer.xero.com, set the redirect URI to the exact callback URL shown,
    copy Client ID + Secret.
  - Inputs: **Name, Client ID, Client Secret** → `POST /api/connectors`
    (status `PENDING`, credentials = JSON of client id/secret) → `POST
    /xero/start` → `window.location.href = authorizeUrl`.
  - Styling via semantic tokens; works in light + dark mode.
- Tenant picker on the connector detail page (`connectors/[id]`): when status is
  `PENDING` with a stashed org list, render a small client component listing
  orgs; selecting one POSTs `/xero/tenant` and refreshes.

## Out of scope (v1)

- Operator-wide shared Xero app (env-var credentials).
- Webhooks / push updates from Xero.
- Pagination beyond Xero's default page size (tools accept a `page` param but no
  auto-pagination).
- Attachments upload/download.

## Verification

- `bunx tsc --noEmit`
- `bun run build`
- Manual: add connector → set up Xero app → connect → pick org → list contacts;
  verify in light **and** dark mode; verify a write tool is hidden from a
  read-only employee.

## Security notes

- Client ID/Secret encrypted at rest (`credentialsEncrypted`); tokens encrypted
  in `ConnectorOAuth.tokensEnc`. Never logged or returned by the API (the
  connectors GET route already strips `credentialsEncrypted`).
- `state` (CSRF) validated on callback; org ownership checked against the
  session's organization.
- No credentials, secrets, org names, or ports from the reference scripts are
  copied into the repo.
