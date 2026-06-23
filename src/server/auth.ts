import { prisma } from "@/db";
import { touchLastActive } from "@/lib/activity";

export interface AuthenticatedMember {
  id: string; // OrgMembership ID
  userId: string;
  name: string;
  email: string;
  organizationId: string;
  orgSlug: string;
  status: string;
  suspendedAt: Date | null;
  permissionInstructions: string | null;
  responsibilities: string | null;
  jobTitle: string | null;
}

/**
 * Validate an MCP access token.
 * Returns the authenticated membership or null.
 */
export async function authenticateMcpToken(
  accessToken: string
): Promise<AuthenticatedMember | null> {
  const token = await prisma.mcpToken.findUnique({
    where: { accessToken },
    include: {
      membership: {
        include: {
          user: { select: { name: true, email: true } },
          organization: { select: { slug: true } },
        },
      },
    },
  });

  if (!token) return null;
  if (token.expiresAt < new Date()) return null;

  const membership = token.membership;
  if (membership.status !== "ACTIVE") return null;
  if (membership.suspendedAt) return null;

  // Update last used timestamp
  await prisma.mcpToken.update({
    where: { id: token.id },
    data: { lastUsedAt: new Date() },
  });

  // Every authenticated MCP request (auth, tool list, tool call, AI filter)
  // flows through here, so this single touch covers "authed" and "mcp call".
  touchLastActive(membership.id);

  return {
    id: membership.id,
    userId: membership.userId,
    name: membership.user.name || "",
    email: membership.user.email,
    organizationId: membership.organizationId,
    orgSlug: membership.organization.slug,
    status: membership.status,
    suspendedAt: membership.suspendedAt,
    permissionInstructions: membership.permissionInstructions,
    responsibilities: membership.responsibilities,
    jobTitle: membership.jobTitle,
  };
}
