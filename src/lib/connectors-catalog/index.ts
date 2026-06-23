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
 *  1. `./entries/*.ts` — metadata-only entries, used for hosted MCP presets
 *     (EXTERNAL_MCP) and other connectors with no code of their own.
 *  2. `src/connectors/<name>/catalog.ts` — the gallery entry co-located with a
 *     full connector's implementation, so everything about that integration
 *     (impl, UI form, icon, permissions) lives in one directory. These files
 *     must stay client-safe: import only the icon, catalog `types`, and a
 *     `next/dynamic` form ref — never the connector's server-only `index.ts`.
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
