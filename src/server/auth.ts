import { prisma } from "@/db";

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
  };
}
