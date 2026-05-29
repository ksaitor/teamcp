import { prisma } from "@/db";
import { getConnector } from "@/connectors/registry";
import { generateSlug } from "@/lib/crypto";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

type ConnectorSlugInput = { id: string; name: string; createdAt: Date };

/**
 * Map every connector in an org to a unique, human-readable slug derived from
 * its name. Numbering is deterministic (sorted by createdAt, then id) and
 * collisions are auto-suffixed (`ahrefs`, `ahrefs-2`, …), so the same connector
 * always resolves to the same slug at list time and at call time.
 */
export function computeConnectorSlugs(connectors: ConnectorSlugInput[]): Map<string, string> {
  const ordered = [...connectors].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
  const used = new Set<string>();
  const byId = new Map<string, string>();
  for (const c of ordered) {
    const base = generateSlug(c.name) || "connector";
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    byId.set(c.id, slug);
  }
  return byId;
}

/**
 * Resolve a parsed connector slug back to its Connector row within an org.
 */
export async function resolveConnectorBySlug(organizationId: string, connectorSlug: string) {
  const connectors = await prisma.connector.findMany({ where: { organizationId } });
  const slugById = computeConnectorSlugs(connectors);
  return connectors.find((c) => slugById.get(c.id) === connectorSlug) ?? null;
}

/**
 * Build a personalized list of MCP tools for a specific member.
 * Only includes tools from connectors the member has access to.
 */
export async function buildToolListForMember(
  membershipId: string,
  orgSlug: string,
  organizationId: string
): Promise<Tool[]> {
  const accessRecords = await prisma.memberConnectorAccess.findMany({
    where: { membershipId },
    include: {
      connector: {
        include: { tools: true },
      },
    },
  });

  // Compute slugs over ALL org connectors so numbering stays stable regardless
  // of which connectors this member can access.
  const allConnectors = await prisma.connector.findMany({
    where: { organizationId },
    select: { id: true, name: true, createdAt: true },
  });
  const slugById = computeConnectorSlugs(allConnectors);

  const tools: Tool[] = [];

  for (const access of accessRecords) {
    const connector = access.connector;
    if (connector.status !== "ACTIVE") continue;

    if (connector.type === "EXTERNAL_MCP") {
      // For external MCP, use cherry-picked tools from ConnectorTool
      const memberToolAccess = await prisma.memberToolAccess.findMany({
        where: {
          membershipId,
          connectorTool: { connectorId: connector.id },
        },
        include: { connectorTool: true },
      });

      for (const mta of memberToolAccess) {
        if (!mta.allowed) continue;
        if (!mta.connectorTool.enabled) continue;

        tools.push({
          name: `${orgSlug}__${slugById.get(connector.id)}__${mta.connectorTool.toolName}`,
          description: mta.connectorTool.description || undefined,
          inputSchema: (mta.connectorTool.inputSchema as any) || {
            type: "object",
            properties: {},
          },
        });
      }

      // If no specific tool access records, check if all tools should be available
      if (memberToolAccess.length === 0) {
        for (const tool of connector.tools) {
          if (!tool.enabled) continue;
          tools.push({
            name: `${orgSlug}__${slugById.get(connector.id)}__${tool.toolName}`,
            description: tool.description || undefined,
            inputSchema: (tool.inputSchema as any) || {
              type: "object",
              properties: {},
            },
          });
        }
      }
    } else {
      // Built-in connector — get tools from connector implementation
      const connectorImpl = getConnector(connector.type);
      const config = connector.config as Record<string, any>;
      const connectorTools = connectorImpl.listTools(config);

      for (const tool of connectorTools) {
        const opType = connectorImpl.getOperationType(tool.name);

        // Filter based on read/write access
        if (opType === "read" && !access.readAccess) continue;
        if (opType === "write" && !access.writeAccess) continue;

        // Prefix tool name with connector ID to avoid collisions
        tools.push({
          ...tool,
          name: `${orgSlug}__${slugById.get(connector.id)}__${tool.name}`,
          description: `[${connector.name}] ${tool.description || ""}`,
        });
      }
    }
  }

  return tools;
}

/**
 * Parse a namespaced tool name `{orgSlug}__{connectorSlug}__{toolName}` back
 * into its segments. The tool name may contain dashes, but the two `__`
 * separators are the only delimiters, so we split on the first two occurrences.
 */
export function parseToolName(namespacedName: string): {
  orgSlug: string;
  connectorSlug: string;
  toolName: string;
} {
  const first = namespacedName.indexOf("__");
  const second = first === -1 ? -1 : namespacedName.indexOf("__", first + 2);
  if (first === -1 || second === -1) {
    throw new Error(`Invalid tool name format: ${namespacedName}`);
  }
  return {
    orgSlug: namespacedName.slice(0, first),
    connectorSlug: namespacedName.slice(first + 2, second),
    toolName: namespacedName.slice(second + 2),
  };
}
