import { prisma } from "@/db";
import { getConnector } from "@/connectors/registry";
import { decrypt } from "@/lib/crypto";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Build a personalized list of MCP tools for a specific member.
 * Only includes tools from connectors the member has access to.
 */
export async function buildToolListForMember(membershipId: string): Promise<Tool[]> {
  const accessRecords = await prisma.memberConnectorAccess.findMany({
    where: { membershipId },
    include: {
      connector: {
        include: { tools: true },
      },
    },
  });

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
          name: `${connector.id}__${mta.connectorTool.toolName}`,
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
            name: `${connector.id}__${tool.toolName}`,
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
          name: `${connector.id}__${tool.name}`,
          description: `[${connector.name}] ${tool.description || ""}`,
        });
      }
    }
  }

  return tools;
}

/**
 * Parse a namespaced tool name back into connector ID and tool name.
 */
export function parseToolName(namespacedName: string): {
  connectorId: string;
  toolName: string;
} {
  const separatorIndex = namespacedName.indexOf("__");
  if (separatorIndex === -1) {
    throw new Error(`Invalid tool name format: ${namespacedName}`);
  }
  return {
    connectorId: namespacedName.substring(0, separatorIndex),
    toolName: namespacedName.substring(separatorIndex + 2),
  };
}
