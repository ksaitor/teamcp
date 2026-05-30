import { prisma } from "@/db";
import { getConnector } from "@/connectors/registry";
import { generateSlug, base64urlSha256 } from "@/lib/crypto";
import type { Connector } from "@prisma/client";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

type ConnectorSlugInput = { id: string; name: string; createdAt: Date };

const SEP = "__";
const MAX_TOOL_NAME = 64;

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
 * Build the namespaced tool name `{connectorSlug}__{toolName}`, kept within the
 * 64-char limit that Anthropic/OpenAI enforce on tool names. Over-long names are
 * truncated with a deterministic hash suffix so they stay unique and stable
 * (the same inputs always produce the same final name, which is what lets the
 * call path resolve a name back to its connector + tool).
 */
function finalizeToolName(connectorSlug: string, toolName: string): string {
  const name = `${connectorSlug}${SEP}${toolName}`;
  if (name.length <= MAX_TOOL_NAME) return name;
  const suffix = `-${base64urlSha256(name).slice(0, 8)}`;
  return name.slice(0, MAX_TOOL_NAME - suffix.length) + suffix;
}

type MemberToolEntry = { tool: Tool; connector: Connector; toolName: string };

/**
 * Build the personalized tool entries for a member — the single source of truth
 * shared by `tools/list` (maps to MCP Tool objects) and tool-call routing (maps
 * a namespaced name back to its connector + raw tool name). Only includes tools
 * from connectors the member has access to.
 */
async function buildMemberToolEntries(
  membershipId: string,
  organizationId: string
): Promise<MemberToolEntry[]> {
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

  const entries: MemberToolEntry[] = [];

  for (const access of accessRecords) {
    const connector = access.connector;
    if (connector.status !== "ACTIVE") continue;
    const slug = slugById.get(connector.id) ?? generateSlug(connector.name) ?? "connector";

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

        entries.push({
          connector,
          toolName: mta.connectorTool.toolName,
          tool: {
            name: finalizeToolName(slug, mta.connectorTool.toolName),
            description: mta.connectorTool.description || undefined,
            inputSchema: (mta.connectorTool.inputSchema as any) || {
              type: "object",
              properties: {},
            },
          },
        });
      }

      // If no specific tool access records, check if all tools should be available
      if (memberToolAccess.length === 0) {
        for (const tool of connector.tools) {
          if (!tool.enabled) continue;
          entries.push({
            connector,
            toolName: tool.toolName,
            tool: {
              name: finalizeToolName(slug, tool.toolName),
              description: tool.description || undefined,
              inputSchema: (tool.inputSchema as any) || {
                type: "object",
                properties: {},
              },
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

        entries.push({
          connector,
          toolName: tool.name,
          tool: {
            ...tool,
            name: finalizeToolName(slug, tool.name),
            description: `[${connector.name}] ${tool.description || ""}`,
          },
        });
      }
    }
  }

  return entries;
}

/**
 * Build a personalized list of MCP tools for a specific member.
 */
export async function buildToolListForMember(
  membershipId: string,
  organizationId: string
): Promise<Tool[]> {
  const entries = await buildMemberToolEntries(membershipId, organizationId);
  return entries.map((e) => e.tool);
}

/**
 * Resolve an incoming namespaced tool name back to its connector and raw tool
 * name by recomputing the member's authoritative tool list and matching by the
 * final (possibly truncated/hashed) name. Returns null if the member has no
 * such tool.
 */
export async function resolveToolCall(
  membershipId: string,
  organizationId: string,
  namespacedName: string
): Promise<{ connector: Connector; toolName: string } | null> {
  const entries = await buildMemberToolEntries(membershipId, organizationId);
  const entry = entries.find((e) => e.tool.name === namespacedName);
  return entry ? { connector: entry.connector, toolName: entry.toolName } : null;
}
