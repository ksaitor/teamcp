import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { generateToken, sha256 } from "@/lib/crypto";
import { isValidRedirectUri } from "@/lib/oauth/redirect";

// RFC 7591 Dynamic Client Registration. Clients self-register their redirect
// URIs and receive a client_id (plus client_secret for confidential clients).
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Invalid JSON" },
      { status: 400 }
    );
  }

  const redirectUris: unknown = body?.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((u) => typeof u === "string" && isValidRedirectUri(u))
  ) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be a non-empty array of valid URIs",
      },
      { status: 400 }
    );
  }

  const authMethod =
    body?.token_endpoint_auth_method === "client_secret_post"
      ? "client_secret_post"
      : "none";

  const clientId = generateToken();
  let clientSecret: string | null = null;
  let clientSecretHash: string | null = null;
  if (authMethod === "client_secret_post") {
    clientSecret = generateToken();
    clientSecretHash = sha256(clientSecret);
  }

  const grantTypes =
    Array.isArray(body?.grant_types) && body.grant_types.length > 0
      ? body.grant_types
      : ["authorization_code", "refresh_token"];

  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash,
      redirectUris: redirectUris as string[],
      clientName: typeof body?.client_name === "string" ? body.client_name : null,
      tokenEndpointAuthMethod: authMethod,
      grantTypes,
    },
  });

  return NextResponse.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod,
      grant_types: grantTypes,
      response_types: ["code"],
      ...(body?.client_name ? { client_name: body.client_name } : {}),
    },
    { status: 201 }
  );
}
