import { getConnector } from "@/connectors/registry";
import { decrypt } from "@/lib/crypto";
import { parseToolName, resolveConnectorBySlug } from "./tool-builder";
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
  const { connectorSlug, toolName } = parseToolName(namespacedToolName);

  // Resolve the connector slug back to a connector within the member's org
  const connector = await resolveConnectorBySlug(member.organizationId, connectorSlug);

  if (!connector) {
    throw new Error("Connector not found");
  }

  if (connector.status !== "ACTIVE") {
    throw new Error("Connector is not active");
  }

  const connectorImpl = getConnector(connector.type);
  const config = {
    ...(connector.config as Record<string, any>),
    _connectorId: connector.id,
  };
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
