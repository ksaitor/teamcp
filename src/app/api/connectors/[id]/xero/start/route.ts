import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { parseAppCredentials } from "@/connectors/xero/client";
import { buildAuthorizeUrl, xeroRedirectUri } from "@/connectors/xero/oauth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const connector = await prisma.connector.findFirst({
      where: { id, organizationId: session.organizationId, type: "XERO" },
    });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const { clientId } = parseAppCredentials(decrypt(connector.credentialsEncrypted));

    const state = randomBytes(24).toString("hex");
    await prisma.connectorOAuth.upsert({
      where: { connectorId: id },
      create: { connectorId: id, serverUrl: "https://api.xero.com", state },
      update: { state, serverUrl: "https://api.xero.com" },
    });

    const authorizeUrl = buildAuthorizeUrl({
      clientId,
      redirectUri: xeroRedirectUri(),
      state,
    });

    return NextResponse.json({ authorizeUrl });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Could not start Xero sign-in" },
      { status: error.statusCode || 500 }
    );
  }
}
