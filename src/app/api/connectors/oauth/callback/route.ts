import { NextRequest, NextResponse } from "next/server";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { DbOAuthClientProvider } from "@/connectors/external-mcp/oauth-provider";
import { discoverAndStoreTools } from "@/connectors/external-mcp/discovery";

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

  if (!oauthRow || oauthRow.connector.organizationId !== session.organizationId) {
    return redirect("/connectors?error=Invalid+OAuth+state");
  }

  const connectorId = oauthRow.connectorId;

  if (oauthError || !code) {
    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "ERROR" },
    });
    return redirect(
      `/connectors/${connectorId}?error=${encodeURIComponent(oauthError || "No authorization code returned")}`
    );
  }

  try {
    const provider = new DbOAuthClientProvider(connectorId);
    const result = await auth(provider, {
      serverUrl: oauthRow.serverUrl,
      authorizationCode: code,
    });
    if (result !== "AUTHORIZED") {
      throw new Error("Token exchange did not complete");
    }

    await prisma.connectorOAuth.update({
      where: { connectorId },
      data: { state: null, codeVerifier: null },
    });

    await discoverAndStoreTools(connectorId);

    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "ACTIVE" },
    });

    return redirect(`/connectors/${connectorId}`);
  } catch (error: any) {
    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "ERROR" },
    });
    return redirect(
      `/connectors/${connectorId}?error=${encodeURIComponent(error.message || "OAuth failed")}`
    );
  }
}
