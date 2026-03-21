import { prisma } from "@/db";
import { getConnector } from "@/connectors/registry";
import { decrypt } from "@/lib/crypto";
import { parseToolName } from "./tool-builder";
import type { AuthenticatedMember } from "./auth";
import type { ToolResult } from "@/connectors/interface";

export interface RouteResult {
  result: ToolResult;
  connectorId: string;
  connectorName: string;
  connectorType: string;
  toolName: string;
  operationType: "read" | "write";
}

/**
 * Route a tool call to the appropriate connector and execute it.
 */
export async function routeToolCall(
  namespacedToolName: string,
  params: Record<string, any>,
  member: AuthenticatedMember
): Promise<RouteResult> {
  const { connectorId, toolName } = parseToolName(namespacedToolName);

  // Load connector and verify member access
  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, organizationId: member.organizationId },
  });

  if (!connector) {
    throw new Error("Connector not found");
  }

  if (connector.status !== "ACTIVE") {
    throw new Error("Connector is not active");
  }

  const connectorImpl = getConnector(connector.type);
  const config = connector.config as Record<string, any>;
  const credentials = { raw: decrypt(connector.credentialsEncrypted) };
  const operationType = connectorImpl.getOperationType(toolName);

  const result = await connectorImpl.executeTool(
    toolName,
    params,
    config,
    credentials
  );

  return {
    result,
    connectorId: connector.id,
    connectorName: connector.name,
    connectorType: connector.type,
    toolName,
    operationType,
  };
}
