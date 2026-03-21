import type { MemberConnectorAccess } from "@prisma/client";
import type { PermissionResult } from "./engine";

/**
 * Layer 1: Toggle-based permission checks.
 * Instant, zero cost.
 */
export function checkToggles(
  access: MemberConnectorAccess | null,
  operationType: "read" | "write"
): PermissionResult {
  // No access record = no access
  if (!access) {
    return {
      allowed: false,
      reason: "No access configured for this connector",
      layer: "toggle",
    };
  }

  // Check read/write toggles
  if (operationType === "read" && !access.readAccess) {
    return {
      allowed: false,
      reason: "Read access is disabled for this connector",
      layer: "toggle",
    };
  }

  if (operationType === "write" && !access.writeAccess) {
    return {
      allowed: false,
      reason: "Write access is disabled for this connector",
      layer: "toggle",
    };
  }

  return { allowed: true, layer: "toggle" };
}
