import type { IconType } from "react-icons";

/**
 * Connector kinds. The string literals are editor hints for the connectors that
 * ship today; `(string & {})` keeps the union open so a new built-in connector
 * needs only its directory + a catalog entry — no edit here, and never a schema
 * change. The create API validates the value against the catalog at runtime.
 */
export type ConnectorType =
  | "POSTGRES"
  | "MYSQL"
  | "MONGODB"
  | "STRIPE"
  | "XERO"
  | "EXTERNAL_MCP"
  | "WEB_REQUEST"
  | "CUSTOM"
  | (string & {});

export interface CredentialField {
  label: string;
  inputType: "password" | "url";
  placeholder: string;
  /** When set, the entered value is also written to config[configKey]. */
  configKey?: string;
}

/**
 * Pre-configured external MCP server. When present on an EXTERNAL_MCP entry, the
 * custom-MCP wizard skips asking for a URL and connects straight to this server
 * (auth — usually OAuth — is still auto-detected on connect).
 */
export interface McpPreset {
  serverUrl: string;
  defaultName: string;
}

export interface ConnectorCatalogEntry {
  slug: string;
  type: ConnectorType;
  label: string;
  description: string;
  icon: IconType;
  available: boolean;
  /**
   * Optional sort weight for the gallery (lower comes first). Entries without an
   * order fall back to a neutral weight and sort alphabetically by label, so a
   * new connector never has to claim a position. Reserve low numbers for the
   * generic "build your own" entries that should stay pinned to the top.
   */
  order?: number;
  credentialField?: CredentialField;
  /** Set on EXTERNAL_MCP entries that point at a known hosted MCP server. */
  mcpPreset?: McpPreset;
}

/**
 * Identity helper that gives each entry file full type-checking without having
 * to annotate the default export. Add a connector by dropping a new file in
 * `./entries` that does `export default defineConnector({ ... })` — there is no
 * central list to edit, so two new connectors added in parallel can't conflict.
 */
export function defineConnector(
  entry: ConnectorCatalogEntry
): ConnectorCatalogEntry {
  return entry;
}
