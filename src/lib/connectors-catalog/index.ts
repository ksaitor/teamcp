import type { ConnectorCatalogEntry } from "./types";

export type {
  ConnectorType,
  CredentialField,
  McpPreset,
  ConnectorCatalogEntry,
} from "./types";
export { defineConnector } from "./types";

type EntryModule = { default: ConnectorCatalogEntry };

/**
 * `require.context` is a bundler primitive (webpack for `next build`, Turbopack
 * for `next dev`) that is resolved at build time into a static map of every
 * matching module — no `fs`, so it works in the client bundle the gallery needs.
 * The calls must stay as literal `require.context(...)` expressions for the
 * bundler to detect and statically resolve them.
 *
 * Entries come from two auto-discovered sources, so adding a connector means
 * adding one file (or one directory) and nothing else — there is no shared array
 * or import list to edit, which is what keeps two connectors added in parallel
 * from ever conflicting:
 *
 *  1. `src/connectors/<name>/catalog.ts` — the gallery entry co-located with a
 *     connector. For a full connector this sits alongside its `index.ts` impl;
 *     for a hosted MCP preset (EXTERNAL_MCP) the directory holds only this
 *     `catalog.ts` and reuses the shared `external-mcp` implementation. Either
 *     way everything about an integration lives in one directory. These files
 *     must stay client-safe: import only the icon, catalog `types`, and a
 *     `next/dynamic` form ref — never the connector's server-only `index.ts`.
 *  2. `./entries/*.ts` — metadata-only entries with no `src/connectors/<name>/`
 *     directory of their own: "coming soon" placeholders and the few cases (a
 *     second preset for a type that already owns its directory) that can't be
 *     co-located.
 */
type RequireContext = {
  keys(): string[];
  <T>(id: string): T;
};
type RequireWithContext = {
  context(
    directory: string,
    useSubdirectories?: boolean,
    regExp?: RegExp
  ): RequireContext;
};

// Keep these as literal `require.context(...)` calls — the bundler matches that
// exact member expression to resolve the module map; aliasing `require` breaks it.
const entriesContext = (require as unknown as RequireWithContext).context(
  "./entries",
  false,
  /\.ts$/
);
const connectorsContext = (require as unknown as RequireWithContext).context(
  "../../connectors",
  true,
  /\/catalog\.ts$/
);

function readContext(context: RequireContext): ConnectorCatalogEntry[] {
  return context.keys().map((key) => context<EntryModule>(key).default);
}

const NEUTRAL_ORDER = 100;

export const connectorCatalog: ConnectorCatalogEntry[] = [
  ...readContext(entriesContext),
  ...readContext(connectorsContext),
].sort((a, b) => {
  // Available connectors first, then by explicit order, then alphabetically.
  if (a.available !== b.available) return a.available ? -1 : 1;
  const orderDelta = (a.order ?? NEUTRAL_ORDER) - (b.order ?? NEUTRAL_ORDER);
  if (orderDelta !== 0) return orderDelta;
  return a.label.localeCompare(b.label);
});

export function getCatalogEntry(
  slug: string
): ConnectorCatalogEntry | undefined {
  return connectorCatalog.find((entry) => entry.slug === slug);
}

/**
 * Resolve the catalog entry (and thus the icon) for a saved connector. Several
 * hosted-MCP connectors share the `EXTERNAL_MCP` type, so we first match the
 * configured server URL against a known preset; otherwise we fall back to the
 * first entry declaring that type (the generic "Custom MCP Server" for
 * EXTERNAL_MCP, since it sorts first).
 */
export function getCatalogEntryForConnector(connector: {
  type: string;
  config?: unknown;
}): ConnectorCatalogEntry | undefined {
  const serverUrl =
    connector.config && typeof connector.config === "object"
      ? (connector.config as Record<string, unknown>).serverUrl
      : undefined;

  if (connector.type === "EXTERNAL_MCP" && typeof serverUrl === "string") {
    const byUrl = connectorCatalog.find(
      (entry) => entry.mcpPreset?.serverUrl === serverUrl
    );
    if (byUrl) return byUrl;
  }

  return connectorCatalog.find((entry) => entry.type === connector.type);
}
