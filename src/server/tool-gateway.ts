import { prisma } from "@/db";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool gateway ("Approach B"): instead of advertising every tool a member can
 * access — which overflows provider tool-count limits — gateway mode advertises
 * only the two meta-tools below. The model uses `search_tools` to discover the
 * tools it needs by keyword, then `run_tool` to invoke one by its namespaced
 * name. This scales to unlimited tools and behaves identically on the channel
 * bots and the external MCP endpoint.
 *
 * `run_tool` forwards to the normal execution pipeline, so all permission layers
 * still apply. This module holds only pure helpers (no imports of tool-builder
 * or execute) to keep the dependency graph acyclic; the actual meta-tool
 * dispatch lives in `execute.ts`.
 */

export const SEARCH_TOOLS = "search_tools";
export const RUN_TOOL = "run_tool";

export const META_TOOLS: Tool[] = [
  {
    name: SEARCH_TOOLS,
    description:
      "Search the tools available to you by keyword. Returns matching tools with their names, descriptions, and input schemas. Call this first to discover which tool to use, then invoke it with run_tool.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keywords describing what you want to do (e.g. 'create a lead', 'list opportunities').",
        },
        limit: {
          type: "number",
          description: "Max number of tools to return (default 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: RUN_TOOL,
    description:
      "Invoke one of the tools returned by search_tools. Pass the tool's exact `name` and an `arguments` object matching that tool's input schema.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The exact tool name returned by search_tools.",
        },
        arguments: {
          type: "object",
          description: "Arguments for the tool, matching its input schema.",
        },
      },
      required: ["name"],
    },
  },
];

const META_TOOL_NAMES = new Set([SEARCH_TOOLS, RUN_TOOL]);

export function isMetaTool(name: string): boolean {
  return META_TOOL_NAMES.has(name);
}

/** Whether the org has switched its members into gateway mode. */
export async function isGatewayEnabled(organizationId: string): Promise<boolean> {
  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
    select: { toolGatewayMode: true },
  });
  return settings?.toolGatewayMode === "on";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Dependency-free lexical ranking over the member's authorized tools. Scores
 * each tool by keyword overlap against its name (weighted highest), connector
 * name, and description. This is intentionally simple — an embedding-based
 * ranker can replace it later behind the same call site.
 */
export function rankTools<T extends { tool: Tool; connectorName: string }>(
  query: string,
  entries: T[],
  limit: number
): T[] {
  const terms = tokenize(query);
  if (terms.length === 0) return entries.slice(0, limit);

  const scored = entries.map((entry) => {
    const nameTokens = tokenize(entry.tool.name);
    const connectorTokens = tokenize(entry.connectorName);
    const descTokens = tokenize(entry.tool.description || "");
    const nameSet = new Set(nameTokens);
    const connectorSet = new Set(connectorTokens);
    const descSet = new Set(descTokens);

    let score = 0;
    for (const term of terms) {
      if (nameSet.has(term)) score += 5;
      else if (nameTokens.some((t) => t.startsWith(term) || term.startsWith(t)))
        score += 3;
      if (connectorSet.has(term)) score += 2;
      if (descSet.has(term)) score += 1;
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

/** Format search hits as readable JSON text for the model. */
export function formatSearchResults(tools: Tool[]): string {
  if (tools.length === 0) {
    return "No matching tools found. Try different keywords.";
  }
  return JSON.stringify(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    null,
    2
  );
}
