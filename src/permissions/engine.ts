import { prisma } from "@/db";
import { checkToggles } from "./toggles";
import { checkNativePermissions } from "./native";
import { runCustomScript } from "./scripts";
import type { AuthenticatedMember } from "@/server/auth";

export interface PermissionContext {
  member: AuthenticatedMember;
  connectorId: string;
  connectorType: string;
  toolName: string;
  params: Record<string, any>;
  operationType: "read" | "write";
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  filterFields?: string[];
  layer: "toggle" | "native" | "script" | "ai";
}

/**
 * Run the 3-layer hard permission pipeline (Layers 1-3).
 * AI filtering (Layer 4) is handled separately after execution.
 */
export async function checkPermissions(
  ctx: PermissionContext
): Promise<PermissionResult> {
  // Load membership's access record for this connector
  const access = await prisma.memberConnectorAccess.findUnique({
    where: {
      membershipId_connectorId: {
        membershipId: ctx.member.id,
        connectorId: ctx.connectorId,
      },
    },
    include: { connector: true },
  });

  // Layer 1: Toggle checks
  const toggleResult = checkToggles(access, ctx.operationType);
  if (!toggleResult.allowed) return toggleResult;

  // For EXTERNAL_MCP, also verify tool-level access
  if (ctx.connectorType === "EXTERNAL_MCP") {
    const connectorTool = await prisma.connectorTool.findUnique({
      where: { connectorId_toolName: { connectorId: ctx.connectorId, toolName: ctx.toolName } },
    });
    if (connectorTool) {
      const toolAccess = await prisma.memberToolAccess.findUnique({
        where: { membershipId_connectorToolId: { membershipId: ctx.member.id, connectorToolId: connectorTool.id } },
      });
      if (toolAccess && !toolAccess.allowed) {
        return { allowed: false, reason: "Tool access denied", layer: "toggle" };
      }
    }
  }

  // Layer 2: Connector-native permissions
  if (access) {
    const nativeResult = checkNativePermissions(
      ctx.connectorType,
      access.nativePermissions as Record<string, any> | null,
      ctx.toolName,
      ctx.params
    );
    if (!nativeResult.allowed) return nativeResult;
  }

  // Layer 3: Custom script
  if (access?.customScript) {
    const scriptResult = await runCustomScript(access.customScript, {
      member: {
        id: ctx.member.id,
        name: ctx.member.name,
        email: ctx.member.email,
      },
      connector: {
        id: ctx.connectorId,
        name: access.connector.name,
        type: ctx.connectorType,
      },
      toolName: ctx.toolName,
      params: ctx.params,
      operation: ctx.operationType,
    });
    if (!scriptResult.allowed) return scriptResult;
    if (scriptResult.filterFields) {
      return { ...scriptResult, layer: "script" };
    }
  }

  return { allowed: true, layer: "toggle" };
}
