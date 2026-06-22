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
 *
 * This is the whole point of the catalog directory: every file under `./entries`
 * is picked up automatically, so adding a connector means adding one file and
 * nothing else. There is no shared array or import list to edit, which is what
 * keeps two connectors added in parallel from ever conflicting.
 */
const context = (
  require as unknown as {
    context(
      directory: string,
      useSubdirectories?: boolean,
      regExp?: RegExp
    ): {
      keys(): string[];
      <T>(id: string): T;
    };
  }
).context("./entries", false, /\.ts$/);

const NEUTRAL_ORDER = 100;

export const connectorCatalog: ConnectorCatalogEntry[] = context
  .keys()
  .map((key) => context<EntryModule>(key).default)
  .sort((a, b) => {
    // Available connectors first, then by explicit order, then alphabetically.
    if (a.available !== b.available) return a.available ? -1 : 1;
    const orderDelta =
      (a.order ?? NEUTRAL_ORDER) - (b.order ?? NEUTRAL_ORDER);
    if (orderDelta !== 0) return orderDelta;
    return a.label.localeCompare(b.label);
  });

export function getCatalogEntry(
  slug: string
): ConnectorCatalogEntry | undefined {
  return connectorCatalog.find((entry) => entry.slug === slug);
}
