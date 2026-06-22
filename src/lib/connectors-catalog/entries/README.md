# Connector catalog entries

Each file in this directory is **one connector** shown in the "Add a connector"
gallery. Files here are auto-discovered at build time (`require.context` in
`../index.ts`) — there is no central list to register in, so adding a connector
is a single new file and two connectors added in parallel never merge-conflict.

## Add a connector

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
