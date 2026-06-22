import { readdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ConnectorInstance } from "./interface";

/**
 * Connectors are auto-discovered: every sibling directory whose `index.ts`
 * default-exports a `ConnectorInstance` is registered automatically, keyed by
 * its `type`. Adding a connector means dropping in a new directory — there is
 * no central list to edit, so connectors added in parallel can't merge-conflict.
 *
 * This module is only ever loaded by the MCP gateway (`src/server/*`), which
 * runs under Bun, so plain `fs` + dynamic `import()` is available (no bundler
 * `require.context` — that wouldn't exist at runtime here). The top-level await
 * populates the map before any `getConnector` call, keeping that API synchronous.
 */
const here = dirname(fileURLToPath(import.meta.url));

const connectors: Record<string, ConnectorInstance> = {};

for (const entry of readdirSync(here, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!existsSync(join(here, entry.name, "index.ts"))) continue;

  const mod = (await import(`./${entry.name}/index.ts`)) as {
    default?: ConnectorInstance;
  };
  const instance = mod.default;

  if (!instance || typeof instance.type !== "string") {
    throw new Error(
      `Connector "${entry.name}" must default-export a ConnectorInstance`
    );
  }
  if (connectors[instance.type]) {
    throw new Error(
      `Duplicate connector type "${instance.type}" (from "${entry.name}")`
    );
  }
  connectors[instance.type] = instance;
}

export function getConnector(type: string): ConnectorInstance {
  const connector = connectors[type];
  if (!connector) {
    throw new Error(`Unknown connector type: ${type}`);
  }
  return connector;
}

export function getConnectorTypes(): string[] {
  return Object.keys(connectors);
}
