import { NextResponse } from "next/server";
import { authServerMetadata } from "@/lib/oauth/metadata";

// Some MCP clients probe the OpenID Connect discovery path; serve the same
// authorization-server metadata there.
export async function GET() {
  return NextResponse.json(authServerMetadata());
}
