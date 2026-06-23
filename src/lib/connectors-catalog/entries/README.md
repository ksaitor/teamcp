# Connector catalog entries

Each file here is **one metadata-only connector** in the "Add a connector"
gallery, auto-discovered at build time (`require.context` in `../index.ts`), so
there is no central list to register in.

> **Almost every connector belongs in `src/connectors/<name>/` instead — including
> hosted MCP presets.** Everything about an integration co-locates in one
> directory: a full connector keeps its impl + UI form + icon + permissions
> there, and a hosted MCP preset (`EXTERNAL_MCP`) is just a directory with a lone
> `catalog.ts` (no `index.ts`) reusing the shared `external-mcp` implementation.
> The gallery entry is always that directory's `catalog.ts`, also
> auto-discovered. See `src/connectors/README.md`.

**Only add a file here when the connector genuinely has no directory of its
own**, which is rare:

- **"Coming soon" placeholders** (`available: false`) for connectors not built
  yet — e.g. `google-analytics.ts`, `snowflake.ts`.
- **A second preset for a `type` whose directory is already taken** — e.g. the
  hosted Stripe MCP lives here because `src/connectors/stripe/` already holds the
  legacy API-key connector's `catalog.ts`, and a directory can only have one.

## Add a metadata-only entry

Create `entries/<slug>.ts`:

```ts
import { SiYourBrand } from "react-icons/si"; // or react-icons/fi
import { defineConnector } from "../types";

export default defineConnector({
  slug: "your-slug",        // must be unique; becomes /connectors/new/<slug>
  type: "EXTERNAL_MCP",     // POSTGRES | MYSQL | MONGODB | STRIPE | EXTERNAL_MCP | WEB_REQUEST | CUSTOM
  label: "Your Service",
  description: "One sentence on what data this exposes.",
  icon: SiYourBrand,        // react-icons only (Feather `fi` or Simple Icons `si`)
  available: true,          // false renders a "Coming soon" card
  // For a hosted MCP server, add a preset and the wizard skips the URL prompt:
  mcpPreset: { serverUrl: "https://mcp.example.com/mcp", defaultName: "Your Service" },
  // For key/connection-string connectors instead, add a credentialField.
});
```

Notes:

- Entries are bundled into the client (the gallery is a Client Component), so
  only import client-safe modules here — icons and `../types`, nothing that
  pulls in `pg`, `mongodb`, server config, etc.
- Ordering: the gallery lists available connectors first, then by the optional
  `order` field (lower first), then alphabetically by label. Omit `order` unless
  you need to pin a position.
