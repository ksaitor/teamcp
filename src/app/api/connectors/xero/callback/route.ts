import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { getConfig } from "@/lib/config";
import { parseAppCredentials, saveTokens } from "@/connectors/xero/client";
import { exchangeCode, getConnections, xeroRedirectUri } from "@/connectors/xero/oauth";

function redirect(path: string) {
  return NextResponse.redirect(new URL(path, getConfig().APP_URL));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  let session;
  try {
    session = await requireAdmin();
  } catch {
    return redirect("/login");
  }

  if (!state) {
    return redirect("/connectors?error=Missing+OAuth+state");
  }

  const oauthRow = await prisma.connectorOAuth.findUnique({
    where: { state },
    include: { connector: true },
  });

  if (
    !oauthRow ||
    oauthRow.connector.organizationId !== session.organizationId ||
    oauthRow.connector.type !== "XERO"
  ) {
    return redirect("/connectors?error=Invalid+OAuth+state");
  }

  const connectorId = oauthRow.connectorId;

  if (oauthError || !code) {
    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "ERROR" },
    });
    return redirect(
      `/connectors/${connectorId}?error=${encodeURIComponent(
        oauthError || "No authorization code returned"
      )}`
    );
  }

  try {
    const { clientId, clientSecret } = parseAppCredentials(
      decrypt(oauthRow.connector.credentialsEncrypted)
    );

    const tokens = await exchangeCode({
      code,
      clientId,
      clientSecret,
      redirectUri: xeroRedirectUri(),
    });
    await saveTokens(connectorId, tokens);

    const connections = await getConnections(tokens.access_token);
    const orgs = connections.filter((c) => c.tenantType === "ORGANISATION");

    // CSRF state is single-use.
    await prisma.connectorOAuth.update({
      where: { connectorId },
      data: { state: null },
    });

    if (orgs.length === 0) {
      await prisma.connector.update({
        where: { id: connectorId },
        data: { status: "ERROR" },
      });
      return redirect(
        `/connectors/${connectorId}?error=${encodeURIComponent(
          "No Xero organisations were authorized"
        )}`
      );
    }

    const existingConfig = (oauthRow.connector.config ?? {}) as Record<string, any>;
    const scopes = tokens.scope ? tokens.scope.split(" ") : existingConfig.scopes;

    if (orgs.length === 1) {
      const org = orgs[0];
      await prisma.connectorOAuth.update({
        where: { connectorId },
        data: { discoveryState: undefined },
      });
      await prisma.connector.update({
        where: { id: connectorId },
        data: {
          status: "ACTIVE",
          config: {
            ...existingConfig,
            tenantId: org.tenantId,
            tenantName: org.tenantName,
            scopes,
          },
        },
      });
      return redirect(`/connectors/${connectorId}`);
    }

    // Multiple organisations — stash the list and let the user pick.
    await prisma.connectorOAuth.update({
      where: { connectorId },
      data: {
        discoveryState: {
          xeroOrgs: orgs.map((o) => ({
            tenantId: o.tenantId,
            tenantName: o.tenantName,
          })),
        },
      },
    });
    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "PENDING", config: { ...existingConfig, scopes } },
    });
    return redirect(`/connectors/${connectorId}`);
  } catch (error: any) {
    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "ERROR" },
    });
    return redirect(
      `/connectors/${connectorId}?error=${encodeURIComponent(
        error.message || "Xero authentication failed"
      )}`
    );
  }
}
