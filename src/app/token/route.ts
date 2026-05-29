import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { sha256 } from "@/lib/crypto";
import { verifyPkceS256 } from "@/lib/oauth/pkce";
import { issueTokens } from "@/lib/oauth/issue";

function err(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status }
  );
}

function tokenResponse(t: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string | null;
}) {
  return NextResponse.json(
    {
      access_token: t.accessToken,
      token_type: "Bearer",
      expires_in: t.expiresIn,
      refresh_token: t.refreshToken,
      ...(t.scope ? { scope: t.scope } : {}),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Verify client authentication against the registered auth method.
async function authenticateClient(
  clientId: string,
  clientSecret: string | null
) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return null;
  if (client.tokenEndpointAuthMethod === "client_secret_post") {
    if (!clientSecret || !client.clientSecretHash) return null;
    if (sha256(clientSecret) !== client.clientSecretHash) return null;
  }
  return client;
}

export async function POST(req: NextRequest) {
  let form: URLSearchParams;
  try {
    const text = await req.text();
    form = new URLSearchParams(text);
  } catch {
    return err("invalid_request", "Could not parse form body");
  }

  const grantType = form.get("grant_type");
  const clientId = form.get("client_id") || "";
  const clientSecret = form.get("client_secret");

  if (!clientId) return err("invalid_client", "client_id required", 401);
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) return err("invalid_client", "Client authentication failed", 401);

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const redirectUri = form.get("redirect_uri");
    const codeVerifier = form.get("code_verifier");
    if (!code || !redirectUri || !codeVerifier)
      return err("invalid_request", "code, redirect_uri and code_verifier required");

    const record = await prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash: sha256(code) },
    });
    if (!record) return err("invalid_grant", "Unknown code");
    if (record.clientId !== clientId)
      return err("invalid_grant", "Code was issued to a different client");
    if (record.redirectUri !== redirectUri)
      return err("invalid_grant", "redirect_uri mismatch");
    if (record.expiresAt < new Date()) return err("invalid_grant", "Code expired");
    if (!verifyPkceS256(codeVerifier, record.codeChallenge))
      return err("invalid_grant", "PKCE verification failed");

    // Single-use: consume atomically; a second redemption finds 0 rows.
    const consumed = await prisma.oAuthAuthorizationCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) return err("invalid_grant", "Code already used");

    const tokens = await issueTokens({
      membershipId: record.membershipId,
      clientId,
      scope: record.scope,
      resource: record.resource,
    });
    return tokenResponse(tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken) return err("invalid_request", "refresh_token required");

    const existing = await prisma.mcpToken.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
    if (!existing || !existing.refreshExpiresAt)
      return err("invalid_grant", "Unknown refresh token");
    if (existing.clientId !== clientId)
      return err("invalid_grant", "Refresh token was issued to a different client");
    if (existing.refreshExpiresAt < new Date())
      return err("invalid_grant", "Refresh token expired");

    // Rotate: issue a fresh access/refresh pair and revoke the old token.
    const tokens = await issueTokens({
      membershipId: existing.membershipId,
      clientId,
      scope: existing.scope,
      resource: existing.resource || "",
    });
    await prisma.mcpToken.delete({ where: { id: existing.id } });
    return tokenResponse(tokens);
  }

  return err("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
}
