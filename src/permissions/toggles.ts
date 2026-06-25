import type { MemberConnectorAccess } from "@prisma/client";
import type { PermissionResult } from "./engine";

/**
 * Layer 1: Toggle-based permission checks.
 * Instant, zero cost.
 */
export function checkToggles(
  access: MemberConnectorAccess | null,
  operationType: "read" | "write",
  enforceReadWrite = true
): PermissionResult {
  // No access record = no access
  if (!access) {
    return {
      allowed: false,
      reason: "No access configured for this connector",
      layer: "toggle",
    };
  }

  // Paused = temporarily suspended; block everything without losing config.
  if (access.paused) {
    return {
      allowed: false,
      reason: "Access to this connector is paused",
      layer: "toggle",
    };
  }

  // Check read/write toggles. Some connectors (e.g. Postgres) own the
  // read/write distinction through fine-grained native permissions, so the
  // engine disables this coarse gate for them — see checkPermissions.
  if (enforceReadWrite) {
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
  }

  return { allowed: true, layer: "toggle" };
}
