# Connectors

Each subdirectory here is **one connector**, and ideally **everything** about
that integration lives in this single directory — the implementation, the admin
UI form, the gallery metadata, the icon, and the native permission checks. That
keeps an integration self-contained: easy to reason about, and two connectors
added in parallel never touch the same file.

Discovery is automatic, so there is no central list to edit:

- **`registry.ts`** scans every `<name>/index.ts` that default-exports a
  `ConnectorInstance` and registers it by its `type` (server-only, Bun runtime).
- **`src/lib/connectors-catalog`** scans every `<name>/catalog.ts` (plus its own
  `entries/*.ts`) for the client-facing gallery metadata.

## Files in a connector directory

| File | Loaded by | Purpose |
|---|---|---|
| `index.ts` | MCP gateway (server) | The `ConnectorInstance`: tools, execution, `testConnection`, `getOperationType`, native permission **definitions** (`getNativePermissions`) and **enforcement** (`checkNativePermissions`). May import server-only deps (`pg`, `@aws-sdk/*`, the MCP SDK…). |
| `catalog.ts` | Gallery (client) + add-connector page | The `ConnectorCatalogEntry` (label, description, icon, `available`, optional `form`/`credentialField`). **Must stay client-safe** — import only the icon, catalog `types`, and a `next/dynamic` form ref. Never import `./index.ts`. |
| `form.tsx` *(optional)* | Add-connector page (client) | A `"use client"` setup form for connectors that need more than one field. Referenced from `catalog.ts` via `next/dynamic` and rendered generically by the page — no routing edit needed. |
| `types.ts` *(optional)* | both | Shared types (config/credentials). Type-only, so it's safe to import from either side. |

## Add a connector

1. Create `src/connectors/<name>/index.ts` implementing `ConnectorInstance`
   (see `./interface.ts`) and default-export an instance:

   ```ts
   import type { ConnectorInstance } from "../interface";

   export class MyConnector implements ConnectorInstance {
     type = "MY_TYPE"; // must be unique across connectors
     // listTools / getNativePermissions / executeTool / testConnection /
     // getOperationType / (optional) checkNativePermissions
   }

   export default new MyConnector();
   ```

   Enforce native (Layer 2) permissions right here with `checkNativePermissions`
   — return `{ allowed, reason? }`; the permission engine tags the layer. No edit
   to `src/permissions/native.ts` is needed for new connectors.

2. Create `src/connectors/<name>/catalog.ts` with a **matching `type`**:

   ```ts
   import { FiBox } from "react-icons/fi";
   import { defineConnector } from "@/lib/connectors-catalog/types";

   export default defineConnector({
     slug: "my-connector",   // becomes /connectors/new/<slug>
     type: "MY_TYPE",
     label: "My Connector",
     description: "One sentence on what data this exposes.",
     icon: FiBox,
     available: true,
     // For a single field, add `credentialField`. For a richer setup, add a form:
     // form: dynamic(() => import("./form").then((m) => m.MyForm)),
   });
   ```

   The catalog is the single source of truth for valid types — the create API
   (`src/app/api/connectors/route.ts`) validates against it, and `Connector.type`
   is a plain `String` column, so **no Prisma schema or enum change is ever
   needed** to add a connector.

3. *(Optional)* Add `src/connectors/<name>/form.tsx` (a `"use client"` component
   that POSTs to `/api/connectors`) and reference it from `catalog.ts` via
   `next/dynamic` as shown above.

> Connectors that reuse an existing type — e.g. any hosted MCP server uses
> `EXTERNAL_MCP` — have no code of their own, so they live as a metadata-only
> file in `src/lib/connectors-catalog/entries/` instead of a directory here.

The registry runs only inside the MCP gateway (`src/server/*`) under Bun, which
is why filesystem discovery + dynamic `import()` is used there rather than a
bundler primitive; the catalog uses `require.context` so it can run in the
client gallery bundle.
