import { getConnector } from "@/connectors/registry";
import type { PermissionResult } from "./engine";

/**
 * Layer 2: Connector-native permission checks.
 *
 * Each connector enforces its own native rules by implementing
 * `checkNativePermissions` on its `ConnectorInstance`, so the logic lives in the
 * connector's own directory rather than in a central switch here. This layer
 * just resolves the connector and delegates, tagging the result with the layer.
 */
export function checkNativePermissions(
  connectorType: string,
  nativePermissions: Record<string, any> | null,
  toolName: string,
  params: Record<string, any>,
  config?: Record<string, any> | null
): PermissionResult {
  let connector;
  try {
    connector = getConnector(connectorType);
  } catch {
    connector = undefined;
  }
  // Always delegate when the connector implements native checks: a member may
  // have no per-member overrides yet still be subject to connector-wide
  // defaults that live in `config` (e.g. Postgres CRUD permissions).
  if (connector?.checkNativePermissions) {
    const result = connector.checkNativePermissions(
      toolName,
      params,
      nativePermissions ?? {},
      config ?? undefined
    );
    return { allowed: result.allowed, reason: result.reason, layer: "native" };
  }

  return { allowed: true, layer: "native" };
}
