import { prisma } from "@/db";
import { generateToken, sha256 } from "@/lib/crypto";

const REFRESH_TOKEN_DAYS = 90;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  scope: string | null;
}

// Mint an MCP access token (+ refresh token) for an OAuth grant. Access-token
// lifetime follows the membership / org session-duration setting; the plaintext
// refresh token is returned once and only its hash is stored.
export async function issueTokens(opts: {
  membershipId: string;
  clientId: string;
  scope: string | null;
  resource: string;
}): Promise<IssuedTokens> {
  const membership = await prisma.orgMembership.findUnique({
    where: { id: opts.membershipId },
    include: { organization: { select: { settings: true } } },
  });
  if (!membership) throw new Error("Membership not found");

  const durationHours =
    membership.sessionDurationHours ??
    membership.organization.settings?.defaultSessionDurationHours ??
    720;

  const accessToken = generateToken();
  const refreshToken = generateToken();
  const now = Date.now();

  await prisma.mcpToken.create({
    data: {
      membershipId: opts.membershipId,
      accessToken,
      clientId: opts.clientId,
      scope: opts.scope,
      resource: opts.resource,
      refreshTokenHash: sha256(refreshToken),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now + durationHours * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: durationHours * 60 * 60,
    scope: opts.scope,
  };
}
