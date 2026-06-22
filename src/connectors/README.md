# Connectors

Each subdirectory here is **one connector** (the executable side: tool list,
permissions, execution). Connectors are auto-discovered by `registry.ts` — every
directory whose `index.ts` default-exports a `ConnectorInstance` is registered
by its `type`. There is no central list to edit, so two connectors added in
parallel never merge-conflict.

This pairs with `src/lib/connectors-catalog/entries/`, which holds the
client-facing gallery metadata (label, icon, description) for the same
connectors. Implementations live here (server-only, may import `pg`, `mongodb`,
the MCP SDK, etc.); the catalog stays client-safe.

## Add a connector

1. Create `src/connectors/<name>/index.ts` implementing `ConnectorInstance`
   (see `./interface.ts`) and default-export an instance:

   ```ts
   import type { ConnectorInstance } from "../interface";

   export class MyConnector implements ConnectorInstance {
     type = "MY_TYPE"; // must be unique across connectors
     // listTools / getNativePermissions / executeTool / testConnection / getOperationType
   }

   export default new MyConnector();
   ```

2. Add the matching `type` to the `ConnectorType` enum in `prisma/schema.prisma`
   and the accepted-types list in `src/app/api/connectors/route.ts`.
3. Add a gallery entry in `src/lib/connectors-catalog/entries/<name>.ts`.

> Connectors that reuse an existing type — e.g. any hosted MCP server uses
> `EXTERNAL_MCP` — only need step 3 (a catalog entry); no new directory here.

The registry runs only inside the MCP gateway (`src/server/*`) under Bun, which
is why filesystem discovery + dynamic `import()` is used here rather than a
bundler primitive.
