import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { DbOAuthClientProvider } from "@/connectors/external-mcp/oauth-provider";

const startSchema = z.object({
  // Optional manual client credentials when the server doesn't support DCR.
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const body = startSchema.parse(await req.json().catch(() => ({})));

    const connector = await prisma.connector.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const config = (connector.config ?? {}) as Record<string, any>;
    const serverUrl: string = config.serverUrl;
    if (!serverUrl) {
      return NextResponse.json(
        { error: "Connector has no serverUrl configured" },
        { status: 400 }
      );
    }

    // Reset transient flow state; seed manual client credentials if provided.
    await prisma.connectorOAuth.upsert({
      where: { connectorId: id },
      create: {
        connectorId: id,
        serverUrl,
        clientInfoEnc: body.clientId
          ? encrypt(JSON.stringify({ client_id: body.clientId, client_secret: body.clientSecret }))
          : null,
      },
      update: {
        serverUrl,
        state: null,
        codeVerifier: null,
        ...(body.clientId && {
          clientInfoEnc: encrypt(
            JSON.stringify({ client_id: body.clientId, client_secret: body.clientSecret })
          ),
        }),
      },
    });

    const provider = new DbOAuthClientProvider(id);
    const result = await auth(provider, { serverUrl });

    if (result !== "REDIRECT" || !provider.authorizationUrl) {
      return NextResponse.json(
        { error: "OAuth provider did not return an authorization URL" },
        { status: 502 }
      );
    }

    return NextResponse.json({ authorizeUrl: provider.authorizationUrl.toString() });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: `Could not start OAuth: ${error.message}` },
      { status: 502 }
    );
  }
}
