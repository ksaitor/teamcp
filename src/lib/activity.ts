import { prisma } from "@/db";

/**
 * Records that a member was "active" (authed/called the MCP gateway, or sent an
 * LLM chat turn through a channel) by stamping `OrgMembership.lastActiveAt`.
 *
 * Two deliberate choices keep this off the request's critical path:
 *
 *  1. **Throttled in-process.** We only issue a write once per member per
 *     `THROTTLE_MS` window. A member hammering the gateway therefore causes one
 *     write a minute, not one per call. The cache is per-process — across
 *     several gateway/admin instances each writes at most once per window, which
 *     is fine for a "last active" signal that doesn't need second precision.
 *
 *  2. **Fire-and-forget.** The update is never awaited by the caller; failures
 *     are swallowed. A best-effort activity stamp must never slow down or fail a
 *     real MCP/LLM request.
 */
const THROTTLE_MS = 60_000;

const lastWrite = new Map<string, number>();

export function touchLastActive(membershipId: string): void {
  const now = Date.now();
  const previous = lastWrite.get(membershipId);
  if (previous && now - previous < THROTTLE_MS) return;
  lastWrite.set(membershipId, now);

  prisma.orgMembership
    .update({
      where: { id: membershipId },
      data: { lastActiveAt: new Date(now) },
    })
    .catch(() => {
      // Best-effort: drop the throttle stamp so a later call retries the write.
      lastWrite.delete(membershipId);
    });
}
